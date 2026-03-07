/**
 * Script: Đọc tất cả Loan Products từ Fineract → Tạo Fixed Deposit Products tương ứng
 * 
 * Chạy: npx ts-node scripts/setup-fd-products.ts
 * 
 * Cần cấu hình env vars (hoặc sửa trực tiếp bên dưới):
 *   FINERACT_API_URL, KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET
 */

import axios, { AxiosInstance } from 'axios';

// ═══════════════════════════════════════════════════
// CẤU HÌNH - sửa nếu cần
// ═══════════════════════════════════════════════════
const CONFIG = {
    fineractUrl: process.env.FINERACT_API_URL || 'http://localhost:8080/fineract-provider/api/v1',
    tenant: process.env.FINERACT_TENANT || 'default',

    // Keycloak auth
    keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:9000',
    keycloakRealm: process.env.KEYCLOAK_REALM || 'fineract',
    keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || 'community-app',
    keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'real-client-secret-123',

    // Fineract credentials (used for Basic auth OR Keycloak Password grant)
    username: process.env.FINERACT_USERNAME || 'mifos',
    password: process.env.FINERACT_PASSWORD || 'password',

    // Chế độ auth: mặc định dùng 'keycloak' theo project
    authMode: (process.env.FINERACT_AUTH_MODE || 'keycloak') as 'keycloak' | 'basic',
};

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

async function getKeycloakToken(): Promise<string> {
    const tokenUrl = `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakRealm}/protocol/openid-connect/token`;

    // Project sử dụng password grant cho service-to-service
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
            console.log(`🔐 Đang lấy token từ Keycloak (${CONFIG.keycloakUrl})...`);
            const token = await getKeycloakToken();
            headers['Authorization'] = `Bearer ${token}`;
            console.log('✅ Keycloak token obtained.');
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

function formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
}

// ═══════════════════════════════════════════════════
// MAIN LOGIC
// ═══════════════════════════════════════════════════

interface LoanProduct {
    id: number;
    name: string;
    shortName: string;
    currency: { code: string; decimalPlaces: number; inMultiplesOf: number };
    minPrincipal?: number;
    maxPrincipal?: number;
    principal?: number;
    interestRatePerPeriod: number;
    annualInterestRate: number;
    interestRateFrequencyType?: { id: number; value: string };
    minNumberOfRepayments?: number;
    maxNumberOfRepayments?: number;
    numberOfRepayments?: number;
}

async function getLoanProducts(client: AxiosInstance): Promise<LoanProduct[]> {
    console.log('\n📋 Đang lấy danh sách Loan Products từ Fineract...');
    const res = await client.get('/loanproducts');
    const products: LoanProduct[] = res.data;

    // Lọc sản phẩm P2P (shortName bắt đầu bằng 'P')
    const p2pProducts = products.filter(
        (p) => (p.shortName || '').trim().toUpperCase().startsWith('P'),
    );

    console.log(`  Tìm thấy ${products.length} loan products, ${p2pProducts.length} P2P products:`);
    for (const p of p2pProducts) {
        console.log(`  - [${p.shortName}] ${p.name} (ID: ${p.id}, rate: ${p.annualInterestRate}%/năm)`);
    }
    return p2pProducts;
}

async function getExistingFDProducts(client: AxiosInstance): Promise<Map<string, any>> {
    console.log('\n📋 Đang lấy danh sách Fixed Deposit Products hiện có...');
    const res = await client.get('/fixeddepositproducts');
    const products: any[] = res.data;

    const map = new Map<string, any>();
    for (const p of products) {
        map.set(p.shortName?.toUpperCase(), p);
        console.log(`  - [${p.shortName}] ${p.name} (ID: ${p.id})`);
    }
    if (map.size === 0) {
        console.log('  (Chưa có FD product nào)');
    }
    return map;
}

async function getFullLoanProductDetails(client: AxiosInstance, productId: number): Promise<any> {
    const res = await client.get(`/loanproducts/${productId}`);
    return res.data;
}

