import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * Platform-agnostic storage service
 * Uses SecureStore on native, AsyncStorage on web
 */
export const storage = {
    /** Standard secure storage (2KB limit on native) */
    async setItem(key: string, value: string): Promise<void> {
        if (isWeb) {
            await AsyncStorage.setItem(key, value);
        } else {
            await SecureStore.setItemAsync(key, value);
        }
    },

    async getItem(key: string): Promise<string | null> {
        if (isWeb) {
            return AsyncStorage.getItem(key);
        }
        return SecureStore.getItemAsync(key);
    },

    /** Basic storage (no size limit, for non-sensitive data) */
    async setBasicItem(key: string, value: string): Promise<void> {
        await AsyncStorage.setItem(key, value);
    },

    async getBasicItem(key: string): Promise<string | null> {
        return AsyncStorage.getItem(key);
    },

    async removeItem(key: string): Promise<void> {
        if (isWeb) {
            await AsyncStorage.removeItem(key);
        } else {
            await SecureStore.deleteItemAsync(key);
        }
    },

    async removeBasicItem(key: string): Promise<void> {
        await AsyncStorage.removeItem(key);
    },

    async multiRemove(keys: string[]): Promise<void> {
        await Promise.all(keys.map(key => this.removeItem(key)));
    },
};
