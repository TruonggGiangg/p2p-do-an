import { Injectable, Logger } from '@nestjs/common';
import { FineractService } from './fineract.service';
import * as moment from 'moment-timezone';

/**
 * Fineract Fixed Deposit Service
 * Handles Fixed Deposit operations for P2P Investment
 * - Create FD accounts with dynamic interest rates
 * - Post interest to FD (accumulate)
 * - Close FD (maturity or premature)
 * - Track FD balances and status
 */

export interface FixedDepositAccount {
    accountId: number;
    accountNo: string;
    status: string;
}

export interface FixedDepositDetails {
    accountId: number;
    accountNo: string;
    balance: number;
    interestAccrued: number;
    maturityDate: Date | null;
    status: string;
    depositAmount: number;
    interestRate: number;
}

export interface ClosureResult {
    closureAmount: number;
    transactionId: number;
    status: string;
}

@Injectable()
export class FineractFixedDepositService {
    private readonly logger = new Logger(FineractFixedDepositService.name);

    constructor(private readonly fineractService: FineractService) { }

    // Helper to get httpService from FineractService
    private get httpService() {
        return this.fineractService['httpService'];
    }

    // Helper to get baseUrl from FineractService
    private get baseUrl() {
        return this.fineractService['baseUrl'];
    }

    // Helper to get headers from FineractService
    private async getHeaders() {
        return await this.fineractService['getHeaders']();
    }