function buildFDProductPayload(loanProduct: LoanProduct, loanDetails: any) {
    const shortName = loanProduct.shortName.trim().toUpperCase();
    const currency = loanProduct.currency || { code: 'VND', decimalPlaces: 0, inMultiplesOf: 1000 };
    const inMultiplesOf = currency.inMultiplesOf || 1000;

    // Lãi suất: lấy từ loan product
    // Fineract FD dùng annual nominal rate
    const annualRate = loanProduct.annualInterestRate || (loanProduct.interestRatePerPeriod * 12);

    // Kỳ hạn: lấy từ loan product config
    const minRepayments = loanDetails?.minNumberOfRepayments || loanProduct.minNumberOfRepayments || 1;
    const maxRepayments = loanDetails?.maxNumberOfRepayments || loanProduct.maxNumberOfRepayments || 24;
    const defaultRepayments = loanDetails?.numberOfRepayments || loanProduct.numberOfRepayments || minRepayments;

    // Min/Max deposit amount
    const minDeposit = loanDetails?.minPrincipal || loanProduct.minPrincipal || 1000;
    const maxDeposit = loanDetails?.maxPrincipal || loanProduct.maxPrincipal || 100_000_000;
    const defaultDeposit = loanDetails?.principal || loanProduct.principal || 1_000_000;

    // Chart dates
    const today = new Date();
    const endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 10);

    // ═══════════════════════════════════════════════════
    // UNBOUNDED RANGE STRATEGY (Căn cứ code Java Fineract):
    // Fineract yêu cầu Slab cuối cùng PHẢI có toPeriod = null và amountRangeTo = null.
    // isNotProperPriodEnd() returns true if (toPeriod != null || amountRangeTo != null)
    // ═══════════════════════════════════════════════════
    const MIN_DEPOSIT_BOUND = 1;
    const MAX_DEPOSIT_BOUND = 1_000_000_000_000; // 1 trillion
    const MIN_TERM_BOUND = 1;
    const MAX_TERM_BOUND = 120; // 10 years

    const chart = {
        name: `Đầu tư ${loanProduct.name}`,
        description: `Lãi suất đầu tư cho sản phẩm ${loanProduct.name}`,
        fromDate: formatDate(today),
        endDate: formatDate(endDate),
        isPrimaryGroupingByAmount: false,
        dateFormat: 'yyyy-MM-dd',
        locale: 'vi',
        chartSlabs: [
            {
                description: `Đầu tư ${shortName} (Unbounded)`,
                periodType: 2,            // Months
                fromPeriod: MIN_TERM_BOUND,            // Bắt đầu từ 1 tháng
                amountRangeFrom: MIN_DEPOSIT_BOUND,       // Bắt đầu từ 1 VND
                // KHÔNG set toPeriod và amountRangeTo để Fineract hiểu là Unbounded (infinity)
                annualInterestRate: annualRate,
                locale: 'vi',
            },
        ],
    };

    return {
        name: `Đầu tư ${loanProduct.name}`,
        shortName: shortName,
        description: `Sản phẩm tiết kiệm đầu tư tương ứng với sản phẩm vay ${loanProduct.name} (${shortName})`,
        currencyCode: currency.code || 'VND',
        digitsAfterDecimal: currency.decimalPlaces ?? 0,
        inMultiplesOf: inMultiplesOf,
        locale: 'vi',

        // Deposit config - Dùng Universal Range
        depositAmount: defaultDeposit,
        minDepositAmount: MIN_DEPOSIT_BOUND,
        maxDepositAmount: MAX_DEPOSIT_BOUND,

        // Term config (months) - Dùng Universal Range
        minDepositTerm: MIN_TERM_BOUND,
        minDepositTermTypeId: 2,     // Months
        maxDepositTerm: MAX_TERM_BOUND,
        maxDepositTermTypeId: 2,     // Months
        inMultiplesOfDepositTerm: 1,
        inMultiplesOfDepositTermTypeId: 2,

        // Interest config
        interestCompoundingPeriodType: 4,   // Monthly
        interestPostingPeriodType: 4,       // Monthly
        interestCalculationType: 1,         // Daily balance
        interestCalculationDaysInYearType: 365,

        // Lock-in: 1 tháng
        lockinPeriodFrequency: 1,
        lockinPeriodFrequencyType: 2,       // Months

        // Pre-closure: không phạt
        preClosurePenalApplicable: false,

        // Accounting: none
        accountingRule: 1,

        // Charges: none
        charges: [],

        // Withhold tax: no
        withHoldTax: false,

        // Charts (interest rate slabs)
        charts: [chart],
    };
}

