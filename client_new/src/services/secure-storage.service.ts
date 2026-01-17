import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEYS = {
    ACCESS_TOKEN: 'secure_access_token',
    REFRESH_TOKEN: 'secure_refresh_token',
    USER: 'secure_user',
};

const isWeb = Platform.OS === 'web';

class SecureStorageService {
    // ==================== TOKEN MANAGEMENT ====================

    async saveAccessToken(token: string): Promise<void> {
        if (isWeb) {
            await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, token);
        } else {
            await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
        }
    }

    async getAccessToken(): Promise<string | null> {
        if (isWeb) {
            return await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
        } else {
            return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
        }
    }

    async saveRefreshToken(token: string): Promise<void> {
        if (isWeb) {
            await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
        } else {
            await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
        }
    }

    async getRefreshToken(): Promise<string | null> {
        if (isWeb) {
            return await AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
        } else {
            return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
        }
    }

    // ==================== USER DATA ====================

    async saveUser(user: any): Promise<void> {
        const userStr = JSON.stringify(user);
        if (isWeb) {
            await AsyncStorage.setItem(KEYS.USER, userStr);
        } else {
            await SecureStore.setItemAsync(KEYS.USER, userStr);
        }
    }

    async getUser(): Promise<any | null> {
        let userStr;
        if (isWeb) {
            userStr = await AsyncStorage.getItem(KEYS.USER);
        } else {
            userStr = await SecureStore.getItemAsync(KEYS.USER);
        }
        return userStr ? JSON.parse(userStr) : null;
    }

    // ==================== AUTH DATA ====================

    async saveAuthData(
        user: any,
        tokens: { accessToken: string; refreshToken: string }
    ): Promise<void> {
        await Promise.all([
            this.saveUser(user),
            this.saveAccessToken(tokens.accessToken),
            this.saveRefreshToken(tokens.refreshToken),
        ]);
    }

    async getAuthData(): Promise<{
        user: any;
        accessToken: string | null;
        refreshToken: string | null;
    } | null> {
        const [user, accessToken, refreshToken] = await Promise.all([
            this.getUser(),
            this.getAccessToken(),
            this.getRefreshToken(),
        ]);

        if (!user || !accessToken) {
            return null;
        }

        return { user, accessToken, refreshToken };
    }

    // ==================== CLEAR ====================

    async clearAll(): Promise<void> {
        if (isWeb) {
            await Promise.all([
                AsyncStorage.removeItem(KEYS.ACCESS_TOKEN),
                AsyncStorage.removeItem(KEYS.REFRESH_TOKEN),
                AsyncStorage.removeItem(KEYS.USER),
            ]);
        } else {
            await Promise.all([
                SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
                SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
                SecureStore.deleteItemAsync(KEYS.USER),
            ]);
        }
    }

    // ==================== UTILITIES ====================

    async isAuthenticated(): Promise<boolean> {
        const accessToken = await this.getAccessToken();
        return !!accessToken;
    }
}

export const secureStorageService = new SecureStorageService();
