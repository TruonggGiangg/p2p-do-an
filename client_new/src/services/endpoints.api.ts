import api from './api';
import { secureStorageService } from './secure-storage.service';

// ==================== AUTH API ====================

export interface RegisterData {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    userType?: 'borrower' | 'lender';
}

export interface LoginData {
    username: string;
    password: string;
}

export const authAPI = {
    // POST /api/auth/register
    register: async (data: RegisterData) => {
        const response = await api.post('/api/auth/register', data);
        return response.data;
    },

    // POST /api/auth/login
    login: async (data: LoginData) => {
        const response = await api.post('/api/auth/login', data);
        return response.data;
    },

    // POST /api/auth/refresh
    refresh: async () => {
        const refreshToken = await secureStorageService.getRefreshToken();

        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await api.post('/api/auth/refresh', { refreshToken });
        return response.data;
    },

    // GET /api/auth/me
    getProfile: async () => {
        const response = await api.get('/api/auth/me');
        return response.data;
    },

    // POST /api/auth/logout
    logout: async () => {
        const response = await api.post('/api/auth/logout');
        return response.data;
    },
};

// ==================== HEALTH API ====================

export const healthAPI = {
    // GET /api/health
    check: async () => {
        const response = await api.get('/api/health');
        return response.data;
    },

    // GET /api/health/ready
    ready: async () => {
        const response = await api.get('/api/health/ready');
        return response.data;
    },
};
