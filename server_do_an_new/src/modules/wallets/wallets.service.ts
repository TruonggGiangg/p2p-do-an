import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  type: 'credit_wallet' | 'e_wallet';
  balance: number;
  currency: string;
  status: string;
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly fineractService: FineractService,
  ) {}

  /**
   * Get all wallets for a specific MongoDB User
   */
  async getWalletsByUserId(userId: string): Promise<WalletInfo[]> {
    const walletRefs = await this.walletModel.find({ userId: new Types.ObjectId(userId) }).exec();
    if (!walletRefs.length) return [];

    const wallets: WalletInfo[] = [];

    for (const ref of walletRefs) {
      try {
        const info = await this.getWalletById(ref._id.toString());
        if (info) wallets.push(info);
      } catch (error) {
        this.logger.error(`Failed to fetch Fineract data for wallet ref ${ref._id}: ${error.message}`);
      }
    }

    return wallets;
  }

  /**
   * Get real-time detailed wallet info
   */
  async getWalletById(walletId: string): Promise<WalletInfo | null> {
    const ref = await this.walletModel.findById(walletId).exec();
    if (!ref) throw new NotFoundException('Không tìm thấy ví');

    const data = await this.fineractService.getSavingsAccountDetails(ref.fineractSavingsId);

    return {
      id: ref._id.toString(),
      fineractId: ref.fineractSavingsId,
      accountNo: data.accountNo,
      productId: data.productId,
      productName: data.productName,
      type: this.fineractService.getWalletType(data),
      balance: data.summary?.accountBalance || 0,
      currency: data.currency?.code || 'VND',
      status: data.status?.value || 'Unknown',
    };
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
   */
  async syncWalletsFromFineract(userId: string): Promise<{ synced: number; wallets: string[] }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.fineractClientId) {
      throw new Error('User not linked to Fineract');
    }

    const accounts = await this.fineractService.getSavingsAccounts(Number(user.fineractClientId));
    let syncedCount = 0;
    const syncedIds: string[] = [];

    for (const account of accounts) {
      if (account.status?.value === 'Closed') continue;

      const existing = await this.walletModel.findOne({ fineractSavingsId: account.id.toString() }).exec();
      if (!existing) {
        const newWallet = await this.walletModel.create({
          userId: user._id,
          fineractSavingsId: account.id.toString(),
        });
        syncedIds.push(newWallet.fineractSavingsId);
        syncedCount++;
      } else {
        syncedIds.push(existing.fineractSavingsId);
      }
    }

    return { synced: syncedCount, wallets: syncedIds };
  }
}
