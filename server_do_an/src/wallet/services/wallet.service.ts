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
     * Resolve or Create Wallet - Auto-link P2P user to Fineract client
     * Similar to FineractService.resolveClientId()
     */
    private async resolveOrCreateWallet(userId: string): Promise<WalletDocument> {
        // 1. Check if wallet already exists
        let wallet = await this.walletModel.findOne({ p2pUserId: userId });

        if (wallet && wallet.isLinked && wallet.fineractClientId) {
            this.logger.log(`[resolveOrCreateWallet] Wallet already linked for user ${userId} -> Client ${wallet.fineractClientId}`);
            return wallet;
        }

        // 2. Auto-resolve Fineract client ID (using FineractService's resolveClientId)
        // This will find or create Fineract client based on Keycloak username
        const fineractClientId = await this.fineractService['resolveClientId'](userId);

        if (!fineractClientId) {
            throw new Error('Could not resolve Fineract client ID');
        }

        // 3. Create or update wallet record
        if (!wallet) {
            wallet = new this.walletModel({
                p2pUserId: userId,
                fineractClientId: String(fineractClientId),
                phone: userId, // Use userId as phone placeholder (can be updated later)
                isLinked: true,
                metadata: {
                    autoLinked: true,
                    linkedAt: new Date(),
                }
            });
            this.logger.log(`[resolveOrCreateWallet] Created new wallet for user ${userId} -> Client ${fineractClientId}`);
        } else {
            wallet.fineractClientId = String(fineractClientId);
            wallet.isLinked = true;
            wallet.metadata = {
                ...wallet.metadata,
                autoLinked: true,
                linkedAt: new Date(),
            };
            this.logger.log(`[resolveOrCreateWallet] Updated wallet for user ${userId} -> Client ${fineractClientId}`);
        }

        await wallet.save();
        return wallet;
    }

    /**
     * Get Wallet Balance
     */
    async getWalletBalance(userId: string): Promise<any> {
        // 1. Resolve or create wallet (auto-link if needed)
        const wallet = await this.resolveOrCreateWallet(userId);

        const clientId = Number(wallet.fineractClientId);

        // 2. Get Client Details & Accounts
        const clientDetails = await this.fineractService.getClientDetails(clientId);

        // Debug: Log savings accounts
        this.logger.log(`[getWalletBalance] Client ${clientId} has ${clientDetails.savingsAccounts?.length || 0} savings accounts`);

        // Find active savings account
        const savingsAccount = clientDetails.savingsAccounts?.find((acc: any) =>
            acc.status?.active === true && acc.depositType?.id === 100 // Savings
        );

        if (!savingsAccount) {
            // No active savings account
            this.logger.warn(`[getWalletBalance] No active savings account found for client ${clientId}`);
            return {
                balance: 0,
                availableBalance: 0,
                accountNo: null,
                currency: 'VND'
            };
        }

        // 3. Get Account Balance from Summary
        const balance = savingsAccount.accountBalance || 0;

        return {
            balance: balance,
            availableBalance: balance,
            accountId: savingsAccount.id,
            accountNo: savingsAccount.accountNo,
            currency: savingsAccount.currency?.code || 'VND'
        };
    }

    /**
     * Get Wallet Transactions
     */
    async getWalletTransactions(userId: string, limit: number = 20, offset: number = 0): Promise<{ transactions: any[]; total: number; message?: string; }> {
        this.logger.log(`[getWalletTransactions] START: userId=${userId}, limit=${limit}, offset=${offset}`);

        // 1. Resolve or create wallet (auto-link if needed)
        const wallet = await this.resolveOrCreateWallet(userId);

        const clientId = Number(wallet.fineractClientId);
        this.logger.log(`[getWalletTransactions] Resolved clientId=${clientId}`);

        const clientDetails = await this.fineractService.getClientDetails(clientId);

        // Debug: Log all savings accounts
        this.logger.log(`[getWalletTransactions] Client has ${clientDetails.savingsAccounts?.length || 0} savings accounts`);
        if (clientDetails.savingsAccounts?.length > 0) {
            clientDetails.savingsAccounts.forEach((acc: any, idx: number) => {
                this.logger.log(`[getWalletTransactions] Account ${idx}: id=${acc.id}, active=${acc.status?.active}, depositType=${acc.depositType?.id}`);
            });
        }

        // Find active savings account (simplified to match getWalletBalance logic)
        const savingsAccount = clientDetails.savingsAccounts?.find((acc: any) =>
            acc.status?.active === true && acc.depositType?.id === 100 // Savings
        );

        if (!savingsAccount) {
            this.logger.warn(`[getWalletTransactions] No active savings account found for client ${clientId}`);
            return { transactions: [], total: 0 };
        }

        this.logger.log(`[getWalletTransactions] Found savings account ID: ${savingsAccount.id}`);

        // 2. Fetch Transactions from Fineract
        const fineractTxns = await this.fineractService.getSavingsAccountTransactions(savingsAccount.id);
        this.logger.log(`[getWalletTransactions] Fetched ${fineractTxns.length} transactions from Fineract`);

        // 3. Transform to our format
        const transactions = fineractTxns
            .slice(offset, offset + limit)
            .map((txn: any) => {
                // Determine transaction type based on Fineract transaction type
                let type = 'transfer_in';
                if (txn.transactionType?.deposit) {
                    type = 'deposit';
                } else if (txn.transactionType?.withdrawal) {
                    type = 'withdrawal';
                } else if (txn.transactionType?.transfer) {
                    type = txn.submittedByUsername ? 'transfer_in' : 'transfer_out';
                }

                // Enhance description mapping
                // Priority: note > paymentType name > default
                let description = 'Giao dịch ví';
                if (txn.note) {
                    description = txn.note;
                } else if (txn.transfer?.note) {
                    description = txn.transfer.note;
                } else if (txn.transfer?.description) {
                    description = txn.transfer.description;
                } else if (txn.paymentDetailData?.paymentType?.name) {
                    description = txn.paymentDetailData.paymentType.name;
                }

                // Grouping Logic: Identify P2P Context
                // 1. If note contains "Giải ngân", group by Loan ID
                // 2. If note contains "Ký quỹ", group by Investment ID
                // For now, return raw but with standardized description
                return {
                    id: String(txn.id),
                    type: type,
                    amount: txn.amount || 0,
                    date: txn.date ? new Date(txn.date[0], txn.date[1] - 1, txn.date[2]).toISOString() : new Date().toISOString(),
                    description: description,
                    balance: txn.runningBalance || 0,
                    context: description // Alias for grouping in Frontend if needed
                };
            });

        // ✅ Group transactions by Context if they happen on same day
        // ✅ Group transactions by Context if they happen on same day
        const groupedTransactions: any[] = [];
        let skippedIndices = new Set();

        for (let i = 0; i < transactions.length; i++) {
            if (skippedIndices.has(i)) continue;

            const current = transactions[i];

            // P2P Logic: Just return the transaction with refined description
            // The Fineract 'note' is already the best source of truth.
            groupedTransactions.push(current);
        }

        this.logger.log(`[getWalletTransactions] Returning ${groupedTransactions.length} transactions`);

        return {
            transactions: groupedTransactions,
            total: fineractTxns.length,
        };
    }

    /**
     * Transfer money to another user
     */
    async transfer(
        senderUsername: string,
        recipientPhone: string,
        amount: number,
        note?: string
    ) {
        this.logger.log(`[transfer] START: ${senderUsername} → ${recipientPhone}, amount: ${amount}`);

        // Validate amount
        if (amount <= 0) {
            throw new Error('Số tiền phải lớn hơn 0');
        }

        // Validate sender != recipient
        if (senderUsername === recipientPhone) {
            throw new Error('Không thể chuyển tiền cho chính mình');
        }

        // Resolve sender
        const senderWallet = await this.resolveOrCreateWallet(senderUsername);
        const senderClientId = parseInt(senderWallet.fineractClientId);
        const senderAccount = await this.fineractService.getClientSavingsAccount(senderClientId);

        if (!senderAccount) {
            throw new Error('Tài khoản người gửi không tồn tại');
        }

        // Check balance
        if (senderAccount.balance < amount) {
            throw new Error(`Số dư không đủ. Hiện tại: ${senderAccount.balance.toLocaleString('vi-VN')} VND`);
        }

        // Resolve recipient
        this.logger.log(`[transfer] Resolving recipient: ${recipientPhone}`);
        const recipientClientId = await this.fineractService['resolveClientId'](recipientPhone);

        if (!recipientClientId) {
            throw new Error('Người nhận không tồn tại trong hệ thống');
        }

        const recipientAccount = await this.fineractService.getClientSavingsAccount(recipientClientId);
        if (!recipientAccount) {
            throw new Error('Tài khoản người nhận không tồn tại');
        }

        // Transfer
        const transferNote = note || `Chuyển tiền từ ${senderUsername}`;
        this.logger.log(`[transfer] Transferring ${amount} from ${senderClientId}:${senderAccount.id} → ${recipientClientId}:${recipientAccount.id}`);

        const transferResult = await this.fineractService.transferFunds(
            senderClientId,
            recipientClientId,
            senderAccount.id,
            recipientAccount.id,
            amount,
            transferNote
        );

        const transactionId = String(transferResult.savingsId || transferResult.resourceId);
        this.logger.log(`[transfer] SUCCESS: Transaction ID ${transactionId}`);

        // Get updated balances
        const updatedSender = await this.fineractService.getClientSavingsAccount(senderClientId);
        const updatedRecipient = await this.fineractService.getClientSavingsAccount(recipientClientId);

        if (!updatedSender || !updatedRecipient) {
            throw new Error('Không thể lấy thông tin số dư sau giao dịch');
        }

        return {
            transactionId,
            senderBalance: updatedSender.balance,
            recipientBalance: updatedRecipient.balance,
            message: `Chuyển ${amount.toLocaleString('vi-VN')} VND thành công đến ${recipientPhone}`
        };
    }
}
