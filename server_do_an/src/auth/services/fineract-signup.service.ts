import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FineractService } from '../../loan/services/fineract.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import * as qs from 'qs';
import { firstValueFrom } from 'rxjs';

interface SignupData {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    userType?: 'borrower' | 'lender';
}

@Injectable()
export class FineractSignupService {
    private readonly logger = new Logger(FineractSignupService.name);

    constructor(
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) { }

    /**
     * Validate password according to Fineract requirements
     */
    private validatePassword(password: string): { valid: boolean; message: string } {
        if (!password || typeof password !== 'string') {
            return { valid: false, message: 'Mật khẩu không được để trống' };
        }

        const trimmed = password.trim();
        if (trimmed.length < 12 || trimmed.length > 50) {
            return { valid: false, message: 'Mật khẩu phải từ 12 đến 50 ký tự' };
        }
        if (/\s/.test(trimmed)) {
            return { valid: false, message: 'Mật khẩu không được chứa khoảng trắng' };
        }
        if (/(.)\\1/.test(trimmed)) {
            return { valid: false, message: 'Mật khẩu không được có ký tự lặp lại liên tiếp' };
        }
        if (!/\d/.test(trimmed)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ số' };
        }
        if (!/[a-z]/.test(trimmed)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ thường' };
        }
        if (!/[A-Z]/.test(trimmed)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ hoa' };
        }
        if (!/[^\w\s]/.test(trimmed)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt' };
        }

        return { valid: true, message: 'OK' };
    }

