import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeycloakService } from './keycloak.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import axios, { AxiosInstance } from 'axios';

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
    clientId: number;
    savingsId: number;
}

@Injectable()
export class FineractSignupService {
    private readonly logger = new Logger(FineractSignupService.name);
    private readonly fineractUrl: string;
    private readonly fineractTenant: string;
    private fineractClient: AxiosInstance;

    constructor(
        private keycloakService: KeycloakService,
        private keycloakAuthService: KeycloakAuthService,
        private configService: ConfigService,
    ) {
        this.fineractUrl = this.configService.getOrThrow<string>('FINERACT_API_URL');
        this.fineractTenant = this.configService.get<string>('FINERACT_TENANT') || 'default';

        // Create Fineract axios instance
        this.fineractClient = axios.create({
            baseURL: this.fineractUrl,
            timeout: 30000,
            headers: {
                'Fineract-Platform-TenantId': this.fineractTenant,
                'Content-Type': 'application/json',
            },
        });

        // Add OAuth2 Interceptor
        this.fineractClient.interceptors.request.use(
            async (config) => {
                try {
                    const token = await this.keycloakAuthService.getClientToken();
                    config.headers.Authorization = `Bearer ${token}`;
                    return config;
                } catch (error) {
                    this.logger.error('Failed to attach Bearer token to Fineract request');
                    return config;
                }
            },
            (error) => Promise.reject(error),
        );
    }

    /**
     * Complete signup process:
     * 1. Create Keycloak user
     * 2. Assign role
     * 3. Create Fineract client
     * 4. Create savings account
     */
    async signup(data: SignupData): Promise<SignupResult> {
        const username = data.phoneNumber; // Use phone as username
        const userType = data.userType || 'borrower';

        try {
            // Step 1: Create Keycloak user
            this.logger.log(`Creating Keycloak user: ${username}`);
            const keycloakUserId = await this.keycloakService.createUser({
                username,
                email: data.email || `${data.phoneNumber}@p2p.com`,
                firstName: data.firstName,
                lastName: data.lastName,
                enabled: true,
                emailVerified: true,
                credentials: [
                    {
                        type: 'password',
                        value: data.password,
                        temporary: false,
                    },
                ],
            });

            // Step 2: Assign role
            this.logger.log(`Assigning role ${userType} to user ${keycloakUserId}`);
            await this.keycloakService.assignRole(keycloakUserId, userType);

            // Step 3: Create Fineract client
            this.logger.log(`Creating Fineract client for ${username}`);
            const clientId = await this.createFineractClient(data);

            // Step 4: Create savings account (Credit Wallet)
            this.logger.log(`Creating savings account for client ${clientId}`);
            const savingsId = await this.createSavingsAccount(clientId);

            this.logger.log(`Signup completed successfully for ${username}`);
            return {
                username,
                keycloakUserId,
                clientId,
                savingsId,
            };
        } catch (error: any) {
            this.logger.error(`Signup failed for ${username}:`, error.message);
            throw new BadRequestException(error.message || 'Đăng ký thất bại');
        }
    }

    /**
     * Create Fineract client (borrower/lender)
     */
    private async createFineractClient(data: SignupData): Promise<number> {
        try {
            const offices = await this.fineractClient.get('/offices');
            const officeId = offices.data[0]?.id || 1;

            const today = new Date().toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
            });

            const clientData = {
                officeId,
                legalFormId: 1, // Person
                firstname: data.firstName,
                lastname: data.lastName,
                externalId: data.phoneNumber,
                active: true,
                activationDate: today,
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            };

            const response = await this.fineractClient.post('/clients', clientData);
            return response.data.resourceId || response.data.clientId;
        } catch (error: any) {
            this.logger.error('Failed to create Fineract client', error.response?.data || error.message);
            throw new Error('Không thể tạo hồ sơ khách hàng');
        }
    }

    /**
     * Create savings account for client
     */
    private async createSavingsAccount(clientId: number): Promise<number> {
        try {
            // Get savings products
            const productsResponse = await this.fineractClient.get('/savingsproducts');
            const products = productsResponse.data?.pageItems || productsResponse.data || [];

            // Find Credit Wallet product (CW01 or EWALLET)
            let savingsProductId = products.find(
                (p: any) => p.shortName === 'CW01' || p.shortName === 'EWALLET',
            )?.id;

            // Fallback to first product
            if (!savingsProductId && products.length > 0) {
                savingsProductId = products[0].id;
            }

            if (!savingsProductId) {
                this.logger.warn('No savings product found, skipping savings account creation');
                return 0;
            }

            const today = new Date().toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
            });

            const savingsData = {
                clientId,
                productId: savingsProductId,
                submittedOnDate: today,
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            };

            const response = await this.fineractClient.post('/savingsaccounts', savingsData);
            const savingsId = response.data.resourceId || response.data.savingsId;

            // Auto-approve and activate
            await this.approveSavingsAccount(savingsId, today);
            await this.activateSavingsAccount(savingsId, today);

            return savingsId;
        } catch (error: any) {
            this.logger.error('Failed to create savings account', error.response?.data || error.message);
            // Don't throw, savings account is optional
            return 0;
        }
    }

    /**
     * Approve savings account
     */
    private async approveSavingsAccount(savingsId: number, date: string): Promise<void> {
        try {
            await this.fineractClient.post(`/savingsaccounts/${savingsId}?command=approve`, {
                approvedOnDate: date,
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            });
        } catch (error: any) {
            this.logger.warn(`Failed to approve savings ${savingsId}:`, error.message);
        }
    }

    /**
     * Activate savings account
     */
    private async activateSavingsAccount(savingsId: number, date: string): Promise<void> {
        try {
            await this.fineractClient.post(`/savingsaccounts/${savingsId}?command=activate`, {
                activatedOnDate: date,
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            });
        } catch (error: any) {
            this.logger.warn(`Failed to activate savings ${savingsId}:`, error.message);
        }
    }
}
