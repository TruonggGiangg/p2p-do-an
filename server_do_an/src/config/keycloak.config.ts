import { registerAs } from '@nestjs/config';

export default registerAs('keycloak', () => ({
    baseUrl: process.env.KEYCLOAK_BASE_URL || 'http://118.69.41.95:9000',
    realm: process.env.KEYCLOAK_REALM || 'fineract',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'community-app',
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    apiTimeout: parseInt(process.env.KEYCLOAK_API_TIMEOUT || '30000', 10),

    // Derived URLs
    get tokenUrl() {
        return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    },
    get adminUrl() {
        return `${this.baseUrl}/admin/realms/${this.realm}`;
    },
    get certsUrl() {
        return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
    },
    get userInfoUrl() {
        return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/userinfo`;
    },
}));
