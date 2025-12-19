/**
 * Keycloak API Service - Giao tiếp trực tiếp với Keycloak
 * 
 * Pattern: Service Layer
 * - Tách biệt logic gọi API Keycloak
 * - Xử lý authentication với Keycloak trực tiếp
 */

import axios from 'axios';
import { apiConfig } from '../config/api.config';
import { KeycloakTokenResponse, RegisterData } from '../../types';

class KeycloakApiService {
    /**
     * Login to Keycloak and get access token
     */
    async login(username: string, password: string): Promise<KeycloakTokenResponse> {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('client_id', apiConfig.keycloak.clientId);
        formData.append('username', username);
        formData.append('password', password);

        console.log('[KeycloakApi] Login request:', {
            endpoint: apiConfig.keycloak.tokenEndpoint,
            clientId: apiConfig.keycloak.clientId,
            username: username,
        });

        try {
            const response = await axios.post<KeycloakTokenResponse>(
                apiConfig.keycloak.tokenEndpoint,
                formData.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: apiConfig.timeout,
                }
            );

            console.log('[KeycloakApi] Login success');
            return response.data;
        } catch (error: any) {
            console.error('[KeycloakApi] Login failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            throw error;
        }
    }

    /**
     * Get admin token for Keycloak Admin API
     */
    async getAdminToken(): Promise<string> {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('client_id', 'admin-cli');
        formData.append('username', apiConfig.keycloak.adminUsername || 'admin');
        formData.append('password', apiConfig.keycloak.adminPassword || 'admin');

        const response = await axios.post<KeycloakTokenResponse>(
            apiConfig.keycloak.adminTokenEndpoint,
            formData.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: apiConfig.timeout,
            }
        );

        return response.data.access_token;
    }

    /**
     * Register new user on Keycloak
     */
    async register(data: RegisterData): Promise<void> {
        const adminToken = await this.getAdminToken();

        await axios.post(
            apiConfig.keycloak.usersEndpoint,
            {
                username: data.username,
                email: data.email,
                firstName: data.firstName,
                lastName: data.lastName,
                enabled: true,
                credentials: [
                    {
                        type: 'password',
                        value: data.password,
                        temporary: false,
                    },
                ],
            },
            {
                headers: {
                    Authorization: `Bearer ${adminToken}`,
                    'Content-Type': 'application/json',
                },
                timeout: apiConfig.timeout,
            }
        );
    }

    /**
     * Decode JWT token payload (without verification)
     */
    decodeToken(token: string): any {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const payload = parts[1];
            const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch (error) {
            console.error('[KeycloakApi] Failed to decode token:', error);
            return null;
        }
    }
}

// Export singleton instance
export const keycloakApi = new KeycloakApiService();
export default keycloakApi;
