import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface KeycloakUser {
    id: string;
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled: boolean;
}

@Injectable()
export class KeycloakService {
    private readonly baseUrl: string;
    private readonly realm: string;
    private readonly adminUsername: string;
    private readonly adminPassword: string;
    private readonly apiTimeout: number;
    private readonly httpClient: AxiosInstance;

    constructor(private readonly configService: ConfigService) {
        this.baseUrl = this.configService.getOrThrow<string>('KEYCLOAK_BASE_URL');
        this.realm = this.configService.get<string>('KEYCLOAK_REALM') || 'fineract';

        // Security: Throw error if admin credentials not set (no defaults)
        const adminUsername = this.configService.get<string>('KEYCLOAK_ADMIN_USERNAME');
        const adminPassword = this.configService.get<string>('KEYCLOAK_ADMIN_PASSWORD');

        if (!adminUsername || !adminPassword) {
            throw new Error('[KeycloakService] KEYCLOAK_ADMIN_USERNAME and KEYCLOAK_ADMIN_PASSWORD must be set in .env');
        }

        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
        this.apiTimeout = parseInt(this.configService.get<string>('KEYCLOAK_API_TIMEOUT') || '30000', 10);

        this.httpClient = axios.create({
            timeout: this.apiTimeout,
        });
    }

    /**
     * Get admin access token from master realm
     */
    async getAdminToken(): Promise<string> {
        const tokenUrl = `${this.baseUrl}/realms/master/protocol/openid-connect/token`;

        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('client_id', 'admin-cli');
        formData.append('username', this.adminUsername);
        formData.append('password', this.adminPassword);

        try {
            const response = await this.httpClient.post(tokenUrl, formData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });

            return response.data.access_token;
        } catch (error) {
            console.error('[KeycloakService] Failed to get admin token:', error.message);
            throw new UnauthorizedException('Cannot connect to authentication server');
        }
    }

    /**
     * Find user by username in Keycloak
     */
    async findUserByUsername(username: string): Promise<KeycloakUser | null> {
        const adminToken = await this.getAdminToken();
        const searchUrl = `${this.baseUrl}/admin/realms/${this.realm}/users`;

        try {
            const response = await this.httpClient.get(searchUrl, {
                params: { username, exact: true },
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.data && response.data.length > 0) {
                return response.data[0];
            }
            return null;
        } catch (error) {
            console.error('[KeycloakService] Failed to find user:', error.message);
            throw new BadRequestException('Failed to search user');
        }
    }

    /**
     * Reset user password in Keycloak
     */
    async resetPassword(userId: string, newPassword: string): Promise<void> {
        // Validate password first
        const validation = this.validateKeycloakPassword(newPassword);
        if (!validation.valid) {
            throw new BadRequestException(validation.message);
        }

        const adminToken = await this.getAdminToken();
        const resetUrl = `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}/reset-password`;

        try {
            await this.httpClient.put(
                resetUrl,
                {
                    type: 'password',
                    value: newPassword,
                    temporary: false,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${adminToken}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            console.log('[KeycloakService] Password reset successfully for user:', userId);
        } catch (error) {
            console.error('[KeycloakService] Failed to reset password:', error.message);
            if (error.response?.status === 400) {
                throw new BadRequestException('Password does not meet policy requirements');
            }
            throw new BadRequestException('Failed to reset password');
        }
    }

    /**
     * Validate password against Keycloak policy
     */
    validateKeycloakPassword(password: string): { valid: boolean; message: string } {
        if (!password || typeof password !== 'string') {
            return { valid: false, message: 'Mật khẩu không được để trống' };
        }

        const trimmedPassword = password.trim();

        // Check length
        if (trimmedPassword.length < 12 || trimmedPassword.length > 50) {
            return { valid: false, message: 'Mật khẩu phải từ 12 đến 50 ký tự' };
        }

        // Check whitespace
        if (/\s/.test(trimmedPassword)) {
            return { valid: false, message: 'Mật khẩu không được chứa khoảng trắng' };
        }

        // Check for digit
        if (!/\d/.test(trimmedPassword)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ số' };
        }

        // Check for lowercase
        if (!/[a-z]/.test(trimmedPassword)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ thường (a-z)' };
        }

        // Check for uppercase
        if (!/[A-Z]/.test(trimmedPassword)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ hoa (A-Z)' };
        }

        // Check for special character
        if (!/[^\w\s]/.test(trimmedPassword)) {
            return { valid: false, message: 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)' };
        }

        return { valid: true, message: 'Mật khẩu hợp lệ' };
    }

    /**
     * Get token endpoint URL
     */
    getTokenUrl(): string {
        return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    }

    /**
     * Get userinfo endpoint URL
     */
    getUserInfoUrl(): string {
        return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/userinfo`;
    }
}
