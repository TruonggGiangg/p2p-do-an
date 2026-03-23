/**
 * Script: Sửa charge "Phí tất toán sớm"
 *
 * Vấn đề: Charge hiện tại có chargeTimeType=1 (Disbursement) → phí bị tính lúc giải ngân
 * Sửa thành: chargeTimeType=2 (Specified Due Date) + penalty=true
 *            → Charge sẽ được add thủ công vào loan khi borrower tất toán sớm
 *
 * Luồng:
 *   1. Gỡ charge "Phí tất toán sớm" (ID 12) khỏi tất cả loan products
 *   2. Xóa charge cũ
 *   3. Tạo charge mới với chargeTimeType=2, penalty=true
 *   4. KHÔNG gắn vào product (sẽ add thủ công qua backend)
 *   5. Verify kết quả
 *
 * Chạy: npx ts-node scripts/fix-prepayment-charge.ts
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

const OLD_CHARGE_NAME = 'Phí tất toán sớm';

// Charge mới: Specified Due Date + Penalty
const NEW_PREPAYMENT_CHARGE = {
    name: 'Phí phạt tất toán sớm',
    currencyCode: 'VND',
    chargeAppliesTo: 1,         // 1 = Loan
    chargeTimeType: 2,          // 2 = Specified Due Date (add thủ công vào loan)
    chargeCalculationType: 2,   // 2 = % of Amount (% trên gốc vay)
    chargePaymentMode: 0,       // 0 = Regular
    amount: 3,                  // 3%
    penalty: true,              // ← Đánh dấu là PENALTY
    active: true,
    locale: 'vi',
    monthDayFormat: 'dd MMM',
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
// STEP 1: Gỡ charge cũ khỏi tất cả loan products
// ═══════════════════════════════════════════════════

async function removeOldChargeFromProducts(client: AxiosInstance) {
    console.log('\n🔨 Bước 1: Gỡ charge "Phí tất toán sớm" khỏi tất cả loan products...');

    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    for (const p of products) {
        const detailRes = await client.get(`/loanproducts/${p.id}`);
        const details = detailRes.data;
        const currentCharges: any[] = details.charges || [];

        // Tìm charge cũ cần gỡ
        const oldCharge = currentCharges.find((c: any) => c.name === OLD_CHARGE_NAME);
        if (!oldCharge) {
            console.log(`   ✅ "${p.name}" — không có charge "${OLD_CHARGE_NAME}"`);
            continue;
        }

        // Giữ lại các charge khác, bỏ charge cũ
        const remainingCharges = currentCharges
            .filter((c: any) => c.name !== OLD_CHARGE_NAME)
            .map((c: any) => ({ id: c.id }));

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
            daysInMonthType: details.daysInMonthType?.id || 30,
            accountingRule: details.accountingRule.id,
            charges: remainingCharges,
        };

        // Giữ nguyên Interest Recalculation nếu đã bật
        if (details.isInterestRecalculationEnabled) {
            updatePayload.isInterestRecalculationEnabled = true;
            const reCalcData = details.interestRecalculationData;
            updatePayload.interestRecalculationCompoundingMethod = reCalcData.interestRecalculationCompoundingType.id;
            updatePayload.rescheduleStrategyMethod = reCalcData.rescheduleStrategyType.id;
            updatePayload.recalculationRestFrequencyType = reCalcData.recalculationRestFrequencyType.id;
            updatePayload.recalculationRestFrequencyInterval = reCalcData.recalculationRestFrequencyInterval;
            updatePayload.preClosureInterestCalculationStrategy = reCalcData.preClosureInterestCalculationStrategy.id;
            updatePayload.isArrearsBasedOnOriginalSchedule = reCalcData.isArrearsBasedOnOriginalSchedule;
        }

        if (details.minPrincipal) updatePayload.minPrincipal = details.minPrincipal;
        if (details.maxPrincipal) updatePayload.maxPrincipal = details.maxPrincipal;
        if (details.minNumberOfRepayments) updatePayload.minNumberOfRepayments = details.minNumberOfRepayments;
        if (details.maxNumberOfRepayments) updatePayload.maxNumberOfRepayments = details.maxNumberOfRepayments;

        try {
            await client.put(`/loanproducts/${p.id}`, updatePayload);
            console.log(`   ✅ Đã gỡ "${OLD_CHARGE_NAME}" khỏi "${p.name}" (giữ ${remainingCharges.length} charges khác)`);
        } catch (err: any) {
            console.error(`   ❌ Lỗi khi update "${p.name}": ${err.message}`);
            if (err.response?.data) {
                console.error(`      Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════
// STEP 2: Xóa charge cũ
// ═══════════════════════════════════════════════════

async function deleteOldCharge(client: AxiosInstance) {
    console.log('\n🗑️  Bước 2: Xóa charge cũ...');

    const chargesRes = await client.get('/charges');
    const charges: any[] = chargesRes.data || [];

    const oldCharge = charges.find((c: any) => c.name === OLD_CHARGE_NAME);
    if (!oldCharge) {
        console.log(`   ⚠️  Không tìm thấy charge "${OLD_CHARGE_NAME}" để xóa.`);
        return;
    }

    try {
        await client.delete(`/charges/${oldCharge.id}`);
        console.log(`   ✅ Đã xóa charge "${OLD_CHARGE_NAME}" (ID: ${oldCharge.id})`);
    } catch (err: any) {
        console.error(`   ❌ Không thể xóa: ${err.message}`);
        if (err.response?.data) {
            console.error(`      Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
        }
    }
}

// ═══════════════════════════════════════════════════
// STEP 3: Tạo charge mới (Specified Due Date + Penalty)
// ═══════════════════════════════════════════════════

async function createNewPrepaymentCharge(client: AxiosInstance): Promise<number | null> {
    console.log('\n🔨 Bước 3: Tạo charge mới "Phí phạt tất toán sớm"...');
    console.log(`   - chargeTimeType: 2 (Specified Due Date)`);
    console.log(`   - chargeCalculationType: 2 (% of Amount)`);
    console.log(`   - amount: ${NEW_PREPAYMENT_CHARGE.amount}%`);
    console.log(`   - penalty: true`);
    console.log(`   → Charge KHÔNG gắn vào product, sẽ add thủ công khi borrower tất toán sớm`);

    try {
        const res = await client.post('/charges', NEW_PREPAYMENT_CHARGE);
        const chargeId = res.data.resourceId;
        console.log(`   ✅ Tạo thành công! ID: ${chargeId}`);
        return chargeId;
    } catch (err: any) {
        console.error(`   ❌ Lỗi tạo charge: ${err.message}`);
        if (err.response?.data) {
            console.error(`      Chi tiết: ${JSON.stringify(err.response.data.errors || err.response.data)}`);
        }
        return null;
    }
}

// ═══════════════════════════════════════════════════
// STEP 4: Verify
// ═══════════════════════════════════════════════════

async function verify(client: AxiosInstance) {
    console.log('\n🔍 Bước 4: Xác nhận kết quả...');

    // 4a. Danh sách charges
    console.log('\n  📋 Tất cả charges trong Fineract:');
    const chargesRes = await client.get('/charges');
    const charges: any[] = chargesRes.data || [];

    for (const c of charges) {
        const calcType = c.chargeCalculationType?.value || 'N/A';
        const timeType = c.chargeTimeType?.value || 'N/A';
        const isPenalty = c.penalty ? '⚠️  PENALTY' : '💰 FEE';
        const amount = [2, 3, 4, 5].includes(c.chargeCalculationType?.id)
            ? `${c.amount}%` : `${Number(c.amount).toLocaleString()} VND`;
        console.log(`  [ID: ${c.id}] ${c.name} | ${isPenalty} | ${calcType} = ${amount} | ${timeType}`);
    }

    // 4b. Charges trên products
    console.log('\n  📋 Charges trên từng Loan Product:');
    const productsRes = await client.get('/loanproducts');
    const products: any[] = productsRes.data || [];

    for (const p of products) {
        const detail = await client.get(`/loanproducts/${p.id}`);
        const productCharges: any[] = detail.data.charges || [];

        console.log(`\n  📦 ${p.name} (${p.shortName}, ID: ${p.id})`);
        if (productCharges.length === 0) {
            console.log(`     └── (Không có charges)`);
        } else {
            for (let i = 0; i < productCharges.length; i++) {
                const c = productCharges[i];
                const calcType = typeof c.chargeCalculationType === 'object' ? c.chargeCalculationType.value : c.chargeCalculationType;
                const isPenalty = c.penalty ? '⚠️  PENALTY' : '💰 FEE';
                const isLast = i === productCharges.length - 1;
                console.log(`     ${isLast ? '└──' : '├──'} [ID: ${c.id}] ${c.name} | ${isPenalty} | ${calcType}`);
            }
        }
    }

    // 4c. Kiểm tra charge mới KHÔNG ở trên product nào
    const newCharge = charges.find((c: any) => c.name === NEW_PREPAYMENT_CHARGE.name);
    if (newCharge) {
        let foundOnProduct = false;
        for (const p of products) {
            const detail = await client.get(`/loanproducts/${p.id}`);
            const pc: any[] = detail.data.charges || [];
            if (pc.find((c: any) => c.id === newCharge.id)) {
                foundOnProduct = true;
                console.log(`\n  ⚠️  "${newCharge.name}" vẫn gắn trên product "${p.name}"!`);
            }
        }
        if (!foundOnProduct) {
            console.log(`\n  ✅ "${newCharge.name}" KHÔNG gắn trên product nào (đúng — sẽ add thủ công per-loan)`);
        }
    }

    console.log('\n  ══════════════════════════════════════════════');
    console.log('  📊 TỔNG KẾT:');
    console.log(`     - Charges trong hệ thống: ${charges.length}`);
    console.log(`     - Charge mới "${NEW_PREPAYMENT_CHARGE.name}": ${newCharge ? `ID ${newCharge.id} ✅` : '❌ Không tìm thấy'}`);
    console.log('  ══════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  🔧 SỬA CHARGE "PHÍ TẤT TOÁN SỚM"');
    console.log('══════════════════════════════════════════════════');

    const client = await createFineractClient();

    // 1. Gỡ charge cũ khỏi products
    await removeOldChargeFromProducts(client);

    // 2. Xóa charge cũ
    await deleteOldCharge(client);

    // 3. Tạo charge mới
    const newChargeId = await createNewPrepaymentCharge(client);
    if (!newChargeId) {
        console.error('\n❌ Không tạo được charge mới. Dừng script.');
        process.exit(1);
    }

    // 4. Verify
    await verify(client);

    console.log('\n✨ HOÀN TẤT!');
    console.log('\n📝 Lưu ý: Charge mới "Phí phạt tất toán sớm" sẽ được add vào loan');
    console.log('   bởi backend khi borrower yêu cầu tất toán sớm.');
    console.log('   API: POST /loans/{loanId}/charges  body: { chargeId: ' + newChargeId + ', ... }');
}

main().catch(err => {
    console.error('\n💥 Lỗi Fatal:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
