import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Wallet } from './schemas/wallet.schema';
import { User } from '../users/schemas/user.schema';

// Wallet data from Fineract (real-time)
export interface WalletInfo {
    _id: string;  // MongoDB wallet ID
    fineractSavingsId: string;
    accountNo: string;
    productName: string;
    shortProductName: string;
    type: 'credit_wallet' | 'e_wallet';
    currency: string;
    balance: number;
    status: string;
}

@Injectable()
export class WalletsService {
    private readonly logger = new Logger(WalletsService.name);
    private readonly fineractClient: AxiosInstance;
    private readonly keycloakUrl: string;
    private readonly keycloakRealm: string;
    private readonly keycloakClientId: string;
    private readonly keycloakClientSecret: string;

    constructor(
        @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
        @InjectModel(User.name) private userModel: Model<User>,
        private configService: ConfigService,
    ) {
        const fineractUrl = this.configService.get<string>('FINERACT_API_URL') || 'http://localhost:8443/fineract-provider/api/v1';
        const fineractTenant = this.configService.get<string>('FINERACT_TENANT') || 'default';

        this.keycloakUrl = this.configService.get<string>('KEYCLOAK_URL') || 'http://localhost:8080';
        this.keycloakRealm = this.configService.get<string>('KEYCLOAK_REALM') || 'fineract';
        this.keycloakClientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID') || 'community-app';
        this.keycloakClientSecret = this.configService.get<string>('KEYCLOAK_CLIENT_SECRET') || 'real-client-secret-123';

        this.fineractClient = axios.create({
            baseURL: fineractUrl,
            timeout: 30000,
            headers: {
                'Fineract-Platform-TenantId': fineractTenant,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Get OAuth2 token from Keycloak for Fineract API calls
     */
    private async getOAuth2Token(): Promise<string> {
        const username = this.configService.get<string>('FINERACT_USERNAME') || 'mifos';
        const password = this.configService.get<string>('FINERACT_PASSWORD') || 'password';

        const response = await axios.post(
            `${this.keycloakUrl}/realms/${this.keycloakRealm}/protocol/openid-connect/token`,
            new URLSearchParams({
                client_id: this.keycloakClientId,
                client_secret: this.keycloakClientSecret,
                username,
                password,
                grant_type: 'password',
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );

        return response.data.access_token;
    }

    /**
     * Get all wallets for a user with REAL-TIME data from Fineract
     */
    async getWalletsByUserId(userId: string): Promise<WalletInfo[]> {
        // Get wallet references from MongoDB
        const walletRefs = await this.walletModel.find({ userId: new Types.ObjectId(userId) }).exec();

        if (walletRefs.length === 0) {
            return [];
        }

        // Fetch real data from Fineract for each wallet
        const token = await this.getOAuth2Token();
        const wallets: WalletInfo[] = [];

        for (const ref of walletRefs) {
            try {
                const savingsData = await this.getSavingsAccountFromFineract(ref.fineractSavingsId, token);
                if (savingsData) {
                    wallets.push({
                        _id: ref._id.toString(),
                        fineractSavingsId: ref.fineractSavingsId,
                        accountNo: savingsData.accountNo || '',
                        productName: savingsData.savingsProductName || savingsData.productName || '',
                        shortProductName: savingsData.shortProductName || '',
                        type: this.getWalletType(savingsData),
                        currency: savingsData.currency?.code || 'VND',
                        balance: savingsData.summary?.accountBalance || savingsData.accountBalance || 0,
                        status: savingsData.status?.value || 'Unknown',
                    });
                }
            } catch (error: any) {
                this.logger.error(`Failed to fetch savings ${ref.fineractSavingsId}: ${error.message}`);
            }
        }

        return wallets;
    }

    /**
     * Get savings account data from Fineract
     */
    private async getSavingsAccountFromFineract(savingsId: string, token: string): Promise<any> {
        const response = await this.fineractClient.get(`/savingsaccounts/${savingsId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return response.data;
    }

    /**
     * Determine wallet type based on product name
     */
    private getWalletType(savingsData: any): 'credit_wallet' | 'e_wallet' {
        const productName = (savingsData.savingsProductName || savingsData.productName || '').toLowerCase();
        const shortName = (savingsData.shortProductName || '').toUpperCase();

        // Credit Wallet patterns: Ví Trả Sau, Credit, CW01
        if (productName.includes('trả sau') ||
            productName.includes('credit') ||
            shortName === 'CW01') {
            return 'credit_wallet';
        }

        return 'e_wallet';
    }

    /**
     * Get wallet by ID with REAL-TIME data
     */
    async getWalletById(walletId: string): Promise<WalletInfo | null> {
        const ref = await this.walletModel.findById(walletId).exec();
        if (!ref) return null;

        const token = await this.getOAuth2Token();
        const savingsData = await this.getSavingsAccountFromFineract(ref.fineractSavingsId, token);

        if (!savingsData) return null;

        return {
            _id: ref._id.toString(),
            fineractSavingsId: ref.fineractSavingsId,
            accountNo: savingsData.accountNo || '',
            productName: savingsData.savingsProductName || savingsData.productName || '',
            shortProductName: savingsData.shortProductName || '',
            type: this.getWalletType(savingsData),
            currency: savingsData.currency?.code || 'VND',
            balance: savingsData.summary?.accountBalance || savingsData.accountBalance || 0,
            status: savingsData.status?.value || 'Unknown',
        };
    }

    /**
     * Sync wallet references from Fineract (only stores IDs)
     */
    async syncWalletsFromFineract(userId: string): Promise<{ synced: number; wallets: WalletInfo[] }> {
        const user = await this.userModel.findById(userId).exec();

        if (!user) {
            throw new Error('User not found');
        }

        if (!user.fineractClientId) {
            this.logger.warn(`User ${userId} has no Fineract Client ID`);
            return { synced: 0, wallets: [] };
        }

        const fineractClientId = Number(user.fineractClientId);
        const token = await this.getOAuth2Token();

        // Get all savings accounts from Fineract
        const response = await this.fineractClient.get(`/clients/${fineractClientId}/accounts`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const savingsAccounts = response.data?.savingsAccounts || [];

        let syncedCount = 0;

        for (const account of savingsAccounts) {
            // Skip closed accounts
            if (account.status?.value === 'Closed') continue;

            // Only store the ID reference
            const exists = await this.walletModel.findOne({ fineractSavingsId: account.id.toString() }).exec();

            if (!exists) {
                await this.walletModel.create({
                    userId: user._id,
                    fineractSavingsId: account.id.toString(),
                });
                syncedCount++;
            }
        }

        // Update user sync status
        user.metadata = {
            ...user.metadata,
            syncStatus: savingsAccounts.length > 0 ? 'complete' : 'no_wallets',
            lastSyncAt: new Date(),
        };
        await user.save();

        // Return real-time data
        const wallets = await this.getWalletsByUserId(userId);
        return { synced: syncedCount, wallets };
    }

    /**
     * Get total balance across all wallets (real-time from Fineract)
     */
    async getTotalBalance(userId: string): Promise<{ total: number; currency: string }> {
        const wallets = await this.getWalletsByUserId(userId);
        const total = wallets
            .filter(w => w.status === 'Active')
            .reduce((sum, wallet) => sum + wallet.balance, 0);
        return { total, currency: 'VND' };
    }
}
