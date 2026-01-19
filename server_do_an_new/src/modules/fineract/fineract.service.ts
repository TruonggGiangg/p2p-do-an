import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { type AxiosInstance } from 'axios';

import { FINERACT_AXIOS_CLIENT } from './fineract.constants';

import { ConfigService } from '@nestjs/config';
import { roundToCurrency } from '../../utils/RoundingUtils';

export interface FineractClientData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  officeId?: number;
  legalFormId?: number;
}

@Injectable()
export class FineractService {
  private readonly logger = new Logger(FineractService.name);

  constructor(
    @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new client in Fineract
   */
  async createClient(data: FineractClientData): Promise<number> {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const officeId = data.officeId || this.configService.getOrThrow<number>('defaults.officeId');
    const legalFormId = data.legalFormId || this.configService.getOrThrow<number>('defaults.legalFormId');

    try {
      const response = await this.client.post('/clients', {
        officeId,
        legalFormId,
        firstname: data.firstName,
        lastname: data.lastName,
        externalId: data.phoneNumber,
        mobileNo: data.phoneNumber,
        emailAddress: data.email,
        active: true,
        activationDate: today,
        locale: this.configService.get<string>('defaults.locale'),
        dateFormat: this.configService.get<string>('defaults.dateFormat'),
      });

      return response.data.resourceId || response.data.clientId;
    } catch (error: any) {
      this.handleError(error, 'Failed to create Fineract client');
    }
  }

  async findClientByIdentifier(identifier: string): Promise<any | null> {
    try {
      this.logger.debug(`Searching for Fineract client using: ${identifier}`);

      // 1. Search by externalId (direct match)
      const extResponse = await this.client.get('/clients', {
        params: { externalId: identifier },
      });
      const extClients = extResponse.data?.pageItems || extResponse.data || [];
      const matchByExt = extClients.find((c: any) => c.externalId === identifier);
      if (matchByExt) return matchByExt;

      // 2. Try heuristic transformation (borrower1 -> BORROWER_1)
      const heuristicId = identifier.toUpperCase().replace(/(\D+)(\d+)/, '$1_$2');
      if (heuristicId !== identifier.toUpperCase()) {
        const hResponse = await this.client.get('/clients', {
          params: { externalId: heuristicId },
        });
        const hClients = hResponse.data?.pageItems || hResponse.data || [];
        const matchByH = hClients.find((c: any) => c.externalId === heuristicId);
        if (matchByH) return matchByH;
      }

      // 3. Search by mobileNo
      const searchPhone = identifier.replace(/\D/g, '');
      if (searchPhone.length >= 9) {
        const mobileResponse = await this.client.get('/clients', {
          params: { mobileNo: searchPhone },
        });
        const mobileClients = mobileResponse.data?.pageItems || mobileResponse.data || [];
        const matchByPhone = mobileClients.find((c: any) => (c.mobileNo || '').replace(/\D/g, '') === searchPhone);
        if (matchByPhone) return matchByPhone;
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Error finding client by identifier ${identifier}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all savings accounts for a client
   */
  async getSavingsAccounts(clientId: number): Promise<any[]> {
    try {
      const response = await this.client.get(`/clients/${clientId}/accounts`);
      return response.data?.savingsAccounts || [];
    } catch {
      this.logger.error(`Failed to get savings accounts for client ${clientId}`);
      return [];
    }
  }

  /**
   * Get detailed savings account info
   */
  async getSavingsAccountDetails(savingsId: string): Promise<any> {
    try {
      const response = await this.client.get(`/savingsaccounts/${savingsId}`);
      return response.data;
    } catch (error: any) {
      this.handleError(error, `Failed to get savings account ${savingsId}`);
    }
  }

  /**
   * Determine wallet type based on Fineract account data
   */
  getWalletType(savingsData: any): 'credit_wallet' | 'e_wallet' {
    // match by Product ID
    const productId = savingsData.savingsProductId || savingsData.productId;
    const configCreditId = this.configService.get<number>('defaults.creditWalletProductId');
    const configEwalletId = this.configService.get<number>('defaults.ewalletProductId');

    if (productId && productId === configCreditId) return 'credit_wallet';
    if (productId && productId === configEwalletId) return 'e_wallet';

    return 'e_wallet';
  }

  // ==================== LOAN OPERATIONS (BNPL) ====================

  /**
   * Create a new loan application in Fineract
   * Matches legacy pattern for compatibility
   */
  async createLoanApplication(data: {
    clientId: number;
    productId: number;
    principal: number;
    numberOfRepayments: number;
    repaymentEvery?: number;
    repaymentFrequencyType?: number;
    interestRatePerPeriod?: number;
    expectedDisbursementDate?: string;
  }): Promise<number> {
    try {
      // Fetch product details to get default configuration
      const product = await this.getLoanProductDetails(data.productId);

      // Use product defaults for mandatory fields (product is source of truth)
      if (!product) {
        throw new BadRequestException(`Loan product ${data.productId} not found in Fineract`);
      }

      const interestRatePerPeriod = product.interestRatePerPeriod;
      const amortizationType = product.amortizationType?.id;
      const interestType = product.interestType?.id;
      const interestCalculationPeriodType = product.interestCalculationPeriodType?.id;

      if (!interestRatePerPeriod || !amortizationType || interestType === undefined || !interestCalculationPeriodType) {
        throw new BadRequestException(`Loan product ${data.productId} is missing required configuration`);
      }

      // Date formatting (legacy uses yyyy-MM-dd)
      const today = new Date();
      const submittedOnDate = today.toISOString().split('T')[0];
      const expectedDisbursementDate = data.expectedDisbursementDate || submittedOnDate;

      const response = await this.client.post('/loans', {
        clientId: data.clientId,
        productId: data.productId,
        principal: data.principal,
        loanTermFrequency: data.numberOfRepayments,
        loanTermFrequencyType: 2, // Months (Fineract constant)
        numberOfRepayments: data.numberOfRepayments,
        repaymentEvery: data.repaymentEvery || 1,
        repaymentFrequencyType: data.repaymentFrequencyType || 2, // Monthly (Fineract constant)
        // Mandatory fields from product configuration
        interestRatePerPeriod,
        amortizationType,
        interestType,
        interestCalculationPeriodType,
        transactionProcessingStrategyCode: 'mifos-standard-strategy', // Fineract standard strategy
        loanType: 'individual',
        expectedDisbursementDate,
        submittedOnDate,
        dateFormat: 'yyyy-MM-dd',
        locale: 'en',
      });

      this.logger.log(`Loan application created: ${response.data.loanId}`);
      return response.data.loanId || response.data.resourceId;
    } catch (error: any) {
      this.handleError(error, 'Failed to create loan application');
    }
  }

  /**
   * Approve a loan application
   */
  async approveLoan(loanId: number): Promise<void> {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    try {
      await this.client.post(`/loans/${loanId}?command=approve`, {
        approvedOnDate: today,
        locale: this.configService.get<string>('defaults.locale') || 'en',
        dateFormat: this.configService.get<string>('defaults.dateFormat') || 'dd MMMM yyyy',
      });

      this.logger.log(`Loan ${loanId} approved`);
    } catch (error: any) {
      this.handleError(error, `Failed to approve loan ${loanId}`);
    }
  }

  /**
   * Disburse an approved loan
   */
  async disburseLoan(loanId: number): Promise<void> {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    try {
      await this.client.post(`/loans/${loanId}?command=disburse`, {
        actualDisbursementDate: today,
        locale: this.configService.get<string>('defaults.locale') || 'en',
        dateFormat: this.configService.get<string>('defaults.dateFormat') || 'dd MMMM yyyy',
      });

      this.logger.log(`Loan ${loanId} disbursed`);
    } catch (error: any) {
      this.handleError(error, `Failed to disburse loan ${loanId}`);
    }
  }

  /**
   * Get loan details with repayment schedule
   */
  async getLoanDetails(loanId: string): Promise<any> {
    try {
      const response = await this.client.get(`/loans/${loanId}?associations=repaymentSchedule`);
      return response.data;
    } catch (error: any) {
      this.handleError(error, `Failed to get loan details ${loanId}`);
    }
  }

  /**
   * Get repayment schedule from Fineract (lấy lịch trả nợ thực tế)
   * Returns periods array with principal, interest, due dates
   */
  async getRepaymentSchedule(loanId: string | number): Promise<any> {
    try {
      const loanDetails = await this.getLoanDetails(loanId.toString());
      return loanDetails.repaymentSchedule || null;
    } catch (error: any) {
      this.logger.error(`Failed to get repayment schedule for loan ${loanId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all active loans for a client
   */
  async getClientLoans(clientId: number): Promise<any[]> {
    try {
      const response = await this.client.get(`/clients/${clientId}/accounts`);
      return response.data?.loanAccounts || [];
    } catch {
      this.logger.error(`Failed to get loans for client ${clientId}`);
      return [];
    }
  }

  /**
   * Create loan, approve, and disburse in one flow (auto-disburse)
   */
  async createAndDisburseLoan(data: {
    clientId: number;
    productId: number;
    principal: number;
    numberOfRepayments: number;
  }): Promise<{ loanId: number; repaymentSchedule: any }> {
    // Step 1: Create loan application
    const loanId = await this.createLoanApplication(data);

    // Step 2: Approve
    await this.approveLoan(loanId);

    // Step 3: Disburse
    await this.disburseLoan(loanId);

    // Step 4: Get details with schedule
    const loanDetails = await this.getLoanDetails(loanId.toString());

    return {
      loanId,
      repaymentSchedule: loanDetails.repaymentSchedule,
    };
  }

  /**
   * Get loan product details from Fineract
   */
  async getLoanProductDetails(productId: number): Promise<any> {
    try {
      const response = await this.client.get(`/loanproducts/${productId}`);
      return response.data;
    } catch (error: any) {
      this.handleError(error, `Failed to get loan product ${productId}`);
    }
  }

  /**
   * Calculate BNPL loan schedule based on Product configuration
   * Mirrors logic from legacy calculateLoanSchedule
   */
  async calculateBnplSchedule(data: { productId: number; principal: number; numberOfRepayments: number }): Promise<{
    monthlyRate: number;
    annualRate: number;
    monthlyPay: number;
    totalRepayment: number;
    totalInterest: number;
    interestType: string;
    schedulePreview: Array<{
      period: number;
      principal: number;
      interest: number;
      total: number;
      dueDate: string;
    }>;
  }> {
    // Get product details
    const product = await this.getLoanProductDetails(data.productId);

    if (!product) {
      throw new BadRequestException(`Loan product ${data.productId} not found in Fineract`);
    }

    const monthlyRate = product.interestRatePerPeriod ?? 0;
    const annualRate = product.annualInterestRate ?? monthlyRate * 12;
    const interestType = product.interestType?.value ?? 'Flat';
    const inMultiplesOf = product.currency?.inMultiplesOf ?? 1;

    this.logger.log(
      `[calculateBnplSchedule] Principal=${data.principal}, Periods=${data.numberOfRepayments}, Rate=${monthlyRate}%, Type=${interestType}`,
    );

    // Helper: Round to currency multiples using shared RoundingUtils
    const roundToCurrencyMultiples = (val: number): number => {
      return roundToCurrency(val, inMultiplesOf);
    };

    let monthlyPay: number;
    let totalRepayment: number;
    const schedulePreview: Array<{
      period: number;
      principal: number;
      interest: number;
      total: number;
      dueDate: string;
    }> = [];

    const today = new Date();

    if (interestType === 'Declining Balance' || product.interestType?.code === 'interestType.declining.balance') {
      // DECLINING BALANCE (EMI calculation)
      const r = monthlyRate / 100;
      if (r > 0) {
        const rawEmi =
          (data.principal * r * Math.pow(1 + r, data.numberOfRepayments)) /
          (Math.pow(1 + r, data.numberOfRepayments) - 1);
        monthlyPay = roundToCurrencyMultiples(rawEmi);
      } else {
        monthlyPay = roundToCurrencyMultiples(data.principal / data.numberOfRepayments);
      }

      // Simulate schedule
      let outstanding = data.principal;
      let totalPaid = 0;

      for (let i = 1; i <= data.numberOfRepayments; i++) {
        const interest = roundToCurrencyMultiples(outstanding * r);
        let principal = 0;
        let payment = 0;

        if (i < data.numberOfRepayments) {
          payment = monthlyPay;
          principal = payment - interest;
        } else {
          // Last period: pay off remaining
          principal = outstanding;
          payment = principal + interest;
        }

        const dueDate = new Date(today);
        dueDate.setMonth(dueDate.getMonth() + i);

        schedulePreview.push({
          period: i,
          principal: roundToCurrencyMultiples(principal),
          interest,
          total: payment,
          dueDate: dueDate.toISOString().split('T')[0],
        });

        outstanding -= principal;
        totalPaid += payment;
      }

      totalRepayment = totalPaid;
    } else {
      // FLAT interest (Default for BNPL)
      const monthlyPrincipal = roundToCurrencyMultiples(data.principal / data.numberOfRepayments);
      const monthlyInterest = roundToCurrencyMultiples((data.principal * monthlyRate) / 100);

      monthlyPay = monthlyPrincipal + monthlyInterest;
      totalRepayment = monthlyPay * data.numberOfRepayments;

      for (let i = 1; i <= data.numberOfRepayments; i++) {
        const dueDate = new Date(today);
        dueDate.setMonth(dueDate.getMonth() + i);

        schedulePreview.push({
          period: i,
          principal: monthlyPrincipal,
          interest: monthlyInterest,
          total: monthlyPay,
          dueDate: dueDate.toISOString().split('T')[0],
        });
      }
    }

    const totalInterest = totalRepayment - data.principal;

    this.logger.log(
      `[calculateBnplSchedule] Result: Monthly=${monthlyPay}, Total=${totalRepayment}, Interest=${totalInterest}`,
    );

    return {
      monthlyRate,
      annualRate,
      monthlyPay: roundToCurrencyMultiples(monthlyPay),
      totalRepayment: roundToCurrencyMultiples(totalRepayment),
      totalInterest: roundToCurrencyMultiples(totalInterest),
      interestType,
      schedulePreview,
    };
  }

  /**
   * Transfer funds between two savings accounts
   */
  async transferFunds(
    fromClientId: number,
    toClientId: number,
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    note: string = 'Transfer via P2P',
  ): Promise<any> {
    const today = new Date().toISOString().split('T')[0];

    this.logger.log(`[transferFunds] Transferring ${amount} VND from Client ${fromClientId}:Account ${fromAccountId} to Client ${toClientId}:Account ${toAccountId}`);

    try {
      const response = await this.client.post('/accounttransfers', {
        fromOfficeId: this.configService.getOrThrow<number>('defaults.officeId'),
        fromClientId,
        fromAccountType: 2, // Savings
        fromAccountId,
        toOfficeId: this.configService.getOrThrow<number>('defaults.officeId'),
        toClientId,
        toAccountType: 2, // Savings
        toAccountId,
        dateFormat: 'yyyy-MM-dd',
        locale: 'en',
        transferDate: today,
        transferAmount: amount,
        transferDescription: note,
      });

      this.logger.log(`✓ Transfer SUCCESS: resourceId=${response.data.resourceId}`);
      return {
        success: true,
        resourceId: response.data.resourceId,
        savingsId: response.data.savingsId,
      };
    } catch (error: any) {
      this.handleError(error, `Failed to transfer funds: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get active e-wallet savings account for a client
   */
  async getActiveEWalletAccount(clientId: number): Promise<any | null> {
    const accounts = await this.getSavingsAccounts(clientId);
    return (
      accounts.find((acc: any) => {
        const isActive = acc.status?.value === 'Active';
        const isEWallet = this.getWalletType(acc) === 'e_wallet';
        return isActive && isEWallet;
      }) || null
    );
  }

  /**
   * Get Savings Account Transactions
   * Fetches transaction history for a savings account with pagination
   */
  async getSavingsAccountTransactions(
    savingsAccountId: number,
    limit: number = 200,
    offset: number = 0,
  ): Promise<{ pageItems: any[]; totalFilteredRecords: number }> {
    try {
      this.logger.log(
        `[getSavingsTransactions] Fetching transactions for savings account ${savingsAccountId} (limit=${limit}, offset=${offset})`,
      );

      const response = await this.client.get(`/savingsaccounts/${savingsAccountId}/transactions`, {
        params: {
          limit: Math.min(limit, 200),
          offset: offset,
        },
      });

      // Fineract returns transactions in pageItems, already sorted by Fineract
      const txns = response.data?.pageItems || [];
      this.logger.log(
        `[getSavingsTransactions] Found ${txns.length} transactions (total: ${response.data?.totalFilteredRecords || txns.length})`,
      );

      // Log first transaction for debugging
      if (txns.length > 0) {
        const firstTxn = txns[0];
        this.logger.debug(
          `[getSavingsTransactions] First transaction: id=${firstTxn.id}, amount=${firstTxn.amount}, type=${firstTxn.transactionType?.value}`,
        );
      }

      return {
        pageItems: txns,
        totalFilteredRecords: response.data?.totalFilteredRecords || txns.length,
      };
    } catch (error: any) {
      // Fallback to associations=all if /transactions returns 405
      if (error.response?.status === 405) {
        this.logger.warn(
          `[getSavingsTransactions] /transactions endpoint returned 405, falling back to associations=all`,
        );
        return this.getSavingsAccountTransactionsFallback(savingsAccountId);
      }

      this.logger.error(`Failed to get savings transactions for ${savingsAccountId}: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}, data: ${JSON.stringify(error.response.data)}`);
      }
      return { pageItems: [], totalFilteredRecords: 0 };
    }
  }

  /**
   * Fallback: Get transactions via associations=all
   */
  private async getSavingsAccountTransactionsFallback(
    savingsAccountId: number,
  ): Promise<{ pageItems: any[]; totalFilteredRecords: number }> {
    try {
      const response = await this.client.get(`/savingsaccounts/${savingsAccountId}`, {
        params: {
          associations: 'all',
        },
      });

      const txns = response.data.transactions || [];
      this.logger.log(`[getSavingsTransactions-Fallback] Found ${txns.length} transactions`);

      return {
        pageItems: txns,
        totalFilteredRecords: txns.length,
      };
    } catch (error: any) {
      this.logger.error(`Fallback also failed for ${savingsAccountId}: ${error.message}`);
      return { pageItems: [], totalFilteredRecords: 0 };
    }
  }

  /**
   * Common error handler for senior-level logging and exceptions
   */
  private handleError(error: any, context: string): never {
    const errorData = error.response?.data;
    this.logger.error(`${context}: ${JSON.stringify(errorData || error.message)}`);

    if (errorData?.errors?.length > 0) {
      throw new BadRequestException(errorData.errors[0].defaultUserMessage || context);
    }

    throw new BadRequestException(context);
  }
}
