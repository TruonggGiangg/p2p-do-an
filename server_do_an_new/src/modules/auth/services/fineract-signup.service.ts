import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeycloakService } from './keycloak.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import axios, { AxiosInstance } from 'axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../../users/schemas/user.schema';

export interface SignupData {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    userType?: 'borrower' | 'lender';
}

export interface SignupResult {
    username: string;
    keycloakUserId: string;
    fineractClientId: number;
}

@Injectable()
export class FineractSignupService {
    private readonly logger = new Logger(FineractSignupService.name);
    private readonly fineractClient: AxiosInstance;

    constructor(
        private keycloakService: KeycloakService,
        private keycloakAuthService: KeycloakAuthService,
        private configService: ConfigService,
        @InjectModel(User.name) private userModel: Model<User>,
    ) {
        const fineractUrl = this.configService.getOrThrow<string>('FINERACT_API_URL');
        const fineractTenant = this.configService.get<string>('FINERACT_TENANT') || 'default';

        this.fineractClient = axios.create({
            baseURL: fineractUrl,
            timeout: 30000,
            headers: {
                'Fineract-Platform-TenantId': fineractTenant,
                'Content-Type': 'application/json',
            },
        });

        // Add OAuth2 Interceptor
        this.fineractClient.interceptors.request.use(
            async (config) => {
                try {
                    const token = await this.keycloakAuthService.getClientToken();
                    config.headers.Authorization = `Bearer ${token}`;
                } catch (error) {
                    this.logger.error('Failed to attach Bearer token to Fineract request');
                }
                return config;
            },
            (error) => Promise.reject(error),
        );
    }

    /**
     * Complete signup process (WITHOUT wallet creation):
     * 1. Create Keycloak user
     * 2. Assign role  
     * 3. Create Fineract client
     * 4. Save to MongoDB
     */
    async signup(data: SignupData): Promise<SignupResult> {
        const username = data.phoneNumber;
        const userType = data.userType || 'borrower';

        try {
            // Step 1: Create Keycloak user
            this.logger.log(`[SIGNUP] Creating Keycloak user: ${username}`);
            const keycloakUserId = await this.keycloakService.createUser({
                username,
                email: data.email || `${data.phoneNumber}@p2p.com`,
                firstName: data.firstName,
                lastName: data.lastName,
                enabled: true,
                emailVerified: true,
                credentials: [{ type: 'password', value: data.password, temporary: false }],
                attributes: {
                    phoneNumber: [data.phoneNumber],
                },
            });

            // Step 2: Assign role
            await this.keycloakService.assignRole(keycloakUserId, userType);

            // Step 3: Create Fineract client
            this.logger.log(`[SIGNUP] Creating Fineract client for: ${username}`);
            const fineractClientId = await this.createFineractClient(data);

            // Step 4: Save to MongoDB
            await this.userModel.create({
                keycloakId: keycloakUserId,
                fineractClientId: fineractClientId.toString(),
                username,
                email: data.email || `${data.phoneNumber}@p2p.com`,
                profile: { firstName: data.firstName, lastName: data.lastName },
                status: UserStatus.ACTIVE,
                metadata: {
                    userType,
                    syncStatus: 'registered',
                    registeredAt: new Date(),
                },
            });

            this.logger.log(`[SIGNUP] Completed for ${username}`);
            return { username, keycloakUserId, fineractClientId };
        } catch (error: any) {
            this.logger.error(`[SIGNUP] Failed for ${username}: ${error.message}`);
            throw new BadRequestException(error.message || 'Đăng ký thất bại');
        }
    }

    /**
     * Create Fineract client (borrower/lender)
     */
    private async createFineractClient(data: SignupData): Promise<number> {
        const today = new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        });

        try {
            const offices = await this.fineractClient.get('/offices');
            const officeId = offices.data[0]?.id || 1;

            const response = await this.fineractClient.post('/clients', {
                officeId,
                legalFormId: 1,
                firstname: data.firstName,
                lastname: data.lastName,
                externalId: data.phoneNumber,
                mobileNo: data.phoneNumber,
                active: true,
                activationDate: today,
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            });

            return response.data.resourceId || response.data.clientId;
        } catch (error: any) {
            this.logger.error('Failed to create Fineract client', error.response?.data || error.message);
            throw new Error('Không thể tạo hồ sơ khách hàng');
        }
    }

    /**
     * Find Fineract client by external ID (phone number) or display name
     */
    async findClientByExternalId(identifier: string): Promise<any | null> {
        try {
            // 1. Search by externalId
            const response = await this.fineractClient.get('/clients', { params: { externalId: identifier } });
            const clients = response.data?.pageItems || response.data || [];
            // STRICT CHECK: Ensure externalId actually matches
            const matchedByExtId = clients.find((c: any) => c.externalId === identifier);
            if (matchedByExtId) return matchedByExtId;

            // 2. Search by displayName (Fuzzy or exact? Let's check exact to avoid wrong links)
            const searchResponse = await this.fineractClient.get('/clients', { params: { displayName: identifier } });
            const searchClients = searchResponse.data?.pageItems || searchResponse.data || [];
            const matchedByName = searchClients.find((c: any) => c.displayName === identifier);
            if (matchedByName) return matchedByName;

            // 3. Search by mobileNo (CRITICAL FIX: Fineract might return all clients if param ignored)
            const mobileResponse = await this.fineractClient.get('/clients', { params: { mobileNo: identifier } });
            const mobileClients = mobileResponse.data?.pageItems || mobileResponse.data || [];

            // Normalize identifier for phone comparison (remove non-digits)
            const searchPhone = identifier.replace(/\D/g, '');

            const matchedByPhone = mobileClients.find((c: any) => {
                const clientPhone = (c.mobileNo || '').replace(/\D/g, '');
                return clientPhone === searchPhone && clientPhone.length > 0;
            });

            if (matchedByPhone) return matchedByPhone;

            return null;
        } catch (error: any) {
            this.logger.error(`Failed to find Fineract client: ${identifier}`, error.message);
            return null;
        }
    }

    /**
     * Find savings accounts for a specific client
     */
    async findSavingsAccountsByClientId(clientId: number): Promise<any[]> {
        try {
            const response = await this.fineractClient.get(`/clients/${clientId}/accounts`);
            return response.data?.savingsAccounts || [];
        } catch (error: any) {
            this.logger.error(`Failed to find savings for client ${clientId}`, error.message);
            return [];
        }
    }
}
