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
     * Get all savings products from Fineract (form data API - same as Mifos web app)
     */
    async getSavingsProducts(): Promise<any[]> {
        try {
            const response = await this.client.get('/savingsproducts');
            const items = response.data?.pageItems ?? response.data ?? [];
            return Array.isArray(items) ? items : [];
        } catch (error: any) {
            this.handleError(error, 'Failed to get savings products list');
        }
    }

    /**
     * Tìm ID sản phẩm tiết kiệm theo shortName (ví dụ: VP2P)
     */
    async getProductIdByShortName(shortName: string): Promise<number | null> {
        try {
            const products = await this.getSavingsProducts();
            const found = products.find((p: any) => (p.shortName || '').toUpperCase() === shortName.toUpperCase());
            return found ? found.id : null;
        } catch (error: any) {
            this.logger.warn(`[getProductIdByShortName] Failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Get savings product details by ID
     */
    async getSavingsProductDetails(productId: number): Promise<any> {
        try {
            const response = await this.client.get(`/savingsproducts/${productId}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, `Failed to get savings product ${productId}`);
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
     * Determine wallet type based on Fineract account data.
     * Fineract depositType: { id: 100 } = Savings, { id: 200 } = Fixed Deposit, { id: 300 } = Recurring Deposit
     * Also checks productName for fallback detection.
     */
    getWalletType(savingsData: any): 'e_wallet' | 'fixed_deposit' | 'recurring_deposit' {
        // 1. Check Fineract depositType (most reliable)
        const depositTypeId = savingsData?.depositType?.id;
        if (depositTypeId === 200) return 'fixed_deposit';
        if (depositTypeId === 300) return 'recurring_deposit';
        if (depositTypeId === 100) return 'e_wallet';

        // 2. Check accountType field (some Fineract versions)
        const accountType = savingsData?.accountType?.id;
        if (accountType === 200) return 'fixed_deposit';
        if (accountType === 300) return 'recurring_deposit';

        // 3. Fallback: check product name for FD keywords
        const productName = (savingsData?.productName || savingsData?.savingsProductName || '').toLowerCase();
        if (productName.includes('đầu tư') || productName.includes('fixed deposit') || productName.includes('dau tu') || productName.includes('fd ')) {
            return 'fixed_deposit';
        }

        // Default: regular savings = e-wallet
        return 'e_wallet';
    }

    /**
     * Create a new savings account (e-wallet) for a client.
     * Nếu productId không truyền: tìm sản phẩm shortName VP2P, fallback ewalletProductId từ config.
     */
    async createSavingsAccount(clientId: number, productId?: number): Promise<number> {
        let ewalletProductId = productId;
        if (ewalletProductId == null) {
            const vp2pId = await this.getProductIdByShortName('VP2P');
            ewalletProductId = vp2pId ?? this.getDefaultConfig<number>('ewalletProductId');
            if (vp2pId) {
                this.logger.log(`[createSavingsAccount] Using VP2P product id=${vp2pId}`);
            }
        }

        try {
            // Use strict date format (yyyy-MM-dd) for savings accounts to avoid locale issues
            const response = await this.client.post('/savingsaccounts', {
                clientId,
                productId: ewalletProductId,
                submittedOnDate: this.getTodayFormatted('iso'),
                locale: 'en',
                dateFormat: 'yyyy-MM-dd',
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
                approvedOnDate: this.getTodayFormatted('iso'),
                locale: 'en',
                dateFormat: 'yyyy-MM-dd',
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
                activatedOnDate: this.getTodayFormatted('iso'),
                locale: 'en',
                dateFormat: 'yyyy-MM-dd',
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
        const match = accounts.find((acc: any) => {
            const isActive = acc.status?.value === 'Active';
            const isEWallet = this.getWalletType(acc) === 'e_wallet';
            return isActive && isEWallet;
        });
        if (!match) return null;

        // Fetch full details to get actual balance (summary list doesn't include balance)
        try {
            const details = await this.getSavingsAccountDetails(String(match.id));
            return details || match;
        } catch {
            return match;
        }
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
                transferDate: this.getTodayFormatted('iso'),
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
     * Withdraw from a savings account (used for loan repayment wallet deduction)
     * POST /savingsaccounts/{savingsId}/transactions?command=withdrawal
     */
    async withdrawFromSavings(
        savingsId: number,
        amount: number,
        note: string = 'Wallet deduction for loan repayment',
    ): Promise<{ transactionId: number }> {
        try {
            this.logger.log(`[withdrawFromSavings] savingsId=${savingsId} amount=${amount}`);
            const response = await this.client.post(
                `/savingsaccounts/${savingsId}/transactions?command=withdrawal`,
                {
                    transactionDate: this.getTodayFormatted('iso'),
                    transactionAmount: amount,
                    paymentTypeId: 1,
                    dateFormat: 'yyyy-MM-dd',
                    locale: 'en',
                    note,
                },
            );
            const txId = response.data.resourceId || response.data.savingsId;
            this.logger.log(`[withdrawFromSavings] SUCCESS transactionId=${txId}`);
            return { transactionId: txId };
        } catch (error: any) {
            this.handleError(error, `Failed to withdraw ${amount} from savings ${savingsId}`);
        }
    }

    /**
     * Deposit to a savings account (used for loan disbursement to borrower wallet)
     * POST /savingsaccounts/{savingsId}/transactions?command=deposit
     */
    async depositToSavings(
        savingsId: number,
        amount: number,
        note: string = 'Loan disbursement deposit',
    ): Promise<{ transactionId: number }> {
        try {
            this.logger.log(`[depositToSavings] savingsId=${savingsId} amount=${amount}`);
            const response = await this.client.post(
                `/savingsaccounts/${savingsId}/transactions?command=deposit`,
                {
                    transactionDate: this.getTodayFormatted('iso'),
                    transactionAmount: amount,
                    paymentTypeId: 1,
                    dateFormat: 'yyyy-MM-dd',
                    locale: 'en',
                    note,
                },
            );
            const txId = response.data.resourceId || response.data.savingsId;
            this.logger.log(`[depositToSavings] SUCCESS transactionId=${txId}`);
            return { transactionId: txId };
        } catch (error: any) {
            this.handleError(error, `Failed to deposit ${amount} to savings ${savingsId}`);
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
                    ...this.getCommonLocaleParams('strict'),
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
                params: {
                    associations: 'all',
                    ...this.getCommonLocaleParams('strict'),
                },
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