async function createFDProduct(client: AxiosInstance, payload: any): Promise<any> {
    const res = await client.post('/fixeddepositproducts', payload);
    return res.data;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  Setup Fixed Deposit Products for P2P Investment');
    console.log('══════════════════════════════════════════════════');
    console.log(`  Fineract URL: ${CONFIG.fineractUrl}`);
    console.log(`  Auth mode: ${CONFIG.authMode}`);

    const client = await createFineractClient();

    // 1. Lấy loan products
    const loanProducts = await getLoanProducts(client);

    if (loanProducts.length === 0) {
        console.log('\n❌ Không tìm thấy Loan Product P2P nào!');
        return;
    }

    // 2. Lấy existing FD products
    const existingFD = await getExistingFDProducts(client);

    // 3. Tạo FD product cho mỗi Loan Product chưa có
    let created = 0;
    let skipped = 0;

    for (const lp of loanProducts) {
        const shortName = lp.shortName.trim().toUpperCase();

        if (existingFD.has(shortName)) {
            console.log(`\n⏭️  [${shortName}] "${lp.name}" → Đã có FD product (ID: ${existingFD.get(shortName).id}). Bỏ qua.`);
            skipped++;
            continue;
        }

        console.log(`\n🔨 [${shortName}] "${lp.name}" → Đang tạo FD product...`);

        // Lấy full details
        const details = await getFullLoanProductDetails(client, lp.id);

        // Build payload
        const payload = buildFDProductPayload(lp, details);

        console.log(`  📝 FD Product config:`);
        console.log(`     Name: ${payload.name}`);
        console.log(`     ShortName: ${payload.shortName}`);
        console.log(`     Deposit: ${payload.minDepositAmount.toLocaleString()} - ${payload.maxDepositAmount.toLocaleString()} VND`);
        console.log(`     Term: ${payload.minDepositTerm} - ${payload.maxDepositTerm} tháng`);
        console.log(`     Rate: ${payload.charts[0].chartSlabs[0].annualInterestRate}%/năm`);

        try {
            const result = await createFDProduct(client, payload);
            console.log(`  ✅ Tạo thành công! FD Product ID: ${result.resourceId}`);
            created++;
        } catch (err: any) {
            const errData = err.response?.data;
            console.error(`  ❌ Tạo thất bại!`);
            if (errData) {
                console.error(`     Error: ${errData.defaultUserMessage || errData.developerMessage}`);
                if (errData.errors) {
                    for (const e of errData.errors) {
                        console.error(`     Detail: ${e.defaultUserMessage || e.developerMessage}`);
                        if (e.args) console.error(`     Args: ${JSON.stringify(e.args)}`);
                    }
                }
            } else {
                console.error(`     ${err.message}`);
            }
        }
    }

    // 4. Summary
    console.log('\n══════════════════════════════════════════════════');
    console.log(`  KẾT QUẢ: Tạo ${created}, Bỏ qua ${skipped}, Tổng ${loanProducts.length}`);
    console.log('══════════════════════════════════════════════════');

    // 5. Verify: list lại
    console.log('\n📋 Danh sách FD Products sau khi setup:');
    const finalFD = await getExistingFDProducts(client);
    console.log(`\n  Tổng: ${finalFD.size} FD products`);

    // 6. Product mapping table
    console.log('\n═══ PRODUCT MAPPING TABLE ═══');
    console.log('  Loan Product            │ ShortName │ FD Product ID');
    console.log('  ────────────────────────┼───────────┼──────────────');
    for (const lp of loanProducts) {
        const sn = lp.shortName.trim().toUpperCase();
        const fd = finalFD.get(sn);
        const fdId = fd ? `${fd.id}` : '❌ MISSING';
        console.log(`  ${lp.name.padEnd(24)}│ ${sn.padEnd(9)} │ ${fdId}`);
    }
}

main().catch((err) => {
    console.error('\n💥 Fatal error:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