    /**
     * Format date for Fineract (dd MMMM yyyy)
     */
    private formatDateFineract(date: Date = new Date()): string {
        const day = String(date.getDate()).padStart(2, '0');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${day} ${month} ${year}`;
    }

    /**
     * Get OAuth2 token from Keycloak for Fineract API access
     */
    private async getFineractOAuth2Token(): Promise<string> {
        try {
            const keycloakUrl = this.configService.get('KEYCLOAK_BASE_URL');
            const tokenUrl = `${keycloakUrl}/realms/fineract/protocol/openid-connect/token`;

            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('client_id', this.configService.get('FINERACT_OAUTH_CLIENT_ID') || 'community-app');
            params.append('client_secret', this.configService.getOrThrow('FINERACT_OAUTH_CLIENT_SECRET'));
            params.append('username', this.configService.get('FINERACT_USERNAME') || 'mifos');
            params.append('password', this.configService.getOrThrow('FINERACT_PASSWORD'));

            const response = await firstValueFrom(
                this.httpService.post(tokenUrl, params.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                })
            );

            return response.data.access_token;
        } catch (error: any) {
            this.logger.error('[signup] Failed to get OAuth2 token:', error.message);
            throw new Error('Failed to authenticate with Fineract');
        }
    }

    /**
     * Get Fineract API headers with OAuth2 token
     */
    private async getFineractConfig() {
        const baseUrl = this.configService.get('FINERACT_BASE_URL');
        const tenantId = this.configService.get('FINERACT_TENANT_ID') || 'default';
        const token = await this.getFineractOAuth2Token();

        return {
            baseUrl,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Fineract-Platform-TenantId': tenantId,
                'Content-Type': 'application/json',
            },
        };
    }

    /**
     * Get Keycloak admin token
     */
    private async getKeycloakAdminToken(): Promise<string> {
        const keycloakUrl = this.configService.get('KEYCLOAK_BASE_URL');
        const tokenEndpoint = `${keycloakUrl}/realms/master/protocol/openid-connect/token`;

        const body = qs.stringify({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: this.configService.get('KEYCLOAK_ADMIN_USERNAME'),
            password: this.configService.get('KEYCLOAK_ADMIN_PASSWORD'),
        });

        try {
            const response = await axios.post(tokenEndpoint, body, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000,
            });

            if (response.data && response.data.access_token) {
                this.logger.log('[signup] Keycloak admin token obtained');
                return response.data.access_token;
            }
            throw new Error('Admin token not found in response');
        } catch (error: any) {
            this.logger.error('[signup] Failed to get Keycloak admin token:', error.message);
            throw error;
        }
    }

    /**
     * Create Keycloak axios instance
     */
    private createKeycloakApi(adminToken: string) {
        return axios.create({
            baseURL: this.configService.get('KEYCLOAK_BASE_URL'),
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Assign role to Keycloak user
     */
    private async assignKeycloakRole(keycloakApi: any, userId: string, roleName: string) {
        try {
            // Get role
            const roleResponse = await keycloakApi.get(`/admin/realms/fineract/roles/${roleName}`);
            const role = roleResponse.data;

            if (!role) {
                this.logger.warn(`[signup] Role "${roleName}" not found`);
                return;
            }

            // Assign role
            await keycloakApi.post(`/admin/realms/fineract/users/${userId}/role-mappings/realm`, [role]);
            this.logger.log(`[signup] Assigned role "${roleName}" to user`);
        } catch (error: any) {
            this.logger.error(`[signup] Failed to assign role "${roleName}":`, error.message);
        }
    }

    /**
     * Register user with Fineract client + savings account
     */
    async signup(data: SignupData) {
        const { firstName, lastName, phoneNumber, email, password, userType = 'borrower' } = data;

        // Validate password
        const passwordValidation = this.validatePassword(password);
        if (!passwordValidation.valid) {
            throw new BadRequestException(passwordValidation.message);
        }

        // Prepare data
        const username = phoneNumber.trim().replace(/\D/g, '').slice(-10);
        const finalEmail = email?.trim() || `${username}@example.com`;

        // Use yesterday to avoid "date in future" error
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - 1);
        const activationDate = this.formatDateFineract(baseDate);

        this.logger.log(`[signup] START: ${username} (${firstName} ${lastName})`);

        try {
            // STEP 1: Create Fineract Client
            this.logger.log('[signup] Step 1: Creating Fineract Client...');
            const { baseUrl, headers } = await this.getFineractConfig();

            const clientPayload = {
                firstname: firstName.trim(),
                lastname: lastName.trim(),
                mobileNo: phoneNumber.trim(),
                externalId: username,
                officeId: 1,
                legalFormId: 1, // Person
                active: false,
                submittedOnDate: activationDate,
                dateFormat: 'dd MMMM yyyy',
                locale: 'en_US',
            };

            const clientResponse = await firstValueFrom(
                this.httpService.post(`${baseUrl}/fineract-provider/api/v1/clients`, clientPayload, { headers })
            );
            const clientId = clientResponse.data.resourceId || clientResponse.data.clientId;

            if (!clientId) {
                throw new Error('Failed to get client ID from Fineract');
            }
            this.logger.log(`[signup] Client created: ${clientId}`);

            // Activate Client
            const activationDateISO = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

            await firstValueFrom(
                this.httpService.post(`${baseUrl}/fineract-provider/api/v1/clients/${clientId}?command=activate`, {
                    activationDate: activationDateISO,
                    locale: 'en',
                    dateFormat: 'yyyy-MM-dd',
                }, { headers })
            );
            this.logger.log('[signup] Client activated');

            // STEP 2: Create Savings Account
            this.logger.log('[signup] Step 2: Creating Savings Account...');
            const savingsProductId = this.configService.get('FINERACT_INVESTMENT_SAVINGS_PRODUCT_ID') || 1;
            const savingsPayload = {
                clientId,
                productId: savingsProductId,
                nominalAnnualInterestRate: 5.0,
                minRequiredOpeningBalance: 0,
                allowOverdraft: false,
                externalId: `${username}-${Date.now()}`,
                submittedOnDate: activationDate,
                locale: 'en_US',
                dateFormat: 'dd MMMM yyyy',
            };

            const savingsResponse = await firstValueFrom(
                this.httpService.post(`${baseUrl}/fineract-provider/api/v1/savingsaccounts`, savingsPayload, { headers })
            );
            const savingsId = savingsResponse.data.resourceId || savingsResponse.data.savingsId;

            if (!savingsId) {
                throw new Error('Failed to get savings ID from Fineract');
            }
            this.logger.log(`[signup] Savings account created: ${savingsId}`);

            // Approve Savings
            await firstValueFrom(
                this.httpService.post(`${baseUrl}/fineract-provider/api/v1/savingsaccounts/${savingsId}?command=approve`, {
                    approvedOnDate: activationDate,
                    dateFormat: 'dd MMMM yyyy',
                    locale: 'en_US',
                }, { headers })
            );
            this.logger.log('[signup] Savings approved');

            // Activate Savings
            await firstValueFrom(
                this.httpService.post(`${baseUrl}/fineract-provider/api/v1/savingsaccounts/${savingsId}?command=activate`, {
                    activatedOnDate: activationDate,
                    dateFormat: 'dd MMMM yyyy',
                    locale: 'en_US',
                }, { headers })
            );
            this.logger.log('[signup] Savings activated');

            // STEP 3: Create Fineract User
            this.logger.log('[signup] Step 3: Creating Fineract User...');
            const userPayload = {
                firstname: firstName.trim(),
                lastname: lastName.trim(),
                email: finalEmail,
                password: password.trim(),
                repeatPassword: password.trim(),
                username: username,
                officeId: 1,
                roles: [1, 2],
                sendPasswordToEmail: false,
                isSelfServiceUser: true,
            };

            const userResponse = await firstValueFrom(
                this.httpService.post(`${baseUrl}/fineract-provider/api/v1/users`, userPayload, { headers })
            );
            const userId = userResponse.data.resourceId || userResponse.data.userId;
            this.logger.log(`[signup] Fineract user created: ${userId}`);

            // STEP 4: Create Keycloak User (optional, won't block if fails)
            let keycloakUserId: string | null = null;
            try {
                this.logger.log('[signup] Step 4: Creating Keycloak User...');

                // Get admin token
                const adminToken = await this.getKeycloakAdminToken();
                const keycloakApi = this.createKeycloakApi(adminToken);

                // Check if user exists
                const checkResponse = await keycloakApi.get('/admin/realms/fineract/users', {
                    params: { username, exact: true }
                });

                if (checkResponse.data && checkResponse.data.length > 0) {
                    // User exists, get ID
                    keycloakUserId = checkResponse.data[0].id;
                    this.logger.log(`[signup] Keycloak user already exists: ${keycloakUserId}`);
                } else {
                    // Create new user
                    const keycloakUserPayload = {
                        username,
                        enabled: true,
                        firstName: firstName.trim(),
                        lastName: lastName.trim(),
                        email: finalEmail,
                        emailVerified: true,
                        credentials: [{
                            type: 'password',
                            value: password.trim(),
                            temporary: false,
                        }],
                    };

                    const createResponse = await keycloakApi.post('/admin/realms/fineract/users', keycloakUserPayload);

                    // Extract user ID from location header
                    const location = createResponse.headers.location;
                    if (location) {
                        keycloakUserId = location.split('/').pop();
                        this.logger.log(`[signup] Keycloak user created: ${keycloakUserId}`);
                    }
                }

                // Assign role if we have user ID
                if (keycloakUserId) {
                    await this.assignKeycloakRole(keycloakApi, keycloakUserId, userType);
                }

            } catch (keycloakError: any) {
                this.logger.warn(`[signup] Keycloak step failed (non-blocking): ${keycloakError.message}`);
                // Don't throw - Keycloak is optional
            }

            this.logger.log('[signup] Registration completed successfully');

            return {
                clientId,
                userId,
                savingsId,
                username,
                email: finalEmail,
                userType,
                keycloakUserId,
            };

        } catch (error: any) {
            this.logger.error(`[signup] ERROR: ${error.message}`);
            if (error.response) {
                this.logger.error(`[signup] Response status: ${error.response.status}`);
                this.logger.error(`[signup] Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw new BadRequestException(error.message || 'Registration failed');
        }
    }
}
