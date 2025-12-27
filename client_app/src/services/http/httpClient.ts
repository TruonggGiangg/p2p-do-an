/**
 * HTTP Client - Axios instance với interceptors
 * 
 * Pattern: Singleton HTTP Client
 * - Một instance duy nhất cho toàn app
 * - Tự động attach Authorization header
 * - Xử lý token refresh khi expired
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Alert } from 'react-native';
import { apiConfig } from '../config/api.config';
import { storageService } from '../storage/storage.service';
import { authEvents } from '../auth/authEvents';

// Create axios instance
const httpClient: AxiosInstance = axios.create({
    baseURL: apiConfig.baseUrl,
    timeout: apiConfig.timeout,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Attach token to requests
httpClient.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        const token = await storageService.getAccessToken();
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error: AxiosError) => {
        console.error('[HTTP] Request error:', error.message);
        return Promise.reject(error);
    }
);

// Response interceptor - Handle errors globally
httpClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Handle 401 Unauthorized - Token expired
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Try to refresh Keycloak token (NOT NestJS token!)
                const refreshToken = await storageService.getRefreshToken();
                if (refreshToken) {
                    // Token refresh attempt (logged only in dev)

                    // Refresh directly with Keycloak
                    const formData = new URLSearchParams();
                    formData.append('grant_type', 'refresh_token');
                    formData.append('client_id', apiConfig.keycloak.clientId);
                    formData.append('refresh_token', refreshToken);

                    const response = await axios.post(
                        apiConfig.keycloak.tokenEndpoint,
                        formData.toString(),
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            timeout: apiConfig.timeout,
                        }
                    );

                    const newAccessToken = response.data?.access_token;
                    const newRefreshToken = response.data?.refresh_token;

                    if (newAccessToken) {
                        await storageService.saveTokens(newAccessToken, newRefreshToken);
                        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                        return httpClient(originalRequest);
                    }
                }
            } catch (refreshError: any) {
                console.error('[HTTP] Keycloak token refresh failed:', refreshError.message);

                // Clear tokens and emit session expired event
                // NOTE: Alert is shown by AuthContext, not here (to avoid duplicates)
                await storageService.clearAll();
                authEvents.emit('SESSION_EXPIRED');
            }
        }

        // ✅ NEW: Handle network errors
        if (!error.response && error.request) {
            // Network error (no response)
            console.error('[HTTP] Network error:', error.message);
            Alert.alert(
                'Lỗi kết nối',
                'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
                [{ text: 'OK' }]
            );
        } else if (error.response) {
            // Server responded with error
            console.error('[HTTP] Response error:', error.response?.data || error.message);

            // Show alert for critical errors (500, etc.)
            if (error.response.status >= 500) {
                Alert.alert(
                    'Lỗi máy chủ',
                    'Đã xảy ra lỗi từ máy chủ. Vui lòng thử lại sau.',
                    [{ text: 'OK' }]
                );
            }
        }

        return Promise.reject(error);
    }
);

export { httpClient };
export default httpClient;
