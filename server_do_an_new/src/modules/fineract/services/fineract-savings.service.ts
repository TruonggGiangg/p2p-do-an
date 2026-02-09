import { Injectable, Inject } from '@nestjs/common';
import { type AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

import { FINERACT_AXIOS_CLIENT } from '../fineract.constants';
import { FineractBaseService, ACCOUNT_TYPE_SAVINGS } from './fineract-base.service';

/**
 * FineractSavingsService - Savings account and wallet operations
 */
@Injectable()
export class FineractSavingsService extends FineractBaseService {
    constructor(
        @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
        configService: ConfigService,
    ) {
        super(configService);
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
    getWalletType(savingsData: any): 'e_wallet' {
        return 'e_wallet';
    }

    /**
     * Create a new savings account (e-wallet) for a client
     */
    async createSavingsAccount(clientId: number, productId?: number): Promise<number> {
        const ewalletProductId = productId || this.getDefaultConfig<number>('ewalletProductId');

        try {
            const response = await this.client.post('/savingsaccounts', {
                clientId,
                productId: ewalletProductId,
                submittedOnDate: this.getTodayFormatted('display'),
                ...this.getCommonLocaleParams('display'),
            });

            const savingsId = response.data.savingsId || response.data.resourceId;
            this.logger.log(`Created savings account ${savingsId} for client ${clientId}`);

            await this.approveSavingsAccount(savingsId);
            await this.activateSavingsAccount(savingsId);

            return savingsId;
        } catch (error: any) {
            this.handleError(error, 'Failed to create savings account');
        }
    }

    /**
     * Approve a savings account
     */
    async approveSavingsAccount(savingsId: number): Promise<void> {
        try {
            await this.client.post(`/savingsaccounts/${savingsId}?command=approve`, {
                approvedOnDate: this.getTodayFormatted('display'),
                ...this.getCommonLocaleParams('display'),
            });
            this.logger.log(`Approved savings account ${savingsId}`);
        } catch (error: any) {
            this.handleError(error, `Failed to approve savings account ${savingsId}`);
        }
    }

    /**
     * Activate a savings account
     */
    async activateSavingsAccount(savingsId: number): Promise<void> {
        try {
            await this.client.post(`/savingsaccounts/${savingsId}?command=activate`, {
                activatedOnDate: this.getTodayFormatted('display'),
                ...this.getCommonLocaleParams('display'),
            });
            this.logger.log(`Activated savings account ${savingsId}`);
        } catch (error: any) {
            this.handleError(error, `Failed to activate savings account ${savingsId}`);
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
     * Get Savings Account by Account Number
     */
    async getSavingsAccountByAccountNumber(accountNo: string): Promise<any | null> {
        try {
            this.logger.log(`[getSavingsAccountByAccountNumber] Searching for accountNo=${accountNo}`);

            const response = await this.client.get('/savingsaccounts', {
                params: { accountNo },
            });

            const accounts = response.data?.pageItems || [];
            if (accounts.length === 0) {
                this.logger.warn(`[getSavingsAccountByAccountNumber] No account found with accountNo=${accountNo}`);
                return null;
            }

            const exactMatch = accounts.find((acc: any) => acc.accountNo === accountNo);
            if (!exactMatch) {
                this.logger.warn(`[getSavingsAccountByAccountNumber] Fineract returned accounts but none matched accountNo=${accountNo}`);
                return null;
            }

            return exactMatch;
        } catch (error: any) {
            this.logger.error(`[getSavingsAccountByAccountNumber] Failed: ${error.message}`);
            return null;
        }
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
        this.logger.log(`[transferFunds] Transferring ${amount} VND from Client ${fromClientId}:Account ${fromAccountId} to Client ${toClientId}:Account ${toAccountId}`);

        try {
            const response = await this.client.post('/accounttransfers', {
                fromOfficeId: this.getDefaultConfig<number>('officeId'),
                fromClientId,
                fromAccountType: ACCOUNT_TYPE_SAVINGS,
                fromAccountId,
                toOfficeId: this.getDefaultConfig<number>('officeId'),
                toClientId,
                toAccountType: ACCOUNT_TYPE_SAVINGS,
                toAccountId,
                ...this.getCommonLocaleParams('strict'),
                transferDate: this.getTodayFormatted('ca'),
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
     * Get Savings Account Transactions
     */
    async getSavingsAccountTransactions(
        savingsAccountId: number,
        limit: number = 200,
        offset: number = 0,
    ): Promise<{ pageItems: any[]; totalFilteredRecords: number }> {
        try {
            const response = await this.client.get(`/savingsaccounts/${savingsAccountId}/transactions`, {
                params: {
                    limit: Math.min(limit, 200),
                    offset,
                },
            });

            const txns = response.data?.pageItems || [];
            return {
                pageItems: txns,
                totalFilteredRecords: response.data?.totalFilteredRecords || txns.length,
            };
        } catch (error: any) {
            if (error.response?.status === 405) {
                this.logger.warn(`[getSavingsTransactions] /transactions endpoint returned 405, falling back to associations=all`);
                return this.getSavingsAccountTransactionsFallback(savingsAccountId);
            }

            this.logger.error(`Failed to get savings transactions for ${savingsAccountId}: ${error.message}`);
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
                params: { associations: 'all' },
            });

            const txns = response.data.transactions || [];
            return {
                pageItems: txns,
                totalFilteredRecords: txns.length,
            };
        } catch (error: any) {
            this.logger.error(`Fallback also failed for ${savingsAccountId}: ${error.message}`);
            return { pageItems: [], totalFilteredRecords: 0 };
        }
    }
}
