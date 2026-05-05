/**
 * FineractFDService — Fixed Deposit operations for P2P Investment
 * ──────────────────────────────────────────────────────────
 * Port from HD-AMC FineractFixedDepositService.js → NestJS Injectable.
 * FD Product mapping: Loan Product shortName → FD Product shortName (same prefix P*).
 *
 * Operations:
 *  - Find FD product by shortName (matching setup-fd-products.ts)
 *  - Create FD account + approve + activate
 *  - Get FD account details
 *  - Close FD (premature)
 *  - Calculate interest
 */
import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { type AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

import { FINERACT_AXIOS_CLIENT } from '../fineract.constants';
import { FineractBaseService } from './fineract-base.service';

export interface FDAccountResult {
  accountId: number;
  accountNo: string;
  status: string;
}

export interface FDAccountDetails {
  accountId: number;
  accountNo: string;
  balance: number;
  interestAccrued: number;
  maturityDate: Date | null;
  status: string;
  depositAmount: number;
  interestRate: number;
}

@Injectable()
export class FineractFDService extends FineractBaseService {
  private readonly fdLogger = new Logger(FineractFDService.name);

  constructor(
    @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
    configService: ConfigService,
  ) {
    super(configService);
  }

  private parseFineractDate(value: any): string | null {
    if (!value) return null;
    if (Array.isArray(value) && value.length >= 3) {
      const [year, month, day] = value;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
    }
    return null;
  }

  private async getClientSafeSubmittedOnDate(clientId: number): Promise<string> {
    let submittedOnDate = this.getTodayFormatted('iso');

    try {
      const clientInfo = await this.client.get(`/clients/${clientId}`);
      const activationDate = this.parseFineractDate(clientInfo.data?.activationDate);
      if (activationDate && submittedOnDate < activationDate) {
        submittedOnDate = activationDate;
      }
    } catch (error: any) {
      this.fdLogger.warn(`[createFixedDeposit] Could not fetch client activation date: ${error.message}`);
    }

    return submittedOnDate;
  }

  private async getFixedDepositTemplate(clientId: number, productId: number): Promise<any | null> {
    try {
      const response = await this.client.get('/fixeddepositaccounts/template', {
        params: { clientId, productId },
      });
      return response.data || null;
    } catch (error: any) {
      this.fdLogger.warn(`[createFixedDeposit] Could not fetch FD template: ${error.message}`);
      return null;
    }
  }

  private async getFDProductDetails(productId: number): Promise<any | null> {
    try {
      const response = await this.client.get(`/fixeddepositproducts/${productId}`);
      return response.data || null;
    } catch (error: any) {
      this.fdLogger.warn(`[createFixedDeposit] Could not fetch FD product ${productId}: ${error.message}`);
      return null;
    }
  }

  private normalizeDepositAmount(depositAmount: number, productDetails: any): number {
    const rawAmount = Number(depositAmount) || 0;
    const rawStep = Number(productDetails?.currency?.inMultiplesOf ?? productDetails?.inMultiplesOf ?? 1);
    const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
    const minDeposit = Number(productDetails?.minDepositAmount ?? 0);
    const maxDeposit = Number(productDetails?.maxDepositAmount ?? 0);

    let normalized = Math.round(rawAmount / step) * step;

    if (Number.isFinite(minDeposit) && minDeposit > 0 && normalized < minDeposit) {
      normalized = Math.ceil(minDeposit / step) * step;
    }

    if (Number.isFinite(maxDeposit) && maxDeposit > 0 && normalized > maxDeposit) {
      normalized = Math.floor(maxDeposit / step) * step;
    }

    if (normalized !== rawAmount) {
      this.fdLogger.log(`[createFixedDeposit] depositAmount normalized ${rawAmount} -> ${normalized} (step=${step})`);
    }

    return normalized;
  }

  private buildFDAccountNo(): string {
    const unique = `${Date.now().toString().slice(-10)}${Math.floor(10 + Math.random() * 90)}`;
    return `FD${unique}`;
  }

  private isSavingsIntegrityError(error: any): boolean {
    const errorText = JSON.stringify(error.response?.data || error.message || '').toLowerCase();
    return errorText.includes('data integrity') || errorText.includes('savings account') || errorText.includes('externalid');
  }

  private async postFixedDepositAccount(
    payload: Record<string, any>,
    submittedOnDate: string,
  ): Promise<FDAccountResult> {
    const response = await this.client.post('/fixeddepositaccounts', payload);
    const accountId = response.data.savingsId || response.data.resourceId;

    if (!accountId) {
      throw new BadRequestException('Fineract did not return a Fixed Deposit account id');
    }

    this.fdLogger.log(`FD created: ID=${accountId}`);

    await this.approveFixedDeposit(accountId, submittedOnDate);
    await this.activateFixedDeposit(accountId, submittedOnDate);

    let accountNo = response.data.accountNo || payload.accountNo || '';
    try {
      const details = await this.getFixedDepositDetails(accountId);
      accountNo = details.accountNo || accountNo;
    } catch (error: any) {
      this.fdLogger.warn(`[createFixedDeposit] Could not fetch FD ${accountId} account number: ${error.message}`);
    }

    return {
      accountId,
      accountNo,
      status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════
  //  FD PRODUCT LOOKUP
  // ═══════════════════════════════════════════════════════

  /**
   * Get all Fixed Deposit products from Fineract
   */
  async getFDProducts(): Promise<any[]> {
    try {
      const response = await this.client.get('/fixeddepositproducts');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      this.fdLogger.error(`Failed to get FD products: ${error.message}`);
      return [];
    }
  }

  /**
   * Find FD product ID by shortName (matching setup-fd-products.ts mapping).
   * Loan Product shortName (e.g., "P12T") → FD Product with same shortName "P12T".
   */
  async findFDProductByShortName(shortName: string): Promise<number | null> {
    try {
      const products = await this.getFDProducts();
      const match = products.find(
        (p: any) => (p.shortName || '').toUpperCase() === shortName.toUpperCase(),
      );
      if (match) {
        this.fdLogger.log(`Found FD product: [${match.shortName}] ID=${match.id}`);
        return match.id;
      }
      this.fdLogger.warn(`No FD product found for shortName="${shortName}"`);
      return null;
    } catch (error: any) {
      this.fdLogger.error(`Error finding FD product: ${error.message}`);
      return null;
    }
  }

  /**
   * Helper: Get FD product detailed annual rate from shortName
   */
  async getFDProductAnnualRate(shortName: string): Promise<number | null> {
    const fdProductId = await this.findFDProductByShortName(shortName);
    if (!fdProductId) return null;
    try {
      const res = await this.client.get(`/fixeddepositproducts/${fdProductId}`);
      const data = res.data;
      if (data) {
        const activeChart = data.activeChart || data.interestRateCharts?.[0];
        const chartSlabs = activeChart?.chartSlabs || [];
        return chartSlabs[0]?.annualInterestRate ?? data.nominalAnnualInterestRate ?? 0;
      }
    } catch {
      // Ignored
    }
    return null;
  }

  /**
   * Get full FD product config needed for accurate schedule calculation.
   * Returns compounding, posting, calculation type, days-in-year, rate, and rounding.
   */
  async getFDProductConfig(shortName: string): Promise<{
    annualInterestRate: number;
    compoundingPeriod: string; // 'Monthly' | 'Daily' | 'Quarterly' | ...
    postingPeriod: string;     // 'Monthly' | 'Quarterly' | ...
    calculationType: string;   // 'Daily Balance' | 'Average Daily Balance'
    daysInYear: number;        // 365 | 360
    inMultiplesOf: number;     // currency rounding, e.g. 1000
    minDepositTerm: number;
    maxDepositTerm: number;
  } | null> {
    const fdProductId = await this.findFDProductByShortName(shortName);
    if (!fdProductId) return null;
    try {
      const res = await this.client.get(`/fixeddepositproducts/${fdProductId}`);
      const data = res.data;
      if (!data) return null;

      const activeChart = data.activeChart || data.interestRateCharts?.[0];
      const chartSlabs = activeChart?.chartSlabs || [];
      const annualRate = chartSlabs[0]?.annualInterestRate ?? data.nominalAnnualInterestRate ?? 0;

      const config = {
        annualInterestRate: annualRate,
        compoundingPeriod: data.interestCompoundingPeriodType?.value || 'Monthly',
        postingPeriod: data.interestPostingPeriodType?.value || 'Monthly',
        calculationType: data.interestCalculationType?.value || 'Daily Balance',
        daysInYear: data.interestCalculationDaysInYearType?.id || 365,
        inMultiplesOf: data.currency?.inMultiplesOf || 1000,
        minDepositTerm: data.minDepositTerm || 1,
        maxDepositTerm: data.maxDepositTerm || 120,
      };

      this.fdLogger.log(`[getFDProductConfig] ${shortName}: rate=${config.annualInterestRate}%, compound=${config.compoundingPeriod}, posting=${config.postingPeriod}, calc=${config.calculationType}, daysInYear=${config.daysInYear}`);
      return config;
    } catch (err: any) {
      this.fdLogger.error(`Error getting FD config for ${shortName}: ${err.message}`);
      return null;
    }
  }

  /**
   * Resolve FD product ID from a Loan Product ID.
   * Strategy: Get loan product → extract shortName → find FD product with same shortName.
   */
  async resolveFDProductFromLoanProduct(loanProductId: number): Promise<number | null> {
    try {
      const loanProduct = await this.client.get(`/loanproducts/${loanProductId}`);
      const shortName = (loanProduct.data?.shortName || '').trim().toUpperCase();
      if (!shortName) {
        this.fdLogger.warn(`Loan product ${loanProductId} has no shortName`);
        return null;
      }
      return this.findFDProductByShortName(shortName);
    } catch (error: any) {
      this.fdLogger.error(`Error resolving FD product from loan product ${loanProductId}: ${error.message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CREATE FIXED DEPOSIT
  // ═══════════════════════════════════════════════════════

  /**
   * Create a Fixed Deposit account for a lender.
   * Auto-approves and activates the account.
   *
   * @param clientId  Lender's Fineract client ID
   * @param productId FD Product ID (from findFDProductByShortName)
   * @param depositAmount Amount in VND
   * @param periodMonths  Term in months
   * @param externalId Optional external ID for reconciliation (e.g., "FD_INV_xxx")
   */
  async createFixedDeposit(
    clientId: number,
    productId: number,
    depositAmount: number,
    periodMonths: number,
    externalId?: string,
    _linkedAccountId?: number, // deprecated — giữ để tương thích ngược, không sử dụng
  ): Promise<FDAccountResult> {
    this.fdLogger.log(
      `Creating FD (standalone escrow): client=${clientId}, product=${productId}, amount=${depositAmount}, period=${periodMonths}m`,
    );

    const submittedOnDate = await this.getClientSafeSubmittedOnDate(clientId);
    const productDetails = await this.getFDProductDetails(productId);
    const template = await this.getFixedDepositTemplate(clientId, productId);
    const normalizedDepositAmount = this.normalizeDepositAmount(depositAmount, productDetails);
    const depositPeriodFrequencyId =
      template?.depositPeriodFrequency?.id || template?.depositPeriodFrequencyType?.id || 2;

    const payload: Record<string, any> = {
      accountNo: this.buildFDAccountNo(),
      clientId,
      productId,
      submittedOnDate,
      depositAmount: normalizedDepositAmount,
      depositPeriod: periodMonths,
      depositPeriodFrequencyId, // Months
      locale: 'en',
      dateFormat: 'yyyy-MM-dd',
    };

    if (externalId) {
      payload.externalId = externalId;
    }

    try {
      return await this.postFixedDepositAccount(payload, submittedOnDate);
    } catch (error: any) {
      if (externalId && this.isSavingsIntegrityError(error)) {
        this.fdLogger.warn(
          `[createFixedDeposit] Create failed with externalId=${externalId}; retrying once without externalId.`,
        );
        const retryPayload: Record<string, any> = { ...payload, accountNo: this.buildFDAccountNo() };
        delete retryPayload.externalId;
        try {
          return await this.postFixedDepositAccount(retryPayload, submittedOnDate);
        } catch (retryError: any) {
          this.handleError(retryError, `Failed to create Fixed Deposit for client ${clientId}`);
        }
      }
      this.handleError(error, `Failed to create Fixed Deposit for client ${clientId}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  APPROVE / ACTIVATE
  // ═══════════════════════════════════════════════════════

  private async approveFixedDeposit(accountId: number, onDate?: string): Promise<void> {
    try {
      await this.client.post(`/fixeddepositaccounts/${accountId}?command=approve`, {
        approvedOnDate: onDate || this.getTodayFormatted('iso'),
        locale: 'en',
        dateFormat: 'yyyy-MM-dd',
      });
      this.fdLogger.log(`FD ${accountId} approved`);
    } catch (error: any) {
      this.handleError(error, `Failed to approve FD ${accountId}`);
    }
  }

  private async activateFixedDeposit(accountId: number, onDate?: string): Promise<void> {
    try {
      await this.client.post(`/fixeddepositaccounts/${accountId}?command=activate`, {
        activatedOnDate: onDate || this.getTodayFormatted('iso'),
        locale: 'en',
        dateFormat: 'yyyy-MM-dd',
      });
      this.fdLogger.log(`FD ${accountId} activated`);
    } catch (error: any) {
      this.handleError(error, `Failed to activate FD ${accountId}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  GET DETAILS
  // ═══════════════════════════════════════════════════════

  async getFixedDepositDetails(accountId: number): Promise<FDAccountDetails> {
    try {
      const response = await this.client.get(`/fixeddepositaccounts/${accountId}`);
      const data = response.data;

      let maturityDate: Date | null = null;
      if (data.maturityDate) {
        if (Array.isArray(data.maturityDate)) {
          maturityDate = new Date(data.maturityDate[0], data.maturityDate[1] - 1, data.maturityDate[2]);
        } else {
          maturityDate = new Date(data.maturityDate);
        }
      }

      return {
        accountId: data.id,
        accountNo: data.accountNo || '',
        balance: data.summary?.accountBalance || 0,
        interestAccrued: data.summary?.totalInterestEarned || 0,
        maturityDate,
        status: data.status?.value || 'unknown',
        depositAmount: data.depositAmount || 0,
        interestRate: data.nominalAnnualInterestRate || 0,
      };
    } catch (error: any) {
      this.handleError(error, `Failed to get FD details for account ${accountId}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CALCULATE INTEREST
  // ═══════════════════════════════════════════════════════

  async calculateInterest(accountId: number): Promise<{ success: boolean; balance?: number; interestAccrued?: number }> {
    try {
      await this.client.post(`/fixeddepositaccounts/${accountId}?command=calculateInterest`, {
        locale: 'en',
        dateFormat: 'dd MMMM yyyy',
      });

      const details = await this.getFixedDepositDetails(accountId);
      return {
        success: true,
        balance: details.balance,
        interestAccrued: details.interestAccrued,
      };
    } catch (error: any) {
      this.fdLogger.error(`Error calculating interest for FD ${accountId}: ${error.message}`);
      return { success: false };
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CLOSE FIXED DEPOSIT
  // ═══════════════════════════════════════════════════════

  /**
   * Premature close a Fixed Deposit and transfer balance to a savings account.
   * onAccountClosureId: 200 = Transfer to Savings Account
   */
  async closeFixedDeposit(
    accountId: number,
    transferToSavingsId: number,
  ): Promise<{ closureAmount: number; transactionId: number; status: string }> {
    this.fdLogger.log(`Closing FD ${accountId}, transfer to savings ${transferToSavingsId}`);

    try {
      const details = await this.getFixedDepositDetails(accountId);
      const closureAmount = details.balance + details.interestAccrued;

      const response = await this.client.post(
        `/fixeddepositaccounts/${accountId}?command=prematureClose`,
        {
          closedOnDate: this.getTodayFormatted('display'),
          onAccountClosureId: 200, // Transfer to Savings
          toSavingsAccountId: transferToSavingsId,
          paymentTypeId: 1,
          locale: 'en',
          dateFormat: 'dd MMMM yyyy',
        },
      );

      this.fdLogger.log(`FD ${accountId} closed, amount: ${closureAmount}`);

      return {
        closureAmount,
        transactionId: response.data.resourceId,
        status: 'closed',
      };
    } catch (error: any) {
      this.handleError(error, `Failed to close FD ${accountId}`);
    }
  }
}