    /**
     * Create Fixed Deposit Account for lender
     * @param clientId - Lender's Fineract client ID
     * @param productId - Fixed Deposit Product ID
     * @param depositAmount - Deposit amount
     * @param interestRate - Interest rate (%, annual) - may be ignored by Fineract if product has charts
     * @param periodMonths - Deposit period in months
     * @param externalId - External ID for reconciliation (e.g., "FD_INV_xxx")
     * @returns FixedDepositAccount
     */
    async createFixedDepositAccount(
        clientId: number,
        productId: number,
        depositAmount: number,
        interestRate: number,
        periodMonths: number,
        externalId?: string,
        linkAccountId?: number, // Optional, for auto-debit
    ): Promise<FixedDepositAccount> {
        this.logger.log(
            `Creating Fixed Deposit for client ${clientId}, amount: ${depositAmount}, target rate: ${interestRate}%`,
        );
        if (externalId) {
            this.logger.log(`External ID: ${externalId}`);
        }

        try {
            const payload: any = {
                clientId: clientId,
                productId: productId,
                submittedOnDate: this.getFormattedDate(new Date()),
                depositAmount: depositAmount,
                depositPeriod: periodMonths,
                depositPeriodFrequencyId: 2, // Months
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
                linkAccountId: linkAccountId, // Auto-debit from this account
            };

            // Add externalId if provided (for reconciliation)
            if (externalId) {
                payload.externalId = externalId;
            }

            const headers = await this.getHeaders();
            const response = await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts`,
                payload,
                { headers }
            ).toPromise();

            if (!response || !response.data) {
                throw new Error('Failed to create Fixed Deposit: No response from Fineract');
            }

            this.logger.log(`✓ Fixed Deposit created: ID ${response.data.savingsId}`);

            // Approve FD first
            await this.approveFixedDeposit(response.data.savingsId);

            // Then activate
            await this.activateFixedDeposit(response.data.savingsId);

            return {
                accountId: response.data.savingsId,
                accountNo: response.data.accountNo,
                status: 'active',
            };
        } catch (error: any) {
            this.logger.error(
                `✗ Error creating Fixed Deposit: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
            );
            throw error;
        }
    }

    /**
     * Approve Fixed Deposit Account
     */
    private async approveFixedDeposit(accountId: number): Promise<void> {
        try {
            await this.fineractService['adminApi'].post(
                `/fixeddepositaccounts/${accountId}?command=approve`,
                {
                    approvedOnDate: this.getFormattedDate(new Date()),
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy',
                },
            );
            this.logger.log(`✓ Fixed Deposit ${accountId} approved`);
        } catch (error: any) {
            this.logger.error(
                `✗ Error approving FD: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
            );
            throw error;
        }
    }

    /**
     * Activate Fixed Deposit Account
     */
    private async activateFixedDeposit(accountId: number): Promise<void> {
        try {
            await this.fineractService['adminApi'].post(
                `/fixeddepositaccounts/${accountId}?command=activate`,
                {
                    activatedOnDate: this.getFormattedDate(new Date()),
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy',
                },
            );
            this.logger.log(`✓ Fixed Deposit ${accountId} activated`);
        } catch (error: any) {
            this.logger.error(
                `✗ Error activating FD: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
            );
            throw error;
        }
    }

    /**
     * Post interest to Fixed Deposit Account
     * @param accountId - Fixed Deposit Account ID
     * @param interestAmount - Interest amount to post (optional, Fineract auto-calculates)
     * @returns Success status and new balance
     */
    async postInterestToFixedDeposit(
        accountId: number,
        interestAmount?: number,
    ): Promise<{ success: boolean; newBalance?: number; accruedInterest?: number; error?: string }> {
        this.logger.log(`Posting interest ${interestAmount || 'auto'} to FD ${accountId}`);

        try {
            // Fineract auto-calculates interest, just trigger calculation
            // Interest will accrue internally and be paid out when FD closes
            const headers = await this.getHeaders();
            await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${accountId}?command=calculateInterest`,
                {
                    transactionDate: this.getFormattedDate(new Date()),
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy',
                },
                { headers }
            ).toPromise();

            this.logger.log(`✓ Interest calculation triggered for FD ${accountId}`);

            // Get updated balance
            const details = await this.getFixedDepositDetails(accountId);

            return {
                success: true,
                newBalance: details.balance,
                accruedInterest: details.interestAccrued,
            };
        } catch (error: any) {
            this.logger.error(
                `✗ Error posting interest: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Alias for postInterestToFixedDeposit (shorter name for convenience)
     * @param accountId  - FD account ID
     * @param amount - Interest amount to post
     */
    async postInterestToFD(accountId: number, amount: number): Promise<void> {
        const result = await this.postInterestToFixedDeposit(accountId, amount);
        if (!result.success) {
            throw new Error(result.error || 'Failed to post interest to FD');
        }
    }

    /**
     * Get Fixed Deposit Account details
     * @param accountId
     * @returns FD details including balance, interest, maturity date
     */
    async getFixedDepositDetails(accountId: number): Promise<FixedDepositDetails> {
        try {
            const headers = await this.getHeaders();
            const response = await this.httpService.get(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${accountId}`,
                { headers }
            ).toPromise();

            const data = response?.data;

            if (!data) {
                throw new Error('Failed to get FD details: No data received');
            }

            return {
                accountId: data.id,
                accountNo: data.accountNo,
                balance: data.summary?.accountBalance || 0,
                interestAccrued: data.summary?.totalInterestEarned || 0,
                maturityDate: data.maturityDate
                    ? new Date(data.maturityDate)
                    : null,
                status: data.status?.value || 'unknown',
                depositAmount: data.depositAmount || 0,
                interestRate: data.nominalAnnualInterestRate || 0,
            };
        } catch (error: any) {
            this.logger.error(
                `✗ Error getting FD details: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
            );
            throw error;
        }
    }

    /**
     * Close Fixed Deposit Account (maturity or premature)
     * @param accountId
     * @param transferToAccountId - Transfer remaining balance to this savings account
     * @param loanId - Optional loan ID for P2P context note
     * @returns Closure result with amount and transaction ID
     */
    async closeFixedDepositAccount(
        accountId: number,
        transferToAccountId: number,
        loanId?: string,
    ): Promise<ClosureResult> {
        this.logger.log(
            `Closing Fixed Deposit ${accountId}, transfer to savings ${transferToAccountId}`,
        );

        try {
            // Get current balance before closing
            const details = await this.getFixedDepositDetails(accountId);
            // ✅ P2P REFERENCE: closureAmount = balance + interestAccrued (line 268)
            const closureAmount = details.balance + details.interestAccrued;

            this.logger.log(
                `[Close FD ${accountId}] Balance: ${details.balance}, Interest: ${details.interestAccrued}, Total: ${closureAmount}`,
            );

            // Build P2P context note with LOAN_ID for grouping
            const p2pNote = loanId ? `FD closure for loan ${loanId}` : 'FD closure';

            // Close FD with correct parameters
            // onAccountClosureId enum: 100 = Reinvest, 200 = Transfer to Savings, 300 = Withdraw
            const headers = await this.getHeaders();
            const response = await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${accountId}?command=prematureClose`,
                {
                    closedOnDate: this.getFormattedDate(new Date()),
                    onAccountClosureId: 200, // 200 = Transfer to Savings Account
                    toSavingsAccountId: transferToAccountId, // Target savings account
                    paymentTypeId: 1,
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy',
                    note: p2pNote,
                },
                { headers }
            ).toPromise();

            if (!response || !response.data) {
                throw new Error('Failed to close FD: No response from Fineract');
            }

            this.logger.log(
                `✓ Fixed Deposit ${accountId} closed (premature), closure amount includes balance + accrued interest: ${closureAmount}`,
            );

            return {
                closureAmount: closureAmount,
                transactionId: response.data.resourceId,
                status: 'closed',
            };
        } catch (error: any) {
            this.logger.error(
                `✗ Error closing FD: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
            );
            throw error;
        }
    }

    /**
     * Withdraw from Fixed Deposit (Partial Liquidation)
     * Used for Partial Principal Repayment sync
     */
    async withdrawFixedDeposit(
        accountId: number,
        amount: number,
        note: string = 'Partial withdrawal'
    ): Promise<boolean> {
        if (amount <= 0) return true;

        this.logger.log(`Withdrawing ${amount} from FD ${accountId} (Partial Liquidation)`);

        try {
            const headers = await this.getHeaders();
            // Try standard withdrawal command (works if FD is configured as Savings-like)
            // Or specific FD command if available. 
            // Using 'withdrawal' command which is standard for savings-family accounts.
            const response = await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${accountId}/transactions?command=withdrawal`,
                {
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy',
                    transactionDate: this.getFormattedDate(new Date()),
                    transactionAmount: amount,
                    note: note
                },
                { headers }
            ).toPromise();

            if (response && response.data && response.data.resourceId) {
                this.logger.log(`✓ Withdrew ${amount} from FD ${accountId}. Txn: ${response.data.resourceId}`);
                return true;
            }
            return false;
        } catch (error: any) {
            this.logger.warn(
                `Could not withdraw from FD ${accountId} (Product might not support Partial Liquidation). Manual adjustment needed. Error: ${error.message}`
            );
            return false; // Soft fail - allow flow to continue but warn admin
        }
    }

    /**
     * Calculate interest rate based on loan size and risk
     * @param loanAmount - Loan amount
     * @param loanPeriod - Loan period in months
     * @param riskLevel - 'low', 'medium', 'high'
     * @returns Recommended interest rate (%)
     */
    calculateInterestRate(
        loanAmount: number,
        loanPeriod: number,
        riskLevel: 'low' | 'medium' | 'high' = 'medium',
    ): number {
        let baseRate = 10.0; // Default 10%

        // Adjust by loan size
        if (loanAmount < 10000000) {
            baseRate = 8.0; // Small loans: 8%
        } else if (loanAmount < 50000000) {
            baseRate = 10.0; // Medium loans: 10%
        } else {
            baseRate = 12.0; // Large loans: 12%
        }

        // Adjust by risk
        const riskAdjustment: Record<string, number> = {
            low: -1.0,
            medium: 0,
            high: +2.0,
        };

        const finalRate = baseRate + (riskAdjustment[riskLevel] || 0);

        this.logger.log(
            `Calculated FD rate: ${finalRate}% (loan: ${loanAmount}, risk: ${riskLevel})`,
        );
        return finalRate;
    }

    // ===== HELPER METHODS =====

    private getFormattedDate(date: Date): string {
        const months = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ];

        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        return `${day} ${month} ${year}`;
    }

    private addMonths(date: Date, months: number): Date {
        const result = new Date(date);
        result.setMonth(result.getMonth() + months);
        return result;
    }
}
