/**
 * Storage Service - Secure storage for tokens, AsyncStorage for user data
 * 
 * Pattern: Repository Pattern
 * - SecureStore for sensitive data (tokens) - encrypted on device
 * - AsyncStorage for non-sensitive data (user profile)
 * - Type-safe với TypeScript
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { User } from '../../types';

// Storage keys - Centralized key management
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'secure_access_token',
    REFRESH_TOKEN: 'secure_refresh_token',
    USER: '@auth/user',
} as const;

/**
 * Check if SecureStore is available (not available on web)
 */
const isSecureStoreAvailable = Platform.OS !== 'web';

class StorageService {
    // ==================== TOKEN METHODS (SecureStore) ====================

    async saveAccessToken(token: string): Promise<void> {
        if (isSecureStoreAvailable) {
            await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, token);
        } else {
            // Fallback for web
            await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
        }
    }

    async getAccessToken(): Promise<string | null> {
        if (isSecureStoreAvailable) {
            return await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
        } else {
            return await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        }
    }

    async saveRefreshToken(token: string): Promise<void> {
        if (isSecureStoreAvailable) {
            await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, token);
        } else {
            await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
        }
    }

    async getRefreshToken(): Promise<string | null> {
        if (isSecureStoreAvailable) {
            return await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        } else {
            return await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        }
    }

    async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
        await this.saveAccessToken(accessToken);
        await this.saveRefreshToken(refreshToken);
    }

    // ==================== USER METHODS (AsyncStorage - non-sensitive) ====================

    async saveUser(user: User): Promise<void> {
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }

    async getUser(): Promise<User | null> {
        const userString = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        if (userString) {
            try {
                return JSON.parse(userString) as User;
            } catch (error) {
                console.error('[Storage] Failed to parse user:', error);
                return null;
            }
        }
        return null;
    }

    // ==================== UTILITY METHODS ====================

    async clearAll(): Promise<void> {
        // Clear secure storage
        if (isSecureStoreAvailable) {
            await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
            await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
            await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        }
        // Clear AsyncStorage
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }

    async hasValidSession(): Promise<boolean> {
        const token = await this.getAccessToken();
        const user = await this.getUser();
        return !!(token && user);
    }
}

// Export singleton instance
export const storageService = new StorageService();
export default storageService;

