import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserStatus } from '../../users/schemas/user.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { KeycloakService } from './keycloak.service';
import { FineractSignupService } from './fineract-signup.service';
import { KeycloakUser } from '../interfaces/auth.interface';

@Injectable()
export class UserSyncService {
    private readonly logger = new Logger(UserSyncService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
        private keycloakService: KeycloakService,
        private fineractService: FineractSignupService,
    ) { }

    /**
     * Sync user data from Keycloak & Fineract to MongoDB on login
     * 
     * Scenarios handled:
     * 1. User in Keycloak, NOT in MongoDB → Create MongoDB record
     * 2. User in MongoDB, NO Fineract Client → Try to find/link client
     * 3. User has Fineract Client, NO wallets → Log warning (wallet not auto-created)
     * 4. User has wallets → Sync to MongoDB, update balance
     */
    async syncUser(keycloakUser: KeycloakUser): Promise<any> {
        const { keycloakUserId, username, email, name } = keycloakUser;

        // Step 1: Find or create MongoDB user
        let mongoUser = await this.userModel.findOne({ keycloakId: keycloakUserId });

        if (!mongoUser) {
            mongoUser = await this.createMongoUser(keycloakUserId, username, email, name);
        }

        if (!mongoUser) {
            this.logger.error(`[SYNC] Failed to find or create user: ${username}`);
            throw new Error('Failed to sync user');
        }

        // Step 2: Ensure Fineract Client is linked
        if (!mongoUser.fineractClientId) {
            await this.linkFineractClient(mongoUser, username);
            // Refresh user data after linking
            mongoUser = await this.userModel.findOne({ keycloakId: keycloakUserId });
        }

        // Step 3: Sync wallets if client is linked
        if (mongoUser && mongoUser.fineractClientId) {
            await this.syncWallets(mongoUser, Number(mongoUser.fineractClientId), username);
        }

        return mongoUser;
    }

    /**
     * Create a new MongoDB user record
     */
    private async createMongoUser(
        keycloakUserId: string,
        username: string,
        email: string | undefined,
        name: string | undefined,
    ) {
        this.logger.log(`[SYNC] Creating MongoDB user: ${username}`);

        const kcFullUser = await this.keycloakService.findUserByUsername(username);
        const firstName = kcFullUser?.firstName || name?.split(' ')[0] || '';
        const lastName = kcFullUser?.lastName || name?.split(' ').slice(1).join(' ') || '';
        const phoneNumber = kcFullUser?.attributes?.phoneNumber?.[0] || username;

        // Try to find existing Fineract client
        let fineractClientId: string | undefined;
        // Priority: KEYCLOAK_username -> username
        let fineractClient = await this.fineractService.findClientByExternalId(`KEYCLOAK_${username}`);

        // Priority 2: Heuristic Seed Data (borrower1 -> BORROWER_1)
        if (!fineractClient) {
            const heuristicId = username.toUpperCase().replace(/(\D+)(\d+)/, '$1_$2');
            if (heuristicId !== username.toUpperCase()) {
                this.logger.log(`[SYNC] Trying heuristic externalId: ${heuristicId}`);
                fineractClient = await this.fineractService.findClientByExternalId(heuristicId);
            }
        }

        if (!fineractClient) {
            fineractClient = await this.fineractService.findClientByExternalId(username);
        }

        if (!fineractClient && phoneNumber !== username) {
            fineractClient = await this.fineractService.findClientByExternalId(phoneNumber);
        }

        if (fineractClient) {
            const isClaimed = await this.isFineractClientClaimed(fineractClient.id);
            if (!isClaimed) {
                fineractClientId = fineractClient.id.toString();
            } else {
                this.logger.warn(`[SYNC] Fineract Client ${fineractClient.id} is already claimed by another user. Not linking to ${username}.`);
            }
        }

        const mongoUser = await this.userModel.create({
            keycloakId: keycloakUserId,
            fineractClientId,
            username,
            email: email || kcFullUser?.email || `${username}@p2p.com`,
            profile: { firstName, lastName },
            status: UserStatus.ACTIVE,
            metadata: {
                syncStatus: fineractClientId ? 'synced' : 'no_fineract_client',
                lastSyncAt: new Date(),
            },
        });

        this.logger.log(`[SYNC] Created MongoDB user: ${username} (ID: ${mongoUser._id})`);
        return mongoUser;
    }

