import { storage } from './storage.service';
import type { User } from '../../types/auth.types';

const KEYS = {
    ACCESS_TOKEN: 'secure_access_token',
    REFRESH_TOKEN: 'secure_refresh_token',
    USER: 'secure_user',
} as const;

/**
 * Auth-specific storage operations
 */
export const authStorage = {
    // Tokens
    async saveAccessToken(token: string): Promise<void> {
        await storage.setItem(KEYS.ACCESS_TOKEN, token);
    },

    async getAccessToken(): Promise<string | null> {
        return storage.getItem(KEYS.ACCESS_TOKEN);
    },

    async saveRefreshToken(token: string): Promise<void> {
        await storage.setItem(KEYS.REFRESH_TOKEN, token);
    },

    async getRefreshToken(): Promise<string | null> {
        return storage.getItem(KEYS.REFRESH_TOKEN);
    },

    // User
    async saveUser(user: User): Promise<void> {
        await storage.setItem(KEYS.USER, JSON.stringify(user));
    },

    async getUser(): Promise<User | null> {
        const userStr = await storage.getItem(KEYS.USER);
        return userStr ? JSON.parse(userStr) : null;
    },

    // Combined operations
    async saveAuthData(
        user: User,
        tokens: { accessToken: string; refreshToken: string }
    ): Promise<void> {
        await Promise.all([
            this.saveUser(user),
            this.saveAccessToken(tokens.accessToken),
            this.saveRefreshToken(tokens.refreshToken),
        ]);
    },

    async getAuthData(): Promise<{
        user: User;
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
    },

    async clearAll(): Promise<void> {
        await storage.multiRemove([
            KEYS.ACCESS_TOKEN,
            KEYS.REFRESH_TOKEN,
            KEYS.USER,
        ]);
    },

    async isAuthenticated(): Promise<boolean> {
        const accessToken = await this.getAccessToken();
        return !!accessToken;
    },
};
