import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet } from './schemas/wallet.schema';
import { User } from '../users/schemas/user.schema';
import { FineractService } from '../fineract/fineract.service';

export interface WalletInfo {
  id: string; // MongoDB ID
  fineractId: string;
  accountNo: string;
  productId: number;
  productName: string;
  type: 'e_wallet' | 'fixed_deposit' | 'recurring_deposit';
  balance: number;
  currency: string;
  status: string;
  isDefault: boolean;
}

// Constants for minimum transfer amount
const MIN_TRANSFER_AMOUNT = 1000;
const DEFAULT_CURRENCY = 'VND';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly fineractService: FineractService,
  ) { }

  // -------------------- HELPER METHODS --------------------

  /**
   * Map Fineract savings data to WalletInfo
   */
  private mapToWalletInfo(ref: any, data: any): WalletInfo {
    return {
      id: ref._id.toString(),
      fineractId: ref.fineractSavingsId,
      accountNo: data.accountNo,
      productId: data.productId,
      productName: data.productName,
      type: this.fineractService.getWalletType(data),
      balance: data.summary?.accountBalance || 0,
      currency: data.currency?.code || DEFAULT_CURRENCY,
      status: data.status?.value || 'Unknown',
      isDefault: ref.isDefault || false,
    };
  }

  /**
   * Validate transfer request (balance, ownership)
   */
  private async validateTransferRequest(
    fromWalletId: string,
    fromUserId: string,
    amount: number,
  ): Promise<{ fromWallet: WalletInfo; fromUser: any; fromWalletRef: any }> {
    // Get source wallet
    const fromWallet = await this.getWalletByFineractId(fromWalletId);
    if (!fromWallet) throw new NotFoundException('Không tìm thấy ví nguồn');

    // Check balance
    if (fromWallet.balance < amount) {
      throw new BadRequestException(
        `Số dư không đủ. Hiện tại: ${fromWallet.balance.toLocaleString('vi-VN')} ${DEFAULT_CURRENCY}`,
      );
    }

    // Get sender user
    const fromUser = await this.userModel.findById(fromUserId).exec();
    if (!fromUser || !fromUser.fineractClientId) {
      throw new BadRequestException('Người gửi không hợp lệ hoặc chưa liên kết Fineract');
    }

    // Ownership check
    const fromWalletRef = await this.walletModel.findOne({
      fineractSavingsId: fromWalletId,
      userId: new Types.ObjectId(fromUserId),
    }).exec();

    if (!fromWalletRef) {
      throw new BadRequestException('Ví nguồn không thuộc về tài khoản của bạn');
    }

    return { fromWallet, fromUser, fromWalletRef };
  }

  /**
   * Get all wallets for a specific MongoDB User
   * Returns all Digital Wallets (e_wallet) from Fineract
   */
  async getWalletsByUserId(userId: string): Promise<WalletInfo[]> {
    this.logger.log(`[getWalletsByUserId] Fetching wallets for userId=${userId}`);

    // 1. Get all wallet references from MongoDB
    const walletRefs = await this.walletModel.find({ userId: new Types.ObjectId(userId) }).exec();
    this.logger.log(`[getWalletsByUserId] Found ${walletRefs.length} wallet references in MongoDB`);

    if (!walletRefs.length) {
      this.logger.warn(`[getWalletsByUserId] No wallet references found for userId=${userId}`);
      return [];
    }

    // 2. Fetch real-time data from Fineract for each wallet in parallel
    const results = await Promise.all(
      walletRefs.map(async (ref) => {
        try {
          return await this.getWalletById(ref._id.toString());
        } catch (error: any) {
          this.logger.error(`[getWalletsByUserId] Failed for wallet ref ${ref._id}: ${error.message}`);
          return null;
        }
      })
    );

    const wallets = results.filter((w): w is WalletInfo => w !== null);

    // Only return e-wallet accounts (exclude FD/recurring deposit)
    const eWallets = wallets.filter(w => w.type === 'e_wallet');
    this.logger.log(`[getWalletsByUserId] Successfully loaded ${wallets.length}/${walletRefs.length} wallets, ${eWallets.length} are e-wallets.`);

    return eWallets;
  }

  /**
   * Ensure wallet exists and belongs to user (for loan disbursement, etc.)
   */
  async ensureWalletBelongsToUser(walletId: string, userId: string): Promise<void> {
    const ref = await this.walletModel.findOne({
      _id: new Types.ObjectId(walletId),
      userId: new Types.ObjectId(userId),
    }).exec();
    if (!ref) {
      throw new NotFoundException('Ví giải ngân không tồn tại hoặc không thuộc về tài khoản của bạn');
    }
  }

  /**
   * Get real-time detailed wallet info by MongoDB ID
   * Uses Fineract as source of truth for all wallet data
   */
  async getWalletById(walletId: string): Promise<WalletInfo | null> {
    const ref = await this.walletModel.findById(walletId).exec();
    if (!ref) {
      this.logger.warn(`[getWalletById] Wallet ref not found in MongoDB: ${walletId}`);
      throw new NotFoundException('Không tìm thấy ví');
    }

    try {
      const data = await this.fineractService.getSavingsAccountDetails(ref.fineractSavingsId);
      if (!data) {
        this.logger.error(`[getWalletById] Fineract account ${ref.fineractSavingsId} not found`);
        throw new NotFoundException(`Không tìm thấy tài khoản Fineract ${ref.fineractSavingsId}`);
      }
      return this.mapToWalletInfo(ref, data);
    } catch (error: any) {
      this.logger.error(`[getWalletById] Failed to fetch Fineract data for wallet ${walletId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get real-time detailed wallet info by Fineract ID
   */
  async getWalletByFineractId(fineractId: string, userId?: string): Promise<WalletInfo | null> {
    const query: any = { fineractSavingsId: fineractId };
    if (userId) query.userId = new Types.ObjectId(userId);

    const ref = await this.walletModel.findOne(query).exec();
    if (!ref) throw new NotFoundException('Không tìm thấy ví');

    const data = await this.fineractService.getSavingsAccountDetails(ref.fineractSavingsId);
    return this.mapToWalletInfo(ref, data);
  }

  /**
   * Get total balance across all wallets for a user
   */
  async getTotalBalance(userId: string): Promise<number> {
    const wallets = await this.getWalletsByUserId(userId);
    return wallets.reduce((sum, w) => sum + w.balance, 0);
  }

  /**
   * Force sync wallets from Fineract
   * Syncs ALL savings accounts (both active and inactive, but not closed)
   * Phone number (username) is the primary identifier for the user
   */
  async syncWalletsFromFineract(userId: string): Promise<{ synced: number; wallets: string[] }> {
    this.logger.log(`[syncWalletsFromFineract] Starting sync for userId=${userId}`);

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new Error('User not found');
    }

    // Proactive linking if ID is missing
    if (!user.fineractClientId) {
      this.logger.log(`[syncWalletsFromFineract] Attempting to link user ${user.username} (missing fineractClientId)`);

      // Try multiple identifiers (consistent with UserSyncService)
      const identifiers = [`KEYCLOAK_${user.username}`, user.username];
      let client: any = null;

      for (const id of identifiers) {
        client = await this.fineractService.findClientByIdentifier(id);
        if (client) break;
      }

      if (client) {
        user.fineractClientId = client.id.toString();
        await (user as any).save();
        this.logger.log(`[syncWalletsFromFineract] Successfully linked user ${user.username} to Fineract clientId=${user.fineractClientId}`);
      } else {
        throw new Error('User not linked to Fineract (No matching client found)');
      }
    }

    const clientId = Number(user.fineractClientId);
    this.logger.log(`[syncWalletsFromFineract] User ${user.username} (phone) linked to Fineract clientId=${clientId}`);

    // Get ALL savings accounts from Fineract (not just active)
    const accounts = await this.fineractService.getSavingsAccounts(clientId);
    this.logger.log(`[syncWalletsFromFineract] Found ${accounts.length} savings accounts in Fineract`);

    let syncedCount = 0;
    const syncedIds: string[] = [];
    const skippedClosed: number[] = [];

    for (const account of accounts) {
      const accountId = account.id.toString();
      const accountStatus = account.status?.value || 'Unknown';
      const walletType = this.fineractService.getWalletType(account);

      // Skip closed accounts
      if (accountStatus === 'Closed') {
        skippedClosed.push(account.id);
        this.logger.debug(`[syncWalletsFromFineract] Skipping closed account ${accountId} (${walletType})`);
        continue;
      }

      // Check if wallet already exists for THIS user
      const existing = await this.walletModel.findOne({
        fineractSavingsId: accountId,
        userId: user._id
      }).exec();

      if (!existing) {
        // If it exists for ANOTHER user, we should probably reassign it or create a new one
        // To be safe, let's look for it regardless of user first
        const globalExisting = await this.walletModel.findOne({ fineractSavingsId: accountId }).exec();

        if (globalExisting) {
          // Reassign to correct user
          globalExisting.userId = user._id;
          await globalExisting.save();
          syncedIds.push(globalExisting.fineractSavingsId);
          syncedCount++;
          this.logger.log(`[syncWalletsFromFineract] Reassigned wallet ${accountId} to user ${user.username}`);
        } else {
          // Create new wallet reference
          const newWallet = await this.walletModel.create({
            userId: user._id,
            fineractSavingsId: accountId,
          });
          syncedIds.push(newWallet.fineractSavingsId);
          syncedCount++;
          this.logger.log(`[syncWalletsFromFineract] Created new wallet reference: ${accountId} (${walletType}, status=${accountStatus})`);
        }
      } else {
        // Wallet already exists and belongs to this user
        syncedIds.push(existing.fineractSavingsId);
        this.logger.debug(`[syncWalletsFromFineract] Wallet ${accountId} (${walletType}) already correctly mapped`);
      }
    }

    this.logger.log(
      `[syncWalletsFromFineract] Sync complete: ${syncedCount} new wallets, ${syncedIds.length} total wallets, ${skippedClosed.length} closed accounts skipped`,
    );

    return { synced: syncedCount, wallets: syncedIds };
  }

  /**
   * Transfer money between wallets
   */
  async transferBetweenWallets(
    fromWalletId: string,
    toWalletId: string,
    amount: number,
    description?: string,
  ): Promise<{ transactionId: string; fromWallet: any; toWallet: any }> {
    // fromWalletId and toWalletId are now Fineract IDs, not MongoDB IDs
    const fromWallet = await this.getWalletByFineractId(fromWalletId);
    const toWallet = await this.getWalletByFineractId(toWalletId);

    if (!fromWallet || !toWallet) {
      throw new NotFoundException('Không tìm thấy ví');
    }

    if (fromWallet.balance < amount) {
      throw new BadRequestException(`Số dư không đủ. Số dư hiện tại: ${fromWallet.balance.toLocaleString('vi-VN')} VND`);
    }

    // Find users by wallet's fineractSavingsId
    const fromWalletRef = await this.walletModel.findOne({ fineractSavingsId: fromWalletId }).exec();
    const toWalletRef = await this.walletModel.findOne({ fineractSavingsId: toWalletId }).exec();

    if (!fromWalletRef || !toWalletRef) {
      throw new NotFoundException('Không tìm thấy thông tin ví');
    }

    const fromUser = await this.userModel.findById(fromWalletRef.userId).exec();
    const toUser = await this.userModel.findById(toWalletRef.userId).exec();

    if (!fromUser?.fineractClientId || !toUser?.fineractClientId) {
      throw new BadRequestException('Người dùng chưa được liên kết với Fineract');
    }

    // Use the specific fineractId provided (fromWalletId and toWalletId are Fineract IDs)
    // Don't use getActiveEWalletAccount() which only returns the first wallet
    // Instead, get the specific account details by fineractId
    const fromAccountDetails = await this.fineractService.getSavingsAccountDetails(fromWalletId);
    const toAccountDetails = await this.fineractService.getSavingsAccountDetails(toWalletId);

    if (!fromAccountDetails || !toAccountDetails) {
      throw new NotFoundException('Không tìm thấy tài khoản ví điện tử');
    }

    // Verify both accounts belong to the correct users
    if (fromAccountDetails.clientId !== Number(fromUser.fineractClientId)) {
      throw new BadRequestException('Ví nguồn không thuộc về người gửi');
    }
    if (toAccountDetails.clientId !== Number(toUser.fineractClientId)) {
      throw new BadRequestException('Ví đích không thuộc về người nhận');
    }

    // Verify both are e-wallets
    const fromWalletType = this.fineractService.getWalletType(fromAccountDetails);
    const toWalletType = this.fineractService.getWalletType(toAccountDetails);
    if (fromWalletType !== 'e_wallet' || toWalletType !== 'e_wallet') {
      throw new BadRequestException('Chỉ có thể chuyển tiền giữa các ví điện tử');
    }

    const transferNote = description || `Chuyển tiền từ ${fromUser.username || fromUser.keycloakId}`;
    const result = await this.fineractService.transferFunds(
      Number(fromUser.fineractClientId),
      Number(toUser.fineractClientId),
      Number(fromWalletId), // Use the fineractId directly
      Number(toWalletId), // Use the fineractId directly
      amount,
      transferNote,
    );

    // Refresh wallet balances
    const updatedFromWallet = await this.getWalletByFineractId(fromWalletId);
    const updatedToWallet = await this.getWalletByFineractId(toWalletId);

    return {
      transactionId: String(result.resourceId),
      fromWallet: updatedFromWallet,
      toWallet: updatedToWallet,
    };
  }

  /**
   * Transfer money by phone number
   */
  async transferByPhone(
    fromUserId: string,
    fromWalletId: string,
    recipientPhone: string,
    amount: number,
    description?: string,
  ): Promise<{ transactionId: string; fromWallet: any; toWallet?: any }> {
    // Use shared validation helper
    const { fromWallet, fromUser } = await this.validateTransferRequest(fromWalletId, fromUserId, amount);

    // Find recipient by phone number
    const recipientUser = await this.userModel.findOne({
      $or: [{ username: recipientPhone }, { 'metadata.phone': recipientPhone }],
    }).exec();

    if (!recipientUser || !recipientUser.fineractClientId) {
      throw new NotFoundException('Người nhận không tồn tại trong hệ thống');
    }

    if (fromUser._id.toString() === recipientUser._id.toString()) {
      throw new BadRequestException('Không thể chuyển tiền cho chính mình');
    }

    // Get the recipient's active e-wallet
    const toAccount = await this.fineractService.getActiveEWalletAccount(Number(recipientUser.fineractClientId));
    if (!toAccount) {
      throw new NotFoundException('Người nhận chưa có ví điện tử active');
    }

    // Execute transfer
    const transferNote = description || `Chuyển tiền từ ${fromUser.username || fromUser.keycloakId} đến ${recipientPhone}`;
    const result = await this.fineractService.transferFunds(
      Number(fromUser.fineractClientId),
      Number(recipientUser.fineractClientId),
      Number(fromWalletId),
      toAccount.id,
      amount,
      transferNote,
    );

    // Refresh and return
    const updatedFromWallet = await this.getWalletByFineractId(fromWalletId);
    const recipientWallets = await this.getWalletsByUserId(recipientUser._id.toString());
    const recipientEWallet = recipientWallets.find((w) => w.type === 'e_wallet');

    return {
      transactionId: String(result.resourceId),
      fromWallet: updatedFromWallet,
      toWallet: recipientEWallet,
    };
  }

  /**
   * Get Wallet Transactions
   * Fetches transaction history for user's e-wallet accounts from Fineract
   * Phone number (username) is the primary identifier for the user
   * walletId (Fineract Savings ID) is optional - if provided, returns transactions for that specific wallet
   */
  async getWalletTransactions(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    walletId?: string,
  ): Promise<{ transactions: any[]; total: number }> {
    this.logger.log(`[getWalletTransactions] START: userId=${userId}, limit=${limit}, offset=${offset}, walletId=${walletId || 'all'}`);

    // 1. Get user and Fineract client ID
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.fineractClientId) {
      this.logger.warn(`[getWalletTransactions] User ${userId} (phone=${user?.username}) not found or no Fineract client ID`);
      return { transactions: [], total: 0 };
    }

    const clientId = Number(user.fineractClientId);
    this.logger.log(`[getWalletTransactions] User ${user.username} (phone) linked to Fineract clientId=${clientId}`);

    let savingsAccountId: number;

    if (walletId) {
      // Specific wallet history - use the provided Fineract Savings ID
      this.logger.log(`[getWalletTransactions] Using specific walletId=${walletId}`);
      const accountDetails = await this.fineractService.getSavingsAccountDetails(walletId);

      if (!accountDetails) {
        this.logger.warn(`[getWalletTransactions] No savings account found for walletId=${walletId}`);
        return { transactions: [], total: 0 };
      }

      // Verify wallet belongs to this user
      if (accountDetails.clientId !== clientId) {
        this.logger.warn(
          `[getWalletTransactions] Wallet ${walletId} does not belong to client ${clientId} (account clientId=${accountDetails.clientId})`,
        );
        return { transactions: [], total: 0 };
      }

      // Verify it's an e-wallet
      const walletType = this.fineractService.getWalletType(accountDetails);
      if (walletType !== 'e_wallet') {
        this.logger.warn(`[getWalletTransactions] Wallet ${walletId} is not an e-wallet (type=${walletType})`);
        return { transactions: [], total: 0 };
      }

      savingsAccountId = Number(walletId);
    } else {
      // Default: use first active e-wallet (for backward compatibility)
      const eWalletAccount = await this.fineractService.getActiveEWalletAccount(clientId);
      if (!eWalletAccount) {
        this.logger.warn(`[getWalletTransactions] No active e-wallet account found for client ${clientId}`);
        return { transactions: [], total: 0 };
      }

      this.logger.log(`[getWalletTransactions] Using default active e-wallet account ID: ${eWalletAccount.id}`);
      savingsAccountId = eWalletAccount.id;
    }

    // 3. Fetch Transactions from Fineract
    const { pageItems: fineractTxns, totalFilteredRecords } = await this.fineractService.getSavingsAccountTransactions(
      savingsAccountId,
      limit,
      offset,
    );
    this.logger.log(`[getWalletTransactions] Fetched ${fineractTxns.length} transactions from Fineract`);

    // 4. Transform to our format
    const transactions = fineractTxns.map((txn: any) => {
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
      // Priority: transfer description > note > paymentType name > default
      let description = 'Giao dịch ví';
      if (txn.transfer?.transferDescription) {
        description = txn.transfer.transferDescription;
      } else if (txn.note) {
        description = txn.note;
      } else if (txn.transfer?.note) {
        description = txn.transfer.note;
      } else if (txn.paymentDetailData?.paymentType?.name) {
        description = txn.paymentDetailData.paymentType.name;
      } else if (txn.transactionType?.value) {
        description = txn.transactionType.value;
      }

      // Parse date from Fineract format [year, month, day]
      let date: string;
      if (txn.date && Array.isArray(txn.date) && txn.date.length === 3) {
        date = new Date(txn.date[0], txn.date[1] - 1, txn.date[2]).toISOString();
      } else {
        date = new Date().toISOString();
      }

      return {
        id: String(txn.id),
        type: type,
        amount: txn.amount || 0,
        date: date,
        description: description,
        balance: txn.runningBalance || 0,
        context: description, // Alias for grouping in Frontend if needed
        transferId: txn.transfer?.id, // Include transfer ID for detail fetching
      };
    });

    return {
      transactions: transactions,
      total: totalFilteredRecords,
    };
  }

  /**
   * Set a wallet as default for a user
   */
  async setDefaultWallet(userId: string, walletId: string): Promise<WalletInfo> {
    this.logger.log(`[setDefaultWallet] Setting wallet ${walletId} as default for userId=${userId}`);

    // 1. Verify wallet exists and belongs to user
    const wallet = await this.walletModel.findOne({ _id: new Types.ObjectId(walletId), userId: new Types.ObjectId(userId) }).exec();
    if (!wallet) {
      this.logger.warn(`[setDefaultWallet] Wallet ${walletId} not found or doesn't belong to user ${userId}`);
      throw new NotFoundException('Không tìm thấy ví');
    }

    // 2. Unset current default wallet for this user
    await this.walletModel.updateMany(
      { userId: new Types.ObjectId(userId), isDefault: true },
      { $set: { isDefault: false } }
    ).exec();

    // 3. Set this wallet as default
    wallet.isDefault = true;
    await wallet.save();

    this.logger.log(`[setDefaultWallet] Successfully set wallet ${walletId} as default`);

    const result = await this.getWalletById(walletId);
    if (!result) throw new NotFoundException('Không thể lấy thông tin ví sau khi cập nhật');
    return result;
  }

  /**
   * Transfer money by account number
   */
  async transferByAccountNumber(
    fromUserId: string,
    fromWalletId: string, // fineractSavingsId
    recipientAccountNo: string,
    amount: number,
    description?: string,
  ): Promise<{ transactionId: string; fromWallet: any; toWallet?: any }> {
    this.logger.log(`[transferByAccountNumber] fromWalletId=${fromWalletId} -> toAccountNo=${recipientAccountNo}, amount=${amount}`);

    // Use shared validation helper
    const { fromWallet, fromUser } = await this.validateTransferRequest(fromWalletId, fromUserId, amount);

    // Resolve recipient by Account Number in Fineract
    const toAccount = await this.fineractService.getSavingsAccountByAccountNumber(recipientAccountNo);
    if (!toAccount) {
      throw new NotFoundException('Không tìm thấy tài khoản đích trong hệ thống Fineract');
    }

    if (toAccount.id === Number(fromWalletId)) {
      throw new BadRequestException('Không thể chuyển tiền cho chính tài khoản này');
    }

    // Resolve recipient user (optional for UX)
    const recipientUser = await this.userModel.findOne({ fineractClientId: String(toAccount.clientId) }).exec();

    // Execute transfer
    const transferNote = description || `Chuyển tiền đến số tài khoản ${recipientAccountNo}`;
    const result = await this.fineractService.transferFunds(
      Number(fromUser.fineractClientId),
      toAccount.clientId,
      Number(fromWalletId),
      toAccount.id,
      amount,
      transferNote,
    );

    // Refresh and return
    const updatedFromWallet = await this.getWalletByFineractId(fromWalletId);
    let toWalletInfo: any = null;
    if (recipientUser) {
      const recipientWallets = await this.getWalletsByUserId(recipientUser._id.toString());
      toWalletInfo = recipientWallets.find(w => w.fineractId === String(toAccount.id));
    }

    return {
      transactionId: String(result.resourceId),
      fromWallet: updatedFromWallet,
      toWallet: toWalletInfo,
    };
  }
}
