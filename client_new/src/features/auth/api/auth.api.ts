import { api, authStorage, authEvents } from '../../../core';
import type {
    LoginRequest,
    RegisterRequest,
    LoginResponse,
    RegisterResponse,
    User,
} from '../../../types/auth.types';

export const authAPI = {
    /** Register new user */
    register: async (data: RegisterRequest): Promise<RegisterResponse> => {
        const response = await api.post<RegisterResponse>('/api/auth/register', data);
        return response.data;
    },

    /** Login with username and password */
    login: async (credentials: LoginRequest): Promise<User> => {
        const response = await api.post<LoginResponse>('/api/auth/login', credentials);
        const { data, accessToken, refreshToken } = response.data;

        await authStorage.saveAuthData(data, { accessToken, refreshToken });
        authEvents.emitLogin();

        return data;
    },

    /** Get current user info */
    getMe: async (): Promise<User> => {
        const response = await api.get<{ data: User }>('/api/auth/me');
        const user = response.data.data;

        await authStorage.saveUser(user);

        return user;
    },

    /** Logout user */
    logout: async (): Promise<void> => {
        try {
            await api.post('/api/auth/logout');
        } catch {
            // Continue with local cleanup even if API fails
        } finally {
            await authStorage.clearAll();
            authEvents.emitLogout();
        }
    },

    /** Check if user is authenticated */
    isAuthenticated: async (): Promise<boolean> => {
        return authStorage.isAuthenticated();
    },
};
