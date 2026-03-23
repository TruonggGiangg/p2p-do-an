/**
 * Script: Đọc tất cả Charges (khoản phí) trong Fineract
 *
 * Hiển thị chi tiết:
 *   - Thông tin charge: tên, loại, cách tính, số tiền
 *   - Phân loại: Fee / Penalty
 *   - Charge đang gắn với loan product nào
 *
 * Chạy: npx ts-node scripts/get-charges.ts
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

function formatAmount(charge: any): string {
    const calcTypeId = typeof charge.chargeCalculationType === 'object'
        ? charge.chargeCalculationType.id
        : charge.chargeCalculationType;

    // 1 = Flat, 2 = % of Amount, 3 = % of Interest, 4 = % of Amount+Interest, 5 = % of Loan Amount Due
    if ([2, 3, 4, 5].includes(calcTypeId)) {
        return `${charge.amount}%`;
    }
    return `${Number(charge.amount).toLocaleString('vi-VN')} ${charge.currency?.code || 'VND'}`;
}

function getEnumValue(field: any): string {
    if (typeof field === 'object' && field !== null) {
        return field.value || field.code || String(field.id);
    }
    return String(field ?? 'N/A');
}

// ═══════════════════════════════════════════════════
// BƯỚC 1: Đọc tất cả Charges
// ═══════════════════════════════════════════════════

async function listAllCharges(client: AxiosInstance) {
    console.log('\n📋 Đang lấy danh sách tất cả Charges...');

    const res = await client.get('/charges');
    const charges: any[] = res.data || [];

    if (charges.length === 0) {
        console.log('  ⚠️  Không tìm thấy charges nào trong Fineract.');
        return [];
    }

    console.log(`  Tìm thấy ${charges.length} charges:\n`);

    // Phân loại
    const fees = charges.filter((c: any) => !c.penalty);
    const penalties = charges.filter((c: any) => c.penalty);

    // ── FEES ──
    if (fees.length > 0) {
        console.log('  ┌──────────────────────────────────────────────────────────┐');
        console.log('  │  💰 PHÍ (FEES)                                          │');
        console.log('  ├──────────────────────────────────────────────────────────┤');
        for (const c of fees) {
            printChargeDetail(c);
        }
        console.log('  └──────────────────────────────────────────────────────────┘');
    }

    // ── PENALTIES ──
    if (penalties.length > 0) {
        console.log('\n  ┌──────────────────────────────────────────────────────────┐');
        console.log('  │  ⚠️  PHÍ PHẠT (PENALTIES)                                │');
        console.log('  ├──────────────────────────────────────────────────────────┤');
        for (const c of penalties) {
            printChargeDetail(c);
        }
        console.log('  └──────────────────────────────────────────────────────────┘');
    }

    return charges;
}

function printChargeDetail(c: any) {
    const calcType = getEnumValue(c.chargeCalculationType);
    const timeType = getEnumValue(c.chargeTimeType);
    const appliesTo = getEnumValue(c.chargeAppliesTo);
    const paymentMode = getEnumValue(c.chargePaymentMode);
    const active = c.active ? '✅ Active' : '❌ Inactive';

    console.log(`  │`);
    console.log(`  │  📌 [ID: ${c.id}] ${c.name}`);
    console.log(`  │     ├── Trạng thái:     ${active}`);
    console.log(`  │     ├── Áp dụng cho:     ${appliesTo}`);
    console.log(`  │     ├── Thời điểm:       ${timeType}`);
    console.log(`  │     ├── Cách tính:       ${calcType}`);
    console.log(`  │     ├── Số tiền/Tỷ lệ:  ${formatAmount(c)}`);
    console.log(`  │     ├── Chế độ thanh toán: ${paymentMode}`);
    console.log(`  │     └── Tiền tệ:         ${c.currency?.code || 'N/A'}`);
}

// ═══════════════════════════════════════════════════
// BƯỚC 2: Kiểm tra charge đang gắn với product nào
// ═══════════════════════════════════════════════════

async function checkChargesOnProducts(client: AxiosInstance) {
    console.log('\n\n🔗 Kiểm tra charges đang gắn trên từng Loan Product...');

    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    if (products.length === 0) {
        console.log('  Không tìm thấy loan product nào.');
        return;
    }

    // Bảng tổng hợp: chargeId -> danh sách product
    const chargeToProducts: Record<number, string[]> = {};
    let totalProductsWithCharges = 0;

    for (const p of products) {
        const detail = await client.get(`/loanproducts/${p.id}`);
        const productCharges: any[] = detail.data.charges || [];

        if (productCharges.length > 0) {
            totalProductsWithCharges++;
        }

        console.log(`\n  📦 ${p.name} (${p.shortName}, ID: ${p.id})`);

        if (productCharges.length === 0) {
            console.log(`     └── (Không có charges)`);
        } else {
            for (let i = 0; i < productCharges.length; i++) {
                const c = productCharges[i];
                const calcType = getEnumValue(c.chargeCalculationType);
                const isPenalty = c.penalty ? '⚠️  PENALTY' : '💰 FEE';
                const isLast = i === productCharges.length - 1;
                const prefix = isLast ? '└──' : '├──';
                console.log(`     ${prefix} [ID: ${c.id}] ${c.name} | ${isPenalty} | ${calcType} = ${formatAmount(c)}`);

                // Track
                if (!chargeToProducts[c.id]) chargeToProducts[c.id] = [];
                chargeToProducts[c.id].push(`${p.name} (${p.shortName})`);
            }
        }
    }

    // ── Bảng mapping ngược: Charge → Products ──
    console.log('\n\n📊 BẢNG TỔNG HỢP: Charge → Loan Products');
    console.log('  ─'.repeat(30));

    const chargeIds = Object.keys(chargeToProducts).map(Number);
    if (chargeIds.length === 0) {
        console.log('  Không có charge nào đang gắn với product.');
    } else {
        for (const chargeId of chargeIds) {
            const productNames = chargeToProducts[chargeId];
            console.log(`\n  🏷️  Charge ID: ${chargeId}`);
            for (const pName of productNames) {
                console.log(`     └── ${pName}`);
            }
        }
    }

    // ── Tổng kết ──
    console.log('\n  ══════════════════════════════════════════════');
    console.log(`  📊 TỔNG KẾT:`);
    console.log(`     - Tổng loan products:          ${products.length}`);
    console.log(`     - Products có charges:          ${totalProductsWithCharges}`);
    console.log(`     - Products không có charges:    ${products.length - totalProductsWithCharges}`);
    console.log(`     - Tổng charges đang gắn:        ${chargeIds.length} unique charges`);
    console.log('  ══════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  📖 ĐỌC TẤT CẢ CHARGES (KHOẢN PHÍ) TRONG FINERACT');
    console.log('══════════════════════════════════════════════════');

    const client = await createFineractClient();

    // 1. Đọc và hiển thị tất cả charges
    await listAllCharges(client);

    // 2. Kiểm tra charges trên từng loan product
    await checkChargesOnProducts(client);

    console.log('\n✨ HOÀN TẤT!');
}

main().catch(err => {
    console.error('\n💥 Lỗi:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
