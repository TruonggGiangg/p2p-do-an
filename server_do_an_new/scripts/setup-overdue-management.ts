/**
 * Script: Thiết lập quản lý quá hạn (Delinquency Management)
 * 1. Tạo các khoảng quá hạn (Ranges): Nhóm 1-5
 * 2. Tạo Group (Bucket) chứa các khoảng này.
 * 3. Cập nhật tất cả Loan Products sử dụng Bucket này và cấu hình ân hạn (grace).
 * 
 * Chạy: npx ts-node scripts/setup-overdue-management.ts
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
// DELINQUENCY SETUP
// ═══════════════════════════════════════════════════

async function setupDelinquencyRanges(client: AxiosInstance) {
    console.log('\n🔨 Bước 1: Thiết lập Delinquency Ranges (Nhóm nợ)...');

    // Lấy danh sách hiện có để tránh trùng
    const existingRes = await client.get('/delinquency/ranges');
    const existing: any[] = existingRes.data || [];

    const rangesToCreate = [
        { classification: 'Nhóm 1 (1-30 ngày)', minimumAgeDays: 1, maximumAgeDays: 30 },
        { classification: 'Nhóm 2 (31-60 ngày)', minimumAgeDays: 31, maximumAgeDays: 60 },
        { classification: 'Nhóm 3 (61-90 ngày)', minimumAgeDays: 61, maximumAgeDays: 90 },
        { classification: 'Nhóm quá hạn (>90 ngày)', minimumAgeDays: 91, maximumAgeDays: null },
    ];

    const rangeIds: any[] = [];

    for (const r of rangesToCreate) {
        const found = existing.find((ex: any) => ex.classification === r.classification);
        if (found) {
            console.log(`  ✅ Range "${r.classification}" đã tồn tại (ID: ${found.id})`);
            rangeIds.push(found.id);
        } else {
            console.log(`  🔨 Đang tạo Range: ${r.classification}...`);
            const res = await client.post('/delinquency/ranges', {
                ...r,
                locale: 'en',
            });
            console.log(`  ✅ Tạo thành công (ID: ${res.data.resourceId})`);
            rangeIds.push(res.data.resourceId);
        }
    }

    return rangeIds;
}

async function setupDelinquencyBucket(client: AxiosInstance, rangeIds: number[]) {
    console.log('\n🔨 Bước 2: Thiết lập Delinquency Bucket (Chính sách P2P)...');

    const bucketName = 'Chính sách quản lý quá hạn P2P';

    // Kiểm tra bucket hiện có
    const existingRes = await client.get('/delinquency/buckets');
    const existing: any[] = existingRes.data || [];
    const found = existing.find((ex: any) => ex.name === bucketName);

    if (found) {
        console.log(`  ✅ Bucket "${bucketName}" đã tồn tại (ID: ${found.id})`);
        return found.id;
    }

    const res = await client.post('/delinquency/buckets', {
        name: bucketName,
        ranges: rangeIds,
        locale: 'en',
    });
    console.log(`  ✅ Tạo Bucket thành công (ID: ${res.data.resourceId})`);
    return res.data.resourceId;
}

async function updateLoanProducts(client: AxiosInstance, bucketId: number) {
    console.log('\n🔨 Bước 3: Cập nhật cấu hình cho tất cả Loan Products...');

    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    for (const p of products) {
        console.log(`  ⚙️ Đang xử lý sản phẩm: ${p.name} (ID: ${p.id})...`);

        // Lấy thông tin chi tiết để giữ lại các setting cũ
        const detailRes = await client.get(`/loanproducts/${p.id}`);
        const details = detailRes.data;

        // Chiến lược Minimal Payload: Chỉ gửi những trường bắt đầu bằng cấu hình cơ bản + delinquency
        const updatePayload: any = {
            // Core
            locale: 'vi',
            dateFormat: 'yyyy-MM-dd',

            // Currency (Required in most Fineract versions for PUT)
            currencyCode: details.currency.code,
            digitsAfterDecimal: details.currency.decimalPlaces,
            inMultiplesOf: details.currency.inMultiplesOf,

            // Terms
            principal: details.principal,
            numberOfRepayments: details.numberOfRepayments,
            repaymentEvery: details.repaymentEvery,
            repaymentFrequencyType: details.repaymentFrequencyType.id,

            // Interest
            interestRatePerPeriod: details.interestRatePerPeriod ?? details.defaultInterestRatePerPeriod,
            interestRateFrequencyType: details.interestRateFrequencyType.id,
            amortizationType: details.amortizationType.id,
            interestType: details.interestType.id,
            interestCalculationPeriodType: details.interestCalculationPeriodType.id,

            // Settings
            transactionProcessingStrategyCode: details.transactionProcessingStrategyCode || 'mifos-standard-strategy',
            daysInYearType: details.daysInYearType?.id || 365,
            daysInMonthType: details.daysInMonthType?.id || 1,

            // Delinquency (The main goal)
            delinquencyBucketId: bucketId,
            overdueDaysForNPA: 90,
            graceOnArrearsAgeing: 0,

            // Accounting
            accountingRule: details.accountingRule.id,
        };

        // Add optional min/max if they exist
        if (details.minPrincipal) updatePayload.minPrincipal = details.minPrincipal;
        if (details.maxPrincipal) updatePayload.maxPrincipal = details.maxPrincipal;
        if (details.minNumberOfRepayments) updatePayload.minNumberOfRepayments = details.minNumberOfRepayments;
        if (details.maxNumberOfRepayments) updatePayload.maxNumberOfRepayments = details.maxNumberOfRepayments;

        try {
            await client.put(`/loanproducts/${p.id}`, updatePayload);
            console.log(`     ✅ Cập nhật thành công! (Delinquency Bucket ID: ${bucketId})`);
        } catch (err: any) {
            console.error(`     ❌ Lỗi khi cập nhật sản phẩm ${p.id}: ${err.message}`);
            if (err.response?.data) {
                console.error(`        Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
            }
        }
    }
}

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  CẤU HÌNH QUẢN LÝ QUÁ HẠN (DELINQUENCY)');
    console.log('══════════════════════════════════════════════════');

    const client = await createFineractClient();

    // 1. Tạo Ranges
    const rangeIds = await setupDelinquencyRanges(client);

    // 2. Tạo Bucket
    const bucketId = await setupDelinquencyBucket(client, rangeIds);

    // 3. Cập nhật Loan Products
    await updateLoanProducts(client, bucketId);

    console.log('\n✨ TẤT CẢ CẤU HÌNH ĐÃ HOÀN TẤT!');
}

main().catch(err => {
    console.error('\n💥 Lỗi Fatal:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