    /**
     * Try to find and link Fineract client to MongoDB user
     */
    private async linkFineractClient(mongoUser: any, username: string): Promise<void> {
        this.logger.warn(`[SYNC] User ${username} has no Fineract Client ID. Searching...`);

        // Try different identifiers
        const kcFullUser = await this.keycloakService.findUserByUsername(username);
        const phoneNumber = kcFullUser?.attributes?.phoneNumber?.[0];
        const emailAddr = kcFullUser?.email;

        let fineractClient = await this.fineractService.findClientByExternalId(`KEYCLOAK_${username}`);

        // Priority 2: Heuristic Seed Data (borrower1 -> BORROWER_1)
        if (!fineractClient) {
            const heuristicId = username.toUpperCase().replace(/(\D+)(\d+)/, '$1_$2');
            if (heuristicId !== username.toUpperCase()) {
                this.logger.log(`[SYNC] Trying heuristic externalId: ${heuristicId}`);
                fineractClient = await this.fineractService.findClientByExternalId(heuristicId);
            }
        }

        if (!fineractClient) {
            fineractClient = await this.fineractService.findClientByExternalId(username);
        }

        if (!fineractClient && phoneNumber) {
            fineractClient = await this.fineractService.findClientByExternalId(phoneNumber);
        }

        if (!fineractClient && emailAddr) {
            fineractClient = await this.fineractService.findClientByExternalId(emailAddr);
        }

        if (fineractClient) {
            const isClaimed = await this.isFineractClientClaimed(fineractClient.id);
            if (isClaimed) {
                this.logger.warn(`[SYNC] Fineract Client ${fineractClient.id} is already claimed. Skipping link for ${username}.`);
                return;
            }

            mongoUser.fineractClientId = fineractClient.id.toString();
            mongoUser.metadata = { ...mongoUser.metadata, syncStatus: 'synced', lastSyncAt: new Date() };
            await mongoUser.save();
            this.logger.log(`[SYNC] Linked ${username} to Fineract Client ${fineractClient.id}`);
        } else {
            this.logger.warn(`[SYNC] No Fineract Client found for ${username}`);
            mongoUser.metadata = { ...mongoUser.metadata, syncStatus: 'no_fineract_client', lastSyncAt: new Date() };
            await mongoUser.save();
        }
    }

    /**
     * Check if a Fineract Client ID is already assigned to a MongoDB User
     */
    private async isFineractClientClaimed(fineractId: number): Promise<boolean> {
        const existingUser = await this.userModel.findOne({ fineractClientId: fineractId.toString() }).exec();
        return !!existingUser;
    }

    /**
     * Sync wallets from Fineract to MongoDB
     */
    private async syncWallets(mongoUser: any, fineractClientId: number, username: string): Promise<void> {
        const savingsAccounts = await this.fineractService.findSavingsAccountsByClientId(fineractClientId);

        this.logger.log(`[SYNC] Found ${savingsAccounts.length} savings accounts for ${username}: ${savingsAccounts.map(a => `${a.id} (${a.status?.value})`).join(', ')}`);

        if (savingsAccounts.length === 0) {
            this.logger.warn(`[SYNC] User ${username} has no wallets in Fineract`);
            mongoUser.metadata = { ...mongoUser.metadata, syncStatus: 'no_wallets', lastSyncAt: new Date() };
            await mongoUser.save();
            return;
        }

        for (const account of savingsAccounts) {
            // Skip closed accounts
            if (account.status?.value === 'Closed') continue;

            const existingWallet = await this.walletModel.findOne({ fineractSavingsId: account.id.toString() });

            if (!existingWallet) {
                await this.createWallet(mongoUser, account, username);
            }
        }

        mongoUser.metadata = { ...mongoUser.metadata, syncStatus: 'complete', lastSyncAt: new Date() };
        await mongoUser.save();
    }

    /**
     * Create wallet record in MongoDB (only stores IDs, data fetched from Fineract in real-time)
     */
    private async createWallet(mongoUser: any, account: any, username: string): Promise<void> {
        try {
            await this.walletModel.create({
                userId: mongoUser._id as Types.ObjectId,
                fineractSavingsId: account.id.toString(),
            });
            this.logger.log(`[SYNC] Created wallet reference ${account.id} for ${username}`);
        } catch (error: any) {
            if (error.code === 11000) {
                this.logger.warn(`[SYNC] Wallet already exists for ${username}`);
            } else {
                this.logger.error(`[SYNC] Failed to create wallet: ${error.message}`);
            }
        }
    }
}
