import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthTokens } from '../types/auth.types';

const KEYS = {
    ACCESS_TOKEN: '@auth/access_token',
    REFRESH_TOKEN: '@auth/refresh_token',
    USER: '@auth/user',
};

class StorageService {
    // ==================== TOKEN METHODS ====================

    async saveAccessToken(token: string): Promise<void> {
        await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, token);
    }

    async getAccessToken(): Promise<string | null> {
        return await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
    }

    async saveRefreshToken(token: string): Promise<void> {
        await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
    }

    async getRefreshToken(): Promise<string | null> {
        return await AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
    }

    async saveTokens(tokens: AuthTokens): Promise<void> {
        await AsyncStorage.multiSet([
            [KEYS.ACCESS_TOKEN, tokens.accessToken],
            [KEYS.REFRESH_TOKEN, tokens.refreshToken],
        ]);
    }

    async getTokens(): Promise<AuthTokens | null> {
        const [[, accessToken], [, refreshToken]] = await AsyncStorage.multiGet([
            KEYS.ACCESS_TOKEN,
            KEYS.REFRESH_TOKEN,
        ]);

        if (!accessToken || !refreshToken) {
            return null;
        }

        return { accessToken, refreshToken };
    }

    async removeTokens(): Promise<void> {
        await AsyncStorage.multiRemove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN]);
    }

    // ==================== USER METHODS ====================

    async saveUser(user: User): Promise<void> {
        await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
    }

    async getUser(): Promise<User | null> {
        const userJson = await AsyncStorage.getItem(KEYS.USER);
        if (!userJson) return null;

        try {
            return JSON.parse(userJson) as User;
        } catch (error) {
            console.error('Failed to parse user from storage:', error);
            return null;
        }
    }

    async removeUser(): Promise<void> {
        await AsyncStorage.removeItem(KEYS.USER);
    }

    // ==================== COMBINED METHODS ====================

    async saveAuthData(user: User, tokens: AuthTokens): Promise<void> {
        await AsyncStorage.multiSet([
            [KEYS.USER, JSON.stringify(user)],
            [KEYS.ACCESS_TOKEN, tokens.accessToken],
            [KEYS.REFRESH_TOKEN, tokens.refreshToken],
        ]);
    }

    async getAuthData(): Promise<{ user: User; tokens: AuthTokens } | null> {
        const [[, userJson], [, accessToken], [, refreshToken]] = await AsyncStorage.multiGet([
            KEYS.USER,
            KEYS.ACCESS_TOKEN,
            KEYS.REFRESH_TOKEN,
        ]);

        if (!userJson || !accessToken || !refreshToken) {
            return null;
        }

        try {
            const user = JSON.parse(userJson) as User;
            return {
                user,
                tokens: { accessToken, refreshToken },
            };
        } catch (error) {
            console.error('Failed to parse auth data:', error);
            return null;
        }
    }

    async clearAll(): Promise<void> {
        await AsyncStorage.multiRemove([KEYS.USER, KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN]);
    }

    // ==================== UTILITY ====================

    async isAuthenticated(): Promise<boolean> {
        const accessToken = await this.getAccessToken();
        return !!accessToken;
    }
}

export const storageService = new StorageService();
