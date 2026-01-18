import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserStatus } from '../../users/schemas/user.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { KeycloakService } from './keycloak.service';
import { FineractService } from '../../fineract/fineract.service';
import { KeycloakUser } from '../interfaces/auth.interface';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserSyncService {
    private readonly logger = new Logger(UserSyncService.name);

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<User>,
        @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
        private readonly keycloakService: KeycloakService,
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
    ) { }


    /**
     * Sync user data from Keycloak & Fineract to MongoDB on login
     */
    async syncUser(keycloakUser: KeycloakUser): Promise<any> {
        const { keycloakUserId, username, email, name } = keycloakUser;

        let mongoUser = await this.userModel.findOne({ keycloakId: keycloakUserId });

        if (!mongoUser) {
            mongoUser = await this.createMongoUser(keycloakUserId, username, email, name);
        }

        if (!mongoUser.fineractClientId) {
            await this.linkFineractClient(mongoUser, username);
            // Refresh reference
            mongoUser = await this.userModel.findById(mongoUser._id);
        }

        if (mongoUser?.fineractClientId) {
            await this.syncWallets(mongoUser, Number(mongoUser.fineractClientId), username);
        }

        return mongoUser;
    }

    private async createMongoUser(keycloakUserId: string, username: string, email?: string, name?: string) {
        this.logger.log(`[SYNC] Initializing MongoDB user: ${username}`);

        const kcUser = await this.keycloakService.findUserByUsername(username);
        const firstName = kcUser?.firstName || name?.split(' ')[0] || '';
        const lastName = kcUser?.lastName || name?.split(' ').slice(1).join(' ') || '';

        const emailDomain = this.configService.get<string>('defaults.emailDomain');
        const mongoUser = await this.userModel.create({
            keycloakId: keycloakUserId,
            username,
            email: email || kcUser?.email || `${username}@${emailDomain}`,

            profile: { firstName, lastName },
            status: UserStatus.ACTIVE,
            metadata: { syncStatus: 'initialized', lastSyncAt: new Date() },
        });

        return mongoUser;
    }

    private async linkFineractClient(mongoUser: any, username: string): Promise<void> {
        this.logger.log(`[SYNC] Linking Fineract client for ${username}`);

        // Try different search identifiers in order of specificity
        const identifiers = [
            `KEYCLOAK_${username}`,
            username,
        ];

        const kcUser = await this.keycloakService.findUserByUsername(username);
        if (kcUser?.attributes?.phoneNumber?.[0]) {
            identifiers.push(kcUser.attributes.phoneNumber[0]);
        }

        for (const id of identifiers) {
            const client = await this.fineractService.findClientByIdentifier(id);
            if (client) {
                const isClaimed = await this.userModel.exists({ fineractClientId: client.id.toString(), keycloakId: { $ne: mongoUser.keycloakId } });

                if (!isClaimed) {
                    mongoUser.fineractClientId = client.id.toString();
                    mongoUser.metadata.syncStatus = 'synced';
                    await mongoUser.save();
                    this.logger.log(`[SYNC] Linked ${username} to Fineract Client ${client.id}`);
                    return;
                }
                this.logger.warn(`[SYNC] Fineract Client ${client.id} is already claimed, skipping...`);
            }
        }

        this.logger.warn(`[SYNC] No unclaimed Fineract Client found for ${username}`);
        mongoUser.metadata.syncStatus = 'no_fineract_client';
        await mongoUser.save();
    }

    private async syncWallets(mongoUser: any, fineractClientId: number, username: string): Promise<void> {
        const accounts = await this.fineractService.getSavingsAccounts(fineractClientId);

        if (accounts.length === 0) {
            this.logger.warn(`[SYNC] No Fineract wallets for ${username}`);
            return;
        }

        for (const account of accounts) {
            if (account.status?.value === 'Closed') continue;

            const exists = await this.walletModel.exists({ fineractSavingsId: account.id.toString() });
            if (!exists) {
                await this.walletModel.create({
                    userId: mongoUser._id,
                    fineractSavingsId: account.id.toString(),
                });
                this.logger.log(`[SYNC] Wallet reference created: ${account.id}`);
            }
        }

        mongoUser.metadata.syncStatus = 'complete';
        mongoUser.metadata.lastSyncAt = new Date();
        await mongoUser.save();
    }
}
