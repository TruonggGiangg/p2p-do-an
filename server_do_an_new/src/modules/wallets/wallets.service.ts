import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet } from './schemas/wallet.schema';
import { User } from '../users/schemas/user.schema';
import { FineractService } from '../fineract/fineract.service';

import { OtpSessionService } from '../smart-otp/services/otp-session.service';
import { SmartOtpService } from '../smart-otp/services/smart-otp.service';
import { OtpActionType } from '../smart-otp/enums/otp-action-type.enum';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto';

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
    private readonly otpSessionService: OtpSessionService,
    private readonly smartOtpService: SmartOtpService,
  ) {}

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
    // Get sender user first to check frozen/banned status
    const fromUser = await this.userModel.findById(fromUserId).exec();
    if (!fromUser || !fromUser.fineractClientId) {
      throw new BadRequestException('Người gửi không hợp lệ hoặc chưa liên kết Fineract');
    }

    // Block outgoing transactions for frozen accounts (only repayment allowed)
    const meta = (fromUser as any).metadata || {};
    if (meta.accountFrozen) {
      throw new BadRequestException(
        `Tài khoản đã bị đóng băng do nợ quá hạn (${meta.frozenReason || 'Nhóm nợ cao'}). Chỉ cho phép giao dịch trả nợ.`,
      );
    }
    if (meta.permanentBan) {
      throw new BadRequestException(
        `Tài khoản đã bị cấm vĩnh viễn (${meta.banReason || 'Nợ có khả năng mất vốn'}). Vui lòng liên hệ hỗ trợ.`,
      );
    }

    // Get source wallet
    const fromWallet = await this.getWalletByFineractId(fromWalletId);
    if (!fromWallet) throw new NotFoundException('Không tìm thấy ví nguồn');

    // Check balance
    if (fromWallet.balance < amount) {
      throw new BadRequestException(
        `Số dư không đủ. Hiện tại: ${fromWallet.balance.toLocaleString('vi-VN')} ${DEFAULT_CURRENCY}`,
      );
    }

    // Ownership check
    const fromWalletRef = await this.walletModel
      .findOne({
        fineractSavingsId: fromWalletId,
        userId: new Types.ObjectId(fromUserId),
      })
      .select('_id fineractSavingsId')
      .lean()
      .exec();

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
    const walletRefs = await this.walletModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id fineractSavingsId isDefault')
      .lean()
      .exec();
    this.logger.log(`[getWalletsByUserId] Found ${walletRefs.length} wallet references in MongoDB`);

    if (!walletRefs.length) {
      this.logger.warn(`[getWalletsByUserId] No wallet references found for userId=${userId}`);
      return [];
    }

    // 2. Fetch real-time data from Fineract for each wallet in parallel
    const results = await Promise.all(
      walletRefs.map(async ref => {
        try {
          return await this.getWalletById(ref._id.toString());
        } catch (error: any) {
          this.logger.error(`[getWalletsByUserId] Failed for wallet ref ${ref._id}: ${error.message}`);
          return null;
        }
      }),
    );

    const wallets = results.filter((w): w is WalletInfo => w !== null);

    // Only return e-wallet accounts (exclude FD/recurring deposit)
    const eWallets = wallets.filter(w => w.type === 'e_wallet');
    this.logger.log(
      `[getWalletsByUserId] Successfully loaded ${wallets.length}/${walletRefs.length} wallets, ${eWallets.length} are e-wallets.`,
    );

    return eWallets;
  }

  /**
   * Ensure wallet exists and belongs to user (for loan disbursement, etc.)
   */
  async ensureWalletBelongsToUser(walletId: string, userId: string): Promise<void> {
    const ref = await this.walletModel
      .findOne({
        _id: new Types.ObjectId(walletId),
        userId: new Types.ObjectId(userId),
      })
      .select('_id')
      .lean()
      .exec();
    if (!ref) {
      throw new NotFoundException('Ví giải ngân không tồn tại hoặc không thuộc về tài khoản của bạn');
    }
  }

  /**
   * Get real-time detailed wallet info by MongoDB ID
   * Uses Fineract as source of truth for all wallet data
   */
  async getWalletById(walletId: string): Promise<WalletInfo | null> {
    const ref = await this.walletModel.findById(walletId).lean().exec();
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

    const ref = await this.walletModel.findOne(query).lean().exec();
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
        this.logger.log(
          `[syncWalletsFromFineract] Successfully linked user ${user.username} to Fineract clientId=${user.fineractClientId}`,
        );
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
      const existing = await this.walletModel
        .findOne({
          fineractSavingsId: accountId,
          userId: user._id,
        })
        .exec();

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
          this.logger.log(
            `[syncWalletsFromFineract] Created new wallet reference: ${accountId} (${walletType}, status=${accountStatus})`,
          );
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
   * Transfer money between wallets (Initiate)
   */
  async transferBetweenWallets(
    userId: string,
    fromWalletId: string,
    toWalletId: string,
    amount: number,
    deviceId: string,
    description?: string,
  ): Promise<any> {
    // 1. Verify wallets ownership and balances
    const { fromWallet, fromUser } = await this.validateTransferRequest(fromWalletId, userId, amount);

    const toWalletRef = await this.walletModel.findOne({ fineractSavingsId: toWalletId }).exec();
    if (!toWalletRef) {
      throw new NotFoundException('Không tìm thấy thông tin ví đích');
    }

    const toUser = await this.userModel.findById(toWalletRef.userId).exec();
    if (!toUser?.fineractClientId) {
      throw new BadRequestException('Người nhận chưa được liên kết với Fineract');
    }

    const toAccountDetails = await this.fineractService.getSavingsAccountDetails(toWalletId);
    if (!toAccountDetails || this.fineractService.getWalletType(toAccountDetails) !== 'e_wallet') {
      throw new BadRequestException('Ví đích không hợp lệ hoặc không phải ví điện tử');
    }

    // 2. Create OTP Session
    return this.otpSessionService.createSession(
      userId,
      deviceId,
      OtpActionType.TRANSFER,
      {
        fromWalletId,
        toAccountId: toWalletId,
        toClientId: toUser.fineractClientId,
        amount,
        description: description || `Chuyển quỹ nội bộ đến ${toWalletId}`,
        type: 'INTERNAL_TRANSFER',
      }
    );
  }

  /**
   * Transfer money by phone number (Initiate)
   */
  async transferByPhone(
    userId: string,
    fromWalletId: string,
    recipientPhone: string,
    amount: number,
    deviceId: string,
    description?: string,
  ): Promise<any> {
    // 1. Validation
    const { fromWallet, fromUser } = await this.validateTransferRequest(fromWalletId, userId, amount);

    // 2. Find recipient user
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const recipientUser = await this.userModel.findOne({
      $or: [{ username: cleanPhone }, { phoneNumber: cleanPhone }, { 'metadata.phone': cleanPhone }],
    }).exec();

    if (!recipientUser || !recipientUser.fineractClientId) {
      throw new NotFoundException('Không tìm thấy người dùng nhận hoặc người nhận chưa liên kết Fineract');
    }

    // 3. Get recipient's active e-wallet
    const toAccount = await this.fineractService.getActiveEWalletAccount(Number(recipientUser.fineractClientId));
    if (!toAccount) {
      throw new NotFoundException('Người nhận chưa có ví điện tử active');
    }

    if (toAccount.id === Number(fromWalletId)) {
      throw new BadRequestException('Không thể chuyển tiền cho chính mình');
    }

    // 4. Create OTP Session
    return this.otpSessionService.createSession(
      userId,
      deviceId,
      OtpActionType.TRANSFER,
      {
        fromWalletId,
        toAccountId: toAccount.id,
        toClientId: recipientUser.fineractClientId,
        amount,
        description: description || `Chuyển tiền qua SĐT đến ${recipientPhone}`,
        recipientName: recipientUser.username,
        type: 'TRANSFER_BY_PHONE',
      }
    );
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
    this.logger.log(
      `[getWalletTransactions] START: userId=${userId}, limit=${limit}, offset=${offset}, walletId=${walletId || 'all'}`,
    );

    // 1. Get user and Fineract client ID
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.fineractClientId) {
      this.logger.warn(
        `[getWalletTransactions] User ${userId} (phone=${user?.username}) not found or no Fineract client ID`,
      );
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

      // Dịch các nhãn tiếng Anh mặc định của Fineract sang tiếng Việt
      const FINERACT_VI: Record<string, string> = {
        'Interest posting': 'Ghi nhận lãi suất',
        'Interest Posting': 'Ghi nhận lãi suất',
        'Withdrawal': 'Rút tiền',
        'Deposit': 'Nạp tiền',
        'Account Transfer': 'Chuyển khoản nội bộ',
        'Withdrawal Fee': 'Phí rút tiền',
        'Annual Fee': 'Phí thường niên',
        'Pay Charge': 'Thanh toán phí',
        'Overdraft Interest': 'Lãi thấu chi',
        'Withhold Tax': 'Thuế khấu trừ',
      };
      description = FINERACT_VI[description] || description;

      // Parse date from Fineract format [year, month, day]
      let date: string;
      if (txn.date && Array.isArray(txn.date) && txn.date.length === 3) {
        date = new Date(txn.date[0], txn.date[1] - 1, txn.date[2]).toISOString();
      } else {
        date = new Date().toISOString();
      }

      // Fineract luôn trả amount dương — đảo dấu cho giao dịch rút/chuyển ra
      const rawAmount = txn.amount || 0;
      const signedAmount = (type === 'withdrawal' || type === 'transfer_out') ? -rawAmount : rawAmount;

      return {
        id: String(txn.id),
        type: type,
        amount: signedAmount,
        date: date,
        description: description,
        balance: txn.runningBalance || 0,
        context: description,
        transferId: txn.transfer?.id,
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
    const wallet = await this.walletModel
      .findOne({ _id: new Types.ObjectId(walletId), userId: new Types.ObjectId(userId) })
      .exec();
    if (!wallet) {
      this.logger.warn(`[setDefaultWallet] Wallet ${walletId} not found or doesn't belong to user ${userId}`);
      throw new NotFoundException('Không tìm thấy ví');
    }

    // 2. Unset current default wallet for this user
    await this.walletModel
      .updateMany({ userId: new Types.ObjectId(userId), isDefault: true }, { $set: { isDefault: false } })
      .exec();

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
  /**
   * Smart Resolution Transfer by Account Number or Phone (Initiate)
   */
  async transferByAccountNumber(
    fromUserId: string,
    fromWalletId: string,
    recipientAccountNo: string,
    amount: number,
    deviceId: string,
    description?: string,
  ): Promise<any> {
    // Use shared validation helper
    const { fromWallet, fromUser } = await this.validateTransferRequest(fromWalletId, fromUserId, amount);

    // Normalize input for phone search
    const cleanPhone = recipientAccountNo.replace(/\D/g, '');
    const phoneVariants = [
      cleanPhone, // 0999000002
      cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone, // 999000002
      cleanPhone.startsWith('0') ? `+84${cleanPhone.substring(1)}` : `+84${cleanPhone}`, // +84999000002
    ];

    // Step 1: Smart Resolution - Try MongoDB first (Fastest)
    let toAccount: any = null;
    let recipientUser = await this.userModel
      .findOne({
        $or: [
          { username: { $in: phoneVariants } },
          { phoneNumber: { $in: phoneVariants } },
          { 'metadata.phone': { $in: phoneVariants } },
        ],
      })
      .exec();

    if (recipientUser && recipientUser.fineractClientId) {
      this.logger.log(
        `[transferByAccountNumber] Resolved recipientAccountNo=${recipientAccountNo} as Phone for User=${recipientUser.username}`,
      );
      // Get the recipient's active e-wallet
      toAccount = await this.fineractService.getActiveEWalletAccount(Number(recipientUser.fineractClientId));
      if (!toAccount) {
        throw new NotFoundException(`Người nhận ${recipientUser.username} chưa có ví điện tử active`);
      }
    } else {
      // Step 2: Try searching directly in Fineract Clients by phone/identifier
      const fineractClient = await this.fineractService.findClientByIdentifier(recipientAccountNo);
      
      if (fineractClient) {
        toAccount = await this.fineractService.getActiveEWalletAccount(Number(fineractClient.id));
        if (!toAccount) {
          throw new NotFoundException(`Người nhận tìm thấy trên Fineract nhưng chưa có ví điện tử active`);
        }
      } else {
        // Step 3: Fallback - Resolve recipient by Account Number in Fineract directly
        toAccount = await this.fineractService.getSavingsAccountByAccountNumber(recipientAccountNo);
        if (!toAccount) {
          throw new NotFoundException('Không tìm thấy tài khoản hoặc số điện thoại đích. Vui lòng kiểm tra lại.');
        }
      }
    }

    if (toAccount.id === Number(fromWalletId)) {
      throw new BadRequestException('Không thể chuyển tiền cho chính mình');
    }

    // Final Stage: Create OTP Session
    const isPhone = recipientUser && (recipientUser.username === recipientAccountNo || recipientUser.metadata?.phone === recipientAccountNo);
    const contextDescription = description || `Chuyển tiền đến ${isPhone ? 'SĐT' : 'STK'} ${recipientAccountNo}`;

    return this.otpSessionService.createSession(
      fromUserId,
      deviceId,
      OtpActionType.TRANSFER,
      {
        fromWalletId,
        toAccountId: toAccount.id,
        toClientId: toAccount.clientId,
        amount,
        description: contextDescription,
        recipientName: recipientUser?.username || `Tài khoản ${toAccount.accountNo}`,
        type: 'TRANSFER_BY_ACCOUNT',
      },
    );
  }

  /**
   * Confirm and execute transfer after Smart OTP verification
   */
  async confirmTransfer(userId: string, dto: ConfirmTransferDto): Promise<any> {
    // 1. Verify Smart OTP & Signature
    const verifyResult = await this.smartOtpService.verifySmartOtp(
      userId,
      dto.sessionId,
      dto.otp,
      dto.signature,
      dto.timestamp,
      dto.deviceId,
      OtpActionType.TRANSFER,
    );

    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message || 'Xác thực OTP không thành công');
    }

    // 2. Consume session and get transaction data
    const sessionResult = await this.otpSessionService.consumeSession(
      userId,
      dto.sessionId,
      OtpActionType.TRANSFER,
    );

    if (!sessionResult.valid) {
      throw new BadRequestException(sessionResult.message || 'Phiên làm việc không hợp lệ hoặc đã hết hạn');
    }

    const { fromWalletId, toAccountId, toClientId, amount, description } = sessionResult.actionData;

    // 3. Re-validate balance right before execution
    const { fromUser } = await this.validateTransferRequest(fromWalletId, userId, amount);

    this.logger.log(`[confirmTransfer] Executing transfer session=${dto.sessionId}, amount=${amount}`);

    // 4. Execute actual transfer on Fineract
    const result = await this.fineractService.transferFunds(
      Number(fromUser.fineractClientId),
      Number(toClientId),
      Number(fromWalletId),
      Number(toAccountId),
      amount,
      description,
    );

    // 5. Refresh from wallet to return updated balance
    const updatedFromWallet = await this.getWalletByFineractId(fromWalletId);

    return {
      message: 'Chuyển khoản thành công',
      transactionId: result.resourceId || result.transactionId,
      amount,
      description,
      fromWallet: updatedFromWallet,
      verifiedAt: new Date(),
    };
  }
}
