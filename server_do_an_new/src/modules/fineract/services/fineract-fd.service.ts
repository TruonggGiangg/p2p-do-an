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
  ): Promise<FDAccountResult> {
    this.fdLogger.log(
      `Creating FD: client=${clientId}, product=${productId}, amount=${depositAmount}, period=${periodMonths}m`,
    );

    const payload: Record<string, any> = {
      clientId,
      productId,
      submittedOnDate: this.getTodayFormatted('display'),
      depositAmount,
      depositPeriod: periodMonths,
      depositPeriodFrequencyId: 2, // Months
      locale: 'en',
      dateFormat: 'dd MMMM yyyy',
    };

    if (externalId) {
      payload.externalId = externalId;
    }

    try {
      const response = await this.client.post('/fixeddepositaccounts', payload);
      const accountId = response.data.savingsId || response.data.resourceId;

      this.fdLogger.log(`FD created: ID=${accountId}`);

      // Approve + Activate
      await this.approveFixedDeposit(accountId);
      await this.activateFixedDeposit(accountId);

      return {
        accountId,
        accountNo: response.data.accountNo || '',
        status: 'active',
      };
    } catch (error: any) {
      this.handleError(error, `Failed to create Fixed Deposit for client ${clientId}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  APPROVE / ACTIVATE
  // ═══════════════════════════════════════════════════════

  private async approveFixedDeposit(accountId: number): Promise<void> {
    try {
      await this.client.post(`/fixeddepositaccounts/${accountId}?command=approve`, {
        approvedOnDate: this.getTodayFormatted('display'),
        locale: 'en',
        dateFormat: 'dd MMMM yyyy',
      });
      this.fdLogger.log(`FD ${accountId} approved`);
    } catch (error: any) {
      this.handleError(error, `Failed to approve FD ${accountId}`);
    }
  }

  private async activateFixedDeposit(accountId: number): Promise<void> {
    try {
      await this.client.post(`/fixeddepositaccounts/${accountId}?command=activate`, {
        activatedOnDate: this.getTodayFormatted('display'),
        locale: 'en',
        dateFormat: 'dd MMMM yyyy',
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
