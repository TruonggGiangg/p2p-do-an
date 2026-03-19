/**
 * Script: Đọc tất cả Loan Products từ Fineract và hiển thị chi tiết
 * 
 * Chạy: npx ts-node scripts/get-loan-products.ts
 */

import axios, { AxiosInstance } from 'axios';

// ═══════════════════════════════════════════════════
// CẤU HÌNH
// ═══════════════════════════════════════════════════
const CONFIG = {
    fineractUrl: process.env.FINERACT_API_URL || 'http://localhost:8080/fineract-provider/api/v1',
    tenant: process.env.FINERACT_TENANT || 'default',

    // Keycloak auth
    keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:9000',
    keycloakRealm: process.env.KEYCLOAK_REALM || 'fineract',
    keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || 'community-app',
    keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'real-client-secret-123',

    // Fineract credentials
    username: process.env.FINERACT_USERNAME || 'mifos',
    password: process.env.FINERACT_PASSWORD || 'password',

    // Chế độ auth
    authMode: (process.env.FINERACT_AUTH_MODE || 'keycloak') as 'keycloak' | 'basic',
};

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

async function getKeycloakToken(): Promise<string> {
    const tokenUrl = `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakRealm}/protocol/openid-connect/token`;
    const params = new URLSearchParams({
        grant_type: 'password',
        client_id: CONFIG.keycloakClientId,
        client_secret: CONFIG.keycloakClientSecret,
        username: CONFIG.username,
        password: CONFIG.password,
    });

    try {
        const res = await axios.post(tokenUrl, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
        });
        return res.data.access_token;
    } catch (error: any) {
        console.error(`❌ Keycloak Auth FAILED: ${error.response?.data?.error_description || error.message}`);
        throw error;
    }
}

async function createFineractClient(): Promise<AxiosInstance> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Fineract-Platform-TenantId': CONFIG.tenant,
    };

    if (CONFIG.authMode === 'keycloak') {
        try {
            const token = await getKeycloakToken();
            headers['Authorization'] = `Bearer ${token}`;
        } catch (err) {
            console.log('⚠️  Keycloak failed, falling back to Basic Auth...');
            const basicAuth = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
            headers['Authorization'] = `Basic ${basicAuth}`;
        }
    } else {
        const basicAuth = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
    }

    return axios.create({
        baseURL: CONFIG.fineractUrl,
        headers,
    });
}

// ═══════════════════════════════════════════════════
// MAIN LOGIC
// ═══════════════════════════════════════════════════

async function getAllLoanProducts(client: AxiosInstance) {
    console.log('\n📋 Đang lấy danh sách tất cả Loan Products...');
    const res = await client.get('/loanproducts');
    return res.data;
}

async function getLoanProductDetails(client: AxiosInstance, id: number) {
    const res = await client.get(`/loanproducts/${id}`);
    return res.data;
}

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  CHI TIẾT LOAN PRODUCTS TRONG FINERACT');
    console.log('══════════════════════════════════════════════════');

    const client = await createFineractClient();
    const products = await getAllLoanProducts(client);

    if (!products || products.length === 0) {
        console.log('❌ Không tìm thấy sản phẩm vay nào.');
        return;
    }

    console.log(`Tìm thấy ${products.length} sản phẩm:\n`);

    for (const p of products) {
        const details = await getLoanProductDetails(client, p.id);

        console.log(`📌 [ID: ${p.id}] ${p.name} (${p.shortName})`);
        console.log(`   - Mô tả: ${details.description || 'N/A'}`);
        console.log(`   - Tiền tệ: ${details.currency.code} (Làm tròn: ${details.currency.inMultiplesOf})`);
        console.log(`   - Gốc: ${details.minPrincipal || 'N/A'} - ${details.maxPrincipal || 'N/A'} (Mặc định: ${details.principal})`);
        console.log(`   - Lãi suất: ${details.annualInterestRate}%/năm`);
        console.log(`   - Số kỳ trả: ${details.minNumberOfRepayments || 'N/A'} - ${details.maxNumberOfRepayments || 'N/A'} (Mặc định: ${details.numberOfRepayments})`);
        console.log(`   - Loại lãi suất: ${details.interestRateFrequencyType?.value || 'N/A'}`);
        console.log(`   - Trạng thái: ${details.closeDate ? 'Đã đóng' : 'Đang hoạt động'}`);
        console.log('   ' + '─'.repeat(50));
    }

    console.log('\n Hoàn tất.');
}

main().catch(err => {
    console.error('\n💥 Lỗi:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
