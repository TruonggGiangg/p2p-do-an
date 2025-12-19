/**
 * Auth API Service - Giao tiếp với NestJS server
 * 
 * Pattern: Repository Pattern
 * - Interface cho các operations liên quan đến Auth
 * - Sử dụng httpClient đã được config sẵn
 */

import axios from 'axios';
import { httpClient } from '../http/httpClient';
import { apiConfig } from '../config/api.config';
import {
    LoginResponse,
    AuthMeResponse,
    UserInfoResponse,
    RefreshTokenResponse,
} from '../../types';

class AuthApiService {
    /**
     * Login to NestJS server with Keycloak token
     */
    async login(keycloakToken: string): Promise<LoginResponse> {
        const response = await axios.post<LoginResponse>(
            `${apiConfig.baseUrl}/auth/login`,
            {},
            {
                headers: { Authorization: `Bearer ${keycloakToken}` },
                timeout: apiConfig.timeout,
            }
        );
        return response.data;
    }

    /**
     * Get current user info from token
     */
    async getMe(): Promise<AuthMeResponse> {
        const response = await httpClient.get<AuthMeResponse>('/auth/me');
        return response.data;
    }

    /**
     * Get detailed user info from Keycloak via server
     */
    async getUserInfo(): Promise<UserInfoResponse> {
        const response = await httpClient.get<UserInfoResponse>('/auth/userinfo');
        return response.data;
    }

    /**
     * Refresh access token
     */
    async refreshToken(): Promise<RefreshTokenResponse> {
        const response = await httpClient.post<RefreshTokenResponse>('/auth/refresh');
        return response.data;
    }

    /**
     * Logout user
     */
    async logout(): Promise<void> {
        await httpClient.post('/auth/logout');
    }
}

// Export singleton instance
export const authApi = new AuthApiService();
export default authApi;
