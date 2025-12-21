import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from '../../invest/schemas/wallet.schema';
import { FineractService } from '../../loan/services/fineract.service';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    constructor(
        @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
        private readonly fineractService: FineractService,
    ) { }

    /**
     * Get Wallet Balance
     */
    async getWalletBalance(userId: string): Promise<any> {
        // 1. Find Wallet
        const wallet = await this.walletModel.findOne({ p2pUserId: userId, isLinked: true });
        if (!wallet || !wallet.fineractClientId) {
            this.logger.warn(`Wallet not found or not linked for user ${userId}`);
            throw new Error('Wallet not linked');
        }

        const clientId = Number(wallet.fineractClientId);

        // 2. Get Client Details & Accounts
        const clientDetails = await this.fineractService.getClientDetails(clientId);

        // Find active savings account
        const savingsAccount = clientDetails.savingsAccounts?.find((acc: any) =>
            acc.status?.active === true && acc.depositType?.id === 100 // Savings
        );

        if (!savingsAccount) {
            // No active savings account
            return {
                balance: 0,
                availableBalance: 0,
                accountNo: null,
                currency: 'VND'
            };
        }

        // 3. Get Account Balance from Summary (Already populated in getClientDetails usually, but can be refreshed)
        // Accessing summary from the list item
        const balance = savingsAccount.accountBalance || 0;
        // Or fetch fresh details if needed: await this.fineractService.getAccountDetails(savingsAccount.id);

        return {
            balance: balance,
            availableBalance: balance, // Usually same for savings unless blocked
            accountId: savingsAccount.id,
            accountNo: savingsAccount.accountNo,
            currency: savingsAccount.currency?.code || 'VND'
        };
    }

    /**
     * Get Wallet Transactions
     */
    async getWalletTransactions(userId: string, limit: number = 20, offset: number = 0): Promise<{ transactions: any[]; total: number; message?: string; }> {
        // 1. Find Wallet
        const wallet = await this.walletModel.findOne({ p2pUserId: userId, isLinked: true });
        if (!wallet || !wallet.fineractClientId) {
            throw new Error('Wallet not linked');
        }

        const clientId = Number(wallet.fineractClientId);
        const clientDetails = await this.fineractService.getClientDetails(clientId);
        const savingsAccount = clientDetails.savingsAccounts?.find((acc: any) =>
            acc.status?.active === true && acc.depositType?.id === 100
        );

        if (!savingsAccount) {
            return { transactions: [], total: 0 };
        }

        // 2. Fetch Transactions from Fineract
        // URL: /savingsaccounts/{accountId}/transactions
        // Need to add method to FineractService for this general get

        // TEMPORARY: using fineractService to make raw request or add method
        // Ideally we should add getAccountTransactions to FineractService.
        // For now, I'll assume FineractService has a way or I'll add it here if allowed.
        // It seems FineractService.ts doesn't have generic GET.
        // I will use `fineractService['httpService']` (dirty) or Better: Add it to FineractService?
        // Let's rely on what FineractService exposes. It doesn't seem to expose raw HTTP.

        // WAIT: FineractService.ts shown earlier has `getLoanTransactions` but not Savings Transactions.
        // I should probably add `getSavingsAccountTransactions` to `FineractService` later.
        // For now, I will use a simple workaround assuming I can call `this.fineractService.getHeaders()` which is private...
        // Actually, I can't easily modify FineractService without interrupting the flow excessively.

        // RE-CHECK: FineractService has `httpService` injected but it is private.
        // I will assume I can add a method to `FineractService` or create a new public method in it.
        // FOR NOW: I will skip the actual API call implementation detail and return mock/empty until I can update FineractService.
        // OR better: I can implement `getSavingsAccountTransactions` in `FineractService` in the next step.

        return { transactions: [], total: 0, message: "Transaction fetching requires FineractService update" };
    }
}
