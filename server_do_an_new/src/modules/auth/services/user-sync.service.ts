import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../../users/schemas/user.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { KeycloakService } from './keycloak.service';
import { FineractService } from '../../fineract/fineract.service';
import { KeycloakUser } from '../interfaces/auth.interface';
import { CreditScoreService } from '../../credit-score/credit-score.service';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserSyncService {
  private readonly logger = new Logger(UserSyncService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    private readonly keycloakService: KeycloakService,
    private readonly fineractService: FineractService,
    private readonly creditScoreService: CreditScoreService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sync user data from Keycloak & Fineract to MongoDB on login
   */
  async syncUser(keycloakUser: KeycloakUser): Promise<User> {
    const { keycloakUserId, username, email, name } = keycloakUser;

    // First, try to find user by keycloakId
    let mongoUser = await this.userModel.findOne({
      keycloakId: keycloakUserId,
    });

    // If not found by keycloakId, check by username (existing user without keycloakId)
    if (!mongoUser) {
      mongoUser = await this.userModel.findOne({ username });

      if (mongoUser) {
        // Update existing user with keycloakId
        this.logger.log(`[SYNC] Updating existing user ${username} with Keycloak ID`);
        mongoUser.keycloakId = keycloakUserId;
        if (email) mongoUser.email = email;
        await mongoUser.save();
      } else {
        // Create new user only if username doesn't exist
        mongoUser = await this.createMongoUser(keycloakUserId, username, email, name);
      }
    }

    if (!mongoUser.fineractClientId) {
      await this.linkFineractClient(mongoUser, username);
      // Refresh reference
      const refreshed = await this.userModel.findById(mongoUser._id);
      if (refreshed) {
        mongoUser = refreshed;
      }
    }

    if (mongoUser?.fineractClientId) {
      await this.syncWallets(mongoUser, Number(mongoUser.fineractClientId), username);
    }

    // Backfill cho user cũ chưa có credit score.
    await this.creditScoreService.ensureCreditScoreForUser(mongoUser._id);

    return mongoUser;
  }

  private async createMongoUser(keycloakUserId: string, username: string, email?: string, name?: string) {
    this.logger.log(`[SYNC] Initializing MongoDB user: ${username}`);

    try {
      const kcUser = await this.keycloakService.findUserByUsername(username);
      const firstName = kcUser?.firstName || name?.split(' ')[0] || '';
      const lastName = kcUser?.lastName || name?.split(' ').slice(1).join(' ') || '';

      const emailDomain = this.configService.get<string>('defaults.emailDomain');
      const mongoUser = await this.userModel.create({
        keycloakId: keycloakUserId,
        username,
        email: email || kcUser?.email || `${username}@${emailDomain}`,
        profile: { firstName, lastName },
        status: UserStatus.INACTIVE, // User starts as inactive until KYC is approved
        kycStatus: 'NONE',
        metadata: {
          syncStatus: 'registered_pending_approval',
          registeredAt: new Date(),
          lastSyncAt: new Date(),
        },
      });

      return mongoUser;
    } catch (error: any) {
      // Handle duplicate key error (E11000)
      if (error.code === 11000) {
        this.logger.warn(`[SYNC] User ${username} already exists, attempting to find and update`);

        // Try to find and update existing user with keycloakId
        const existingUser = await this.userModel.findOne({ username });
        if (existingUser) {
          existingUser.keycloakId = keycloakUserId;
          if (email) existingUser.email = email;
          await existingUser.save();
          return existingUser;
        }
      }

      // Re-throw other errors
      throw error;
    }
  }

  private async linkFineractClient(mongoUser: User, username: string): Promise<void> {
    this.logger.log(`[SYNC] Linking Fineract client for ${username}`);

    // Try different search identifiers in order of specificity
    const identifiers = [`KEYCLOAK_${username}`, username];

    const kcUser = await this.keycloakService.findUserByUsername(username);
    if (kcUser?.attributes?.phoneNumber?.[0]) {
      identifiers.push(kcUser.attributes.phoneNumber[0]);
    }

    for (const id of identifiers) {
      const client = await this.fineractService.findClientByIdentifier(id);
      if (client) {
        const isClaimed = await this.userModel.exists({
          fineractClientId: client.id.toString(),
          keycloakId: { $ne: mongoUser.keycloakId },
        });

        if (!isClaimed) {
          mongoUser.fineractClientId = client.id.toString();
          if (!mongoUser.metadata) {
            mongoUser.metadata = {};
          }
          mongoUser.metadata.syncStatus = 'synced';
          // Use updateOne to avoid overwriting status (user stays inactive until KYC approved)
          await this.userModel.updateOne(
            { _id: mongoUser._id },
            { $set: { fineractClientId: client.id.toString(), 'metadata.syncStatus': 'synced' } },
          );
          this.logger.log(`[SYNC] Linked ${username} to Fineract Client ${client.id}`);
          return;
        }
        this.logger.warn(`[SYNC] Fineract Client ${client.id} is already claimed, skipping...`);
      }
    }

    this.logger.warn(`[SYNC] No unclaimed Fineract Client found for ${username}`);
    await this.userModel.updateOne({ _id: mongoUser._id }, { $set: { 'metadata.syncStatus': 'no_fineract_client' } });
  }

  /**
   * Get user profile with full lifecycle info from MongoDB (for /auth/me)
   */
  async getProfileWithKyc(userId: string): Promise<{
    profile?: any;
    kycStatus?: string;
    kycRejectReason?: string;
    userType?: string;
    status?: string;
  } | null> {
    const user = await this.userModel
      .findById(userId)
      .select('profile kycStatus kycRejectReason userType status metadata')
      .lean();
    if (!user) return null;
    return {
      profile: user.profile,
      kycStatus: user.kycStatus,
      kycRejectReason: (user as any).kycRejectReason || undefined,
      userType: user.userType || (user.metadata as any)?.userType || 'borrower',
      status: user.status,
    };
  }

  private async syncWallets(mongoUser: User, fineractClientId: number, username: string): Promise<void> {
    const accounts = await this.fineractService.getSavingsAccounts(fineractClientId);

    if (accounts.length === 0) {
      this.logger.warn(`[SYNC] No Fineract wallets for ${username}`);
      return;
    }

    for (const account of accounts) {
      if (account.status?.value === 'Closed') continue;

      const exists = await this.walletModel.exists({
        fineractSavingsId: account.id.toString(),
      });
      if (!exists) {
        await this.walletModel.create({
          userId: mongoUser._id,
          fineractSavingsId: account.id.toString(),
        });
        this.logger.log(`[SYNC] Wallet reference created: ${account.id}`);
      }
    }

    // Update metadata only - NEVER overwrite status (user stays inactive until admin approves KYC)
    if (!mongoUser.metadata) {
      mongoUser.metadata = {};
    }
    mongoUser.metadata.syncStatus = 'complete';
    mongoUser.metadata.lastSyncAt = new Date();
    await this.userModel.updateOne(
      { _id: mongoUser._id },
      { $set: { 'metadata.syncStatus': 'complete', 'metadata.lastSyncAt': new Date() } },
    );
  }
}
