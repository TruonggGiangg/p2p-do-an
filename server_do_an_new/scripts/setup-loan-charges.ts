/**
 * Script: Thiết lập các khoản phí (Charges) cho Loan Products
 *
 * Luồng xử lý:
 *   1. Gỡ tất cả charges khỏi loan products
 *   2. Xóa tất cả charges cũ trong Fineract
 *   3. Tạo 3 charges mới: Phí trễ hạn, Phí tất toán sớm, Phí quản lý
 *   4. Áp dụng charges cho loan products có shortName bắt đầu bằng "P"
 *   5. GET lại để verify kết quả
 *
 * Chạy: npx ts-node scripts/setup-loan-charges.ts
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

// Định nghĩa các charges cần tạo
const CHARGES_TO_CREATE = [
    {
        name: 'Phí trễ hạn',
        currencyCode: 'VND',
        chargeAppliesTo: 1,         // 1 = Loan
        chargeTimeType: 9,          // 9 = Overdue Fees
        chargeCalculationType: 2,   // 2 = % of Amount
        chargePaymentMode: 0,       // 0 = Regular
        amount: 2,                  // 2%
        penalty: true,
        active: true,
        locale: 'vi',
        monthDayFormat: 'dd MMM',
    },
    {
        name: 'Phí tất toán sớm',
        currencyCode: 'VND',
        chargeAppliesTo: 1,         // 1 = Loan
        chargeTimeType: 1,          // 1 = Disbursement
        chargeCalculationType: 2,   // 2 = % of Amount
        chargePaymentMode: 0,       // 0 = Regular
        amount: 3,                  // 3% trên gốc vay
        penalty: false,
        active: true,
        locale: 'vi',
        monthDayFormat: 'dd MMM',
    },
    {
        name: 'Phí quản lý khoản vay',
        currencyCode: 'VND',
        chargeAppliesTo: 1,         // 1 = Loan
        chargeTimeType: 1,          // 1 = Disbursement
        chargeCalculationType: 1,   // 1 = Flat
        chargePaymentMode: 0,       // 0 = Regular
        amount: 50000,              // 50,000 VND
        penalty: false,
        active: true,
        locale: 'vi',
        monthDayFormat: 'dd MMM',
    },
];

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
// STEP 1: Gỡ charges khỏi loan products
// ═══════════════════════════════════════════════════

async function removeChargesFromAllProducts(client: AxiosInstance) {
    console.log('\n🔨 Bước 1: Gỡ tất cả charges khỏi loan products...');

    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    for (const p of products) {
        const detailRes = await client.get(`/loanproducts/${p.id}`);
        const details = detailRes.data;

        if (details.charges && details.charges.length > 0) {
            console.log(`  ⚙️ Gỡ ${details.charges.length} charges khỏi "${p.name}" (ID: ${p.id})...`);

            const updatePayload: any = {
                locale: 'vi',
                dateFormat: 'yyyy-MM-dd',
                currencyCode: details.currency.code,
                digitsAfterDecimal: details.currency.decimalPlaces,
                inMultiplesOf: details.currency.inMultiplesOf,
                principal: details.principal,
                numberOfRepayments: details.numberOfRepayments,
                repaymentEvery: details.repaymentEvery,
                repaymentFrequencyType: details.repaymentFrequencyType.id,
                interestRatePerPeriod: details.interestRatePerPeriod,
                interestRateFrequencyType: details.interestRateFrequencyType.id,
                amortizationType: details.amortizationType.id,
                interestType: details.interestType.id,
                interestCalculationPeriodType: details.interestCalculationPeriodType.id,
                transactionProcessingStrategyCode: details.transactionProcessingStrategyCode || 'mifos-standard-strategy',
                daysInYearType: details.daysInYearType?.id || 365,
                daysInMonthType: details.daysInMonthType?.id || 1,
                accountingRule: details.accountingRule.id,
                charges: [], // <-- Xóa hết charges
            };

            if (details.minPrincipal) updatePayload.minPrincipal = details.minPrincipal;
            if (details.maxPrincipal) updatePayload.maxPrincipal = details.maxPrincipal;
            if (details.minNumberOfRepayments) updatePayload.minNumberOfRepayments = details.minNumberOfRepayments;
            if (details.maxNumberOfRepayments) updatePayload.maxNumberOfRepayments = details.maxNumberOfRepayments;

            try {
                await client.put(`/loanproducts/${p.id}`, updatePayload);
                console.log(`      Đã gỡ charges khỏi "${p.name}"`);
            } catch (err: any) {
                console.error(`     ❌ Lỗi khi gỡ charges từ "${p.name}": ${err.message}`);
                if (err.response?.data) {
                    console.error(`        Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
                }
            }
        } else {
            console.log(`   "${p.name}" không có charges nào.`);
        }
    }
}

// ═══════════════════════════════════════════════════
// STEP 2: Xóa tất cả charges cũ
// ═══════════════════════════════════════════════════

async function deleteAllCharges(client: AxiosInstance) {
    console.log('\n🗑️  Bước 2: Xóa tất cả charges cũ trong Fineract...');

    const chargesRes = await client.get('/charges');
    const charges: any[] = chargesRes.data || [];

    if (charges.length === 0) {
        console.log('   Không có charges cũ nào.');
        return;
    }

    console.log(`  Tìm thấy ${charges.length} charges cần xóa:`);

    for (const c of charges) {
        try {
            await client.delete(`/charges/${c.id}`);
            console.log(`  🗑️  Đã xóa: "${c.name}" (ID: ${c.id})`);
        } catch (err: any) {
            console.error(`  ❌ Không thể xóa "${c.name}" (ID: ${c.id}): ${err.message}`);
            if (err.response?.data) {
                console.error(`     Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════
// STEP 3: Tạo charges mới
// ═══════════════════════════════════════════════════

async function createNewCharges(client: AxiosInstance): Promise<number[]> {
    console.log('\n🔨 Bước 3: Tạo các charges mới...');

    const createdIds: number[] = [];

    for (const chargeDef of CHARGES_TO_CREATE) {
        try {
            const res = await client.post('/charges', chargeDef);
            const chargeId = res.data.resourceId;
            createdIds.push(chargeId);
            console.log(`   Tạo thành công: "${chargeDef.name}" (ID: ${chargeId})`);
            console.log(`     - Loại: ${chargeDef.penalty ? '⚠️  PENALTY' : '💰 FEE'}`);
            console.log(`     - Cách tính: ${[2, 3, 4, 5].includes(chargeDef.chargeCalculationType) ? chargeDef.amount + '%' : chargeDef.amount.toLocaleString() + ' VND'}`);
        } catch (err: any) {
            console.error(`  ❌ Lỗi tạo charge "${chargeDef.name}": ${err.message}`);
            if (err.response?.data) {
                console.error(`     Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
            }
        }
    }

    return createdIds;
}

// ═══════════════════════════════════════════════════
// STEP 4: Áp dụng charges cho loan products "P*"
// ═══════════════════════════════════════════════════

async function applyChargesToProducts(client: AxiosInstance, chargeIds: number[]) {
    console.log('\n🔨 Bước 4: Áp dụng charges cho loan products có shortName bắt đầu bằng "P"...');

    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    const targetProducts = products.filter((p: any) => p.shortName && p.shortName.startsWith('P'));

    if (targetProducts.length === 0) {
        console.log('  ❌ Không tìm thấy loan product nào có shortName bắt đầu bằng "P"');
        return;
    }

    console.log(`  Tìm thấy ${targetProducts.length} sản phẩm phù hợp:`);
    targetProducts.forEach((p: any) => console.log(`    - ${p.name} (${p.shortName}, ID: ${p.id})`));

    for (const p of targetProducts) {
        const detailRes = await client.get(`/loanproducts/${p.id}`);
        const details = detailRes.data;

        // Build charge references for the update
        const chargesPayload = chargeIds.map(id => ({ id }));

        const updatePayload: any = {
            locale: 'vi',
            dateFormat: 'yyyy-MM-dd',
            currencyCode: details.currency.code,
            digitsAfterDecimal: details.currency.decimalPlaces,
            inMultiplesOf: details.currency.inMultiplesOf,
            principal: details.principal,
            numberOfRepayments: details.numberOfRepayments,
            repaymentEvery: details.repaymentEvery,
            repaymentFrequencyType: details.repaymentFrequencyType.id,
            interestRatePerPeriod: details.interestRatePerPeriod,
            interestRateFrequencyType: details.interestRateFrequencyType.id,
            amortizationType: details.amortizationType.id,
            interestType: details.interestType.id,
            interestCalculationPeriodType: details.interestCalculationPeriodType.id,
            transactionProcessingStrategyCode: details.transactionProcessingStrategyCode || 'mifos-standard-strategy',
            daysInYearType: details.daysInYearType?.id || 365,
            daysInMonthType: details.daysInMonthType?.id || 1,
            accountingRule: details.accountingRule.id,
            charges: chargesPayload,
        };

        if (details.minPrincipal) updatePayload.minPrincipal = details.minPrincipal;
        if (details.maxPrincipal) updatePayload.maxPrincipal = details.maxPrincipal;
        if (details.minNumberOfRepayments) updatePayload.minNumberOfRepayments = details.minNumberOfRepayments;
        if (details.maxNumberOfRepayments) updatePayload.maxNumberOfRepayments = details.maxNumberOfRepayments;

        try {
            await client.put(`/loanproducts/${p.id}`, updatePayload);
            console.log(`   Đã áp dụng ${chargeIds.length} charges cho "${p.name}" (${p.shortName})`);
        } catch (err: any) {
            console.error(`  ❌ Lỗi áp dụng charges cho "${p.name}": ${err.message}`);
            if (err.response?.data) {
                console.error(`     Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════
// STEP 5: Verification - GET lại để kiểm tra
// ═══════════════════════════════════════════════════

async function verifyResults(client: AxiosInstance) {
    console.log('\n🔍 Bước 5: Xác nhận kết quả...');

    // 5a. Kiểm tra danh sách charges trong Fineract
    console.log('\n  📋 Danh sách charges trong Fineract:');
    const chargesRes = await client.get('/charges');
    const charges: any[] = chargesRes.data || [];

    if (charges.length === 0) {
        console.log('  ❌ Không tìm thấy charges nào!');
    } else {
        for (const c of charges) {
            const calcType = c.chargeCalculationType?.value || 'N/A';
            const timeType = c.chargeTimeType?.value || 'N/A';
            const isPenalty = c.penalty ? '⚠️  PENALTY' : '💰 FEE';
            console.log(`  [ID: ${c.id}] ${c.name} | ${isPenalty} | ${calcType} = ${c.amount} | Áp dụng: ${timeType}`);
        }
    }

    // 5b. Kiểm tra charges trên từng loan product
    console.log('\n  📋 Charges trên từng Loan Product:');
    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    for (const p of products) {
        const detailRes = await client.get(`/loanproducts/${p.id}`);
        const details = detailRes.data;
        const productCharges = details.charges || [];

        const marker = p.shortName?.startsWith('P') ? '🎯' : '  ';
        console.log(`\n  ${marker} ${p.name} (${p.shortName}, ID: ${p.id})`);

        if (productCharges.length === 0) {
            console.log(`     └── (Không có charges)`);
        } else {
            for (const c of productCharges) {
                const calcType = typeof c.chargeCalculationType === 'object'
                    ? c.chargeCalculationType.value
                    : c.chargeCalculationType;
                const timeType = typeof c.chargeTimeType === 'object'
                    ? c.chargeTimeType.value
                    : c.chargeTimeType;
                const isPenalty = c.penalty ? '⚠️  PENALTY' : '💰 FEE';
                console.log(`     ├── [ID: ${c.id}] ${c.name} | ${isPenalty} | ${calcType} = ${c.amount} | ${timeType}`);
            }
        }
    }

    // 5c. Summary
    const targetProducts = products.filter((p: any) => p.shortName?.startsWith('P'));
    console.log('\n  ──────────────────────────────────────');
    console.log(`  📊 Tổng kết:`);
    console.log(`     - Charges trong hệ thống: ${charges.length}`);
    console.log(`     - Products có shortName "P*": ${targetProducts.length}`);
    console.log(`     - Expected charges/product: ${CHARGES_TO_CREATE.length}`);
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  THIẾT LẬP PHÍ (CHARGES) CHO LOAN PRODUCTS');
    console.log('══════════════════════════════════════════════════');

    const client = await createFineractClient();

    // 1. Gỡ charges khỏi tất cả loan products
    await removeChargesFromAllProducts(client);

    // 2. Xóa tất cả charges cũ
    await deleteAllCharges(client);

    // 3. Tạo charges mới
    const chargeIds = await createNewCharges(client);

    if (chargeIds.length === 0) {
        console.error('\n❌ Không tạo được charges nào. Dừng script.');
        process.exit(1);
    }

    // 4. Áp dụng cho products "P*"
    await applyChargesToProducts(client, chargeIds);

    // 5. Verify
    await verifyResults(client);

    console.log('\n✨ HOÀN TẤT!');
}

main().catch(err => {
    console.error('\n💥 Lỗi Fatal:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
