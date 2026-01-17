import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { secureStorageService } from './secure-storage.service';
import { authEvents } from './authEvents';

// Get API URL from environment
const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.API_URL || 'http://localhost:3001';

// Create axios instance
const api: AxiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: any) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });

    failedQueue = [];
};

// ==================== REQUEST INTERCEPTOR ====================
// Automatically attach access token to requests
api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        // Skip token for auth endpoints
        if (
            config.url?.includes('/auth/login') ||
            config.url?.includes('/auth/register') ||
            config.url?.includes('/auth/refresh')
        ) {
            return config;
        }

        // Get access token from storage
        const accessToken = await secureStorageService.getAccessToken();

        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ==================== RESPONSE INTERCEPTOR ====================
// Handle 401 errors and auto-refresh tokens
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // If error is not 401 or request already retried, reject
        if (error.response?.status !== 401 || originalRequest._retry) {
            return Promise.reject(error);
        }

        // If refreshing endpoint itself failed, session expired
        if (originalRequest.url?.includes('/auth/refresh')) {
            console.log('Refresh token expired - logging out');
            await secureStorageService.clearAll();
            authEvents.emitSessionExpired();
            return Promise.reject(error);
        }

        // If already refreshing, queue this request
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            })
                .then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                })
                .catch((err) => {
                    return Promise.reject(err);
                });
        }

        // Mark as retrying and start refresh
        originalRequest._retry = true;
        isRefreshing = true;

        try {
            // Get refresh token from storage
            const refreshToken = await secureStorageService.getRefreshToken();

            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            // Call refresh endpoint with token in body (mobile compatible)
            const response = await api.post('/api/auth/refresh', { refreshToken });
            const { accessToken } = response.data.data;

            // Save new token
            await secureStorageService.saveAccessToken(accessToken);

            // Update authorization header
            api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;

            // Process queued requests
            processQueue(null, accessToken);

            // Emit token refreshed event Token refreshed event
            authEvents.emitTokenRefreshed(accessToken);

            // Retry original request
            return api(originalRequest);
        } catch (refreshError) {
            // Refresh failed - session expired
            console.error('Token refresh failed:', refreshError);
            processQueue(refreshError as Error, null);

            await secureStorageService.clearAll();
            authEvents.emitSessionExpired();

            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default api;
