import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface KeycloakAdminTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_expires_in: number;
    token_type: string;
}

interface CreateUserData {
    username: string;
    email?: string;
    firstName: string;
    lastName: string;
    enabled?: boolean;
    emailVerified?: boolean;
    credentials?: Array<{
        type: string;
        value: string;
        temporary: boolean;
    }>;
    attributes?: Record<string, string[]>;
}

@Injectable()
export class KeycloakService {
    private readonly logger = new Logger(KeycloakService.name);
    private readonly keycloakUrl: string;
    private readonly realm: string;
    private readonly adminUsername: string;
    private readonly adminPassword: string;
    private httpClient: AxiosInstance;

    constructor(private configService: ConfigService) {
        this.keycloakUrl = this.configService.getOrThrow<string>('keycloak.url');
        this.realm = this.configService.getOrThrow<string>('keycloak.realm');
        this.adminUsername = this.configService.getOrThrow<string>('keycloak.adminUsername');
        this.adminPassword = this.configService.getOrThrow<string>('keycloak.adminPassword');

        this.httpClient = axios.create({

            baseURL: this.keycloakUrl,
            timeout: 10000,
        });
    }

    /**
     * Get Keycloak admin access token
     */
    private async getAdminToken(): Promise<string> {
        try {
            const adminRealm = this.configService.get<string>('keycloak.adminRealm');
            const adminClientId = this.configService.get<string>('keycloak.adminClientId');

            const response = await this.httpClient.post<KeycloakAdminTokenResponse>(
                `/realms/${adminRealm}/protocol/openid-connect/token`,
                new URLSearchParams({
                    username: this.adminUsername,
                    password: this.adminPassword,
                    client_id: adminClientId as string,
                    grant_type: 'password',
                }),

                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                },
            );
            return response.data.access_token;
        } catch (error: any) {
            this.logger.error('Failed to get Keycloak admin token', error.message);
            throw new InternalServerErrorException('Không thể kết nối Keycloak');
        }
    }

    /**
     * Create user in Keycloak
     */
    async createUser(data: CreateUserData): Promise<string> {
        const token = await this.getAdminToken();

        try {
            const response = await this.httpClient.post(
                `/admin/realms/${this.realm}/users`,
                {
                    username: data.username,
                    email: data.email,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    enabled: data.enabled !== undefined ? data.enabled : true,
                    emailVerified: data.emailVerified !== undefined ? data.emailVerified : true,
                    credentials: data.credentials || [],
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            // Get user ID from Location header
            const location = response.headers['location'];
            if (location) {
                const userId = location.split('/').pop();
                return userId;
            }

            // Fallback: find user by username
            const users = await this.findUsersByUsername(data.username);
            if (users && users.length > 0) {
                return users[0].id;
            }

            throw new Error('Could not retrieve user ID');
        } catch (error: any) {
            if (error.response?.status === 409) {
                throw new Error(`Tài khoản ${data.username} đã tồn tại`);
            }
            this.logger.error('Failed to create Keycloak user', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new InternalServerErrorException(error.response?.data?.errorMessage || 'Không thể tạo tài khoản Keycloak');
        }
    }

    /**
     * Find users by username
     */
    async findUsersByUsername(username: string): Promise<any[]> {
        const token = await this.getAdminToken();

        try {
            const response = await this.httpClient.get(
                `/admin/realms/${this.realm}/users`,
                {
                    params: { username, exact: true },
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            return response.data;
        } catch (error: any) {
            this.logger.error('Failed to find user', error.message);
            return [];
        }
    }

    /**
     * Find single user by username
     */
    async findUserByUsername(username: string): Promise<any | null> {
        const users = await this.findUsersByUsername(username);
        return users.length > 0 ? users[0] : null;
    }

    /**
     * Assign role to user
     */
    async assignRole(userId: string, roleName: string): Promise<void> {
        const token = await this.getAdminToken();

        try {
            // Get role by name
            const rolesResponse = await this.httpClient.get(
                `/admin/realms/${this.realm}/roles`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );

            const role = rolesResponse.data.find((r: any) => r.name === roleName);
            if (!role) {
                this.logger.warn(`Role ${roleName} not found, skipping assignment`);
                return;
            }

            // Assign role to user
            await this.httpClient.post(
                `/admin/realms/${this.realm}/users/${userId}/role-mappings/realm`,
                [{ id: role.id, name: role.name }],
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            this.logger.log(`Assigned role ${roleName} to user ${userId}`);
        } catch (error: any) {
            this.logger.error(`Failed to assign role ${roleName}`, error.message);
            // Don't throw, role assignment failure shouldn't block registration
        }
    }
}
