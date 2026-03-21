import { Injectable, Inject } from '@nestjs/common';
import { type AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

import { FINERACT_AXIOS_CLIENT } from './fineract.constants';
import { FineractClientService, FineractClientData } from './services/fineract-client.service';
import { FineractLoanService } from './services/fineract-loan.service';
import { FineractSavingsService } from './services/fineract-savings.service';
import { FineractFDService, FDAccountResult, FDAccountDetails } from './services/fineract-fd.service';

/**
 * FineractService - Facade for backward compatibility
 * Delegates to specialized services: Client, Loan, Savings
 */
@Injectable()
export class FineractService {
  constructor(
    @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
    private readonly configService: ConfigService,
    private readonly clientService: FineractClientService,
    private readonly loanService: FineractLoanService,
    private readonly savingsService: FineractSavingsService,
    private readonly fdService: FineractFDService,
  ) { }

  // ==================== CLIENT OPERATIONS ====================

  async createClient(data: FineractClientData): Promise<number> {
    return this.clientService.createClient(data);
  }

  async updateClient(clientId: number, data: Record<string, any>): Promise<void> {
    return this.clientService.updateClient(clientId, data);
  }

  async findClientByIdentifier(identifier: string): Promise<any | null> {
    return this.clientService.findClientByIdentifier(identifier);
  }

  // ==================== SAVINGS/WALLET OPERATIONS ====================

  async getSavingsAccounts(clientId: number): Promise<any[]> {
    return this.savingsService.getSavingsAccounts(clientId);
  }

  async getSavingsAccountDetails(savingsId: string): Promise<any> {
    return this.savingsService.getSavingsAccountDetails(savingsId);
  }

  getWalletType(savingsData: any): 'e_wallet' | 'fixed_deposit' | 'recurring_deposit' {
    return this.savingsService.getWalletType(savingsData);
  }

  async createSavingsAccount(clientId: number, productId?: number): Promise<number> {
    return this.savingsService.createSavingsAccount(clientId, productId);
  }

  async approveSavingsAccount(savingsId: number): Promise<void> {
    return this.savingsService.approveSavingsAccount(savingsId);
  }

  async activateSavingsAccount(savingsId: number): Promise<void> {
    return this.savingsService.activateSavingsAccount(savingsId);
  }

  async getActiveEWalletAccount(clientId: number): Promise<any | null> {
    return this.savingsService.getActiveEWalletAccount(clientId);
  }

  async getSavingsAccountByAccountNumber(accountNo: string): Promise<any | null> {
    return this.savingsService.getSavingsAccountByAccountNumber(accountNo);
  }

  async transferFunds(
    fromClientId: number,
    toClientId: number,
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    note?: string,
  ): Promise<any> {
    return this.savingsService.transferFunds(fromClientId, toClientId, fromAccountId, toAccountId, amount, note);
  }

  async getSavingsAccountTransactions(
    savingsAccountId: number,
    limit?: number,
    offset?: number,
  ): Promise<{ pageItems: any[]; totalFilteredRecords: number }> {
    return this.savingsService.getSavingsAccountTransactions(savingsAccountId, limit, offset);
  }

  // ==================== LOAN OPERATIONS ====================

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
    return this.loanService.createLoanApplication(data);
  }

  async approveLoan(loanId: number): Promise<void> {
    return this.loanService.approveLoan(loanId);
  }

  async disburseLoan(loanId: number): Promise<void> {
    return this.loanService.disburseLoan(loanId);
  }

  async getLoanDetails(loanId: string): Promise<any> {
    return this.loanService.getLoanDetails(loanId);
  }

  async getRepaymentSchedule(loanId: string | number): Promise<any> {
    return this.loanService.getRepaymentSchedule(loanId);
  }

  async getClientLoans(clientId: number): Promise<any[]> {
    return this.loanService.getClientLoans(clientId);
  }

  async createAndDisburseLoan(data: {
    clientId: number;
    productId: number;
    principal: number;
    numberOfRepayments: number;
  }): Promise<{ loanId: number; repaymentSchedule: any }> {
    return this.loanService.createAndDisburseLoan(data);
  }

  async getLoanProductDetails(productId: number): Promise<any> {
    return this.loanService.getLoanProductDetails(productId);
  }

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
    return this.loanService.calculateBnplSchedule(data);
  }

  // ==================== FIXED DEPOSIT OPERATIONS ====================

  async findFDProductByShortName(shortName: string): Promise<number | null> {
    return this.fdService.findFDProductByShortName(shortName);
  }

  async resolveFDProductFromLoanProduct(loanProductId: number): Promise<number | null> {
    return this.fdService.resolveFDProductFromLoanProduct(loanProductId);
  }

  async createFixedDeposit(
    clientId: number, productId: number, depositAmount: number,
    periodMonths: number, externalId?: string,
  ): Promise<FDAccountResult> {
    return this.fdService.createFixedDeposit(clientId, productId, depositAmount, periodMonths, externalId);
  }

  async getFixedDepositDetails(accountId: number): Promise<FDAccountDetails> {
    return this.fdService.getFixedDepositDetails(accountId);
  }

  async closeFixedDeposit(accountId: number, transferToSavingsId: number) {
    return this.fdService.closeFixedDeposit(accountId, transferToSavingsId);
  }
}
