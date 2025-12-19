/**
 * API Configuration - Đọc config từ environment variables
 * 
 * Pattern: Centralized Configuration
 * - Tất cả config API tập trung tại một điểm
 * - Dễ dàng thay đổi cho các môi trường khác nhau (dev, staging, prod)
 */

import Constants from 'expo-constants';

interface ApiConfig {
    baseUrl: string;
    keycloak: {
        baseUrl: string;
        realm: string;
        clientId: string;
        adminUsername?: string;
        adminPassword?: string;
        tokenEndpoint: string;
        adminTokenEndpoint: string;
        usersEndpoint: string;
    };
    timeout: number;
}

// Đọc từ environment hoặc dùng default
const getEnvVar = (key: string, defaultValue: string = ''): string => {
    // Expo extra từ app.config.ts/app.json
    const extra = Constants.expoConfig?.extra;
    if (extra && extra[key]) {
        return extra[key];
    }

    // Fallback to process.env (web/node)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key] as string;
    }

    return defaultValue;
};

const KEYCLOAK_BASE_URL = getEnvVar('KEYCLOAK_BASE_URL', 'http://118.69.41.95:9000');
const KEYCLOAK_REALM = getEnvVar('KEYCLOAK_REALM', 'fineract');

export const apiConfig: ApiConfig = {
    baseUrl: getEnvVar('API_BASE_URL', 'http://10.10.2.230:8080'),
    keycloak: {
        baseUrl: KEYCLOAK_BASE_URL,
        realm: KEYCLOAK_REALM,
        clientId: getEnvVar('KEYCLOAK_CLIENT_ID', 'community-app'),
        adminUsername: getEnvVar('KEYCLOAK_ADMIN_USERNAME', 'admin'),
        adminPassword: getEnvVar('KEYCLOAK_ADMIN_PASSWORD', 'admin'),
        tokenEndpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
        adminTokenEndpoint: `${KEYCLOAK_BASE_URL}/realms/master/protocol/openid-connect/token`,
        usersEndpoint: `${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
    },
    timeout: 30000,
};

export default apiConfig;
