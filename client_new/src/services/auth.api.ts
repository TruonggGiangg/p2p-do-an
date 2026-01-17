import api from './api';
import { secureStorageService } from './secure-storage.service';
import { authEvents } from './authEvents';
import type {
    LoginRequest,
    RegisterRequest,
    LoginResponse,
    RegisterResponse,
    RefreshResponse,
    User,
} from '../types/auth.types';

class AuthApi {
    /**
     * Register new user
     * Server will create: Keycloak user + Fineract client + Savings account
     */
    async register(data: RegisterRequest): Promise<RegisterResponse> {
        const response = await api.post<RegisterResponse>('/api/auth/register', data);
        return response.data;
    }

    /**
     * Login with username and password
     * Server proxies to Keycloak and returns internal JWT
     */
    async login(credentials: LoginRequest): Promise<User> {
        const response = await api.post<LoginResponse>('/api/auth/login', credentials);
        const { data, accessToken, refreshToken } = response.data;

        // Save tokens and user data
        await secureStorageService.saveAuthData(data, { accessToken, refreshToken });

        // Emit login event
        authEvents.emitLogin();

        return data;
    }

    /**
     * Refresh access token
     */
    async refreshToken(): Promise<string> {
        const response = await api.post<RefreshResponse>('/api/auth/refresh');
        const { accessToken, ...userData } = response.data.data;

        // Save new access token
        await secureStorageService.saveAccessToken(accessToken);
        await secureStorageService.saveUser(userData);

        // Emit token refreshed event
        authEvents.emitTokenRefreshed(accessToken);

        return accessToken;
    }

    /**
     * Get current user info
     */
    async getMe(): Promise<User> {
        const response = await api.get<{ data: User }>('/api/auth/me');
        const user = response.data.data;

        // Update stored user data
        await secureStorageService.saveUser(user);

        return user;
    }

    /**
     * Logout user
     */
    async logout(): Promise<void> {
        try {
            await api.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout API call failed:', error);
            // Continue with local cleanup even if API fails
        } finally {
            // Clear local storage
            await secureStorageService.clearAll();

            // Emit logout event
            authEvents.emitLogout();
        }
    }

    /**
     * Check if user is authenticated (has valid token)
     */
    async isAuthenticated(): Promise<boolean> {
        return await secureStorageService.isAuthenticated();
    }
}

export const authApi = new AuthApi();
