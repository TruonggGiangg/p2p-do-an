/**
 * Script: CẬP NHẬT quản lý quá hạn (Delinquency Management)
 *
 * Cập nhật cấu hình hiện có trong Fineract sang 5 nhóm mới:
 * - Nhóm 1 – Nợ đủ tiêu chuẩn: Dưới 10 ngày (1-9)
 * - Nhóm 2 – Nợ cần chú ý: 10-29 ngày
 * - Nhóm 3 – Nợ dưới tiêu chuẩn: 30-89 ngày
 * - Nhóm 4 – Nợ nghi ngờ: 90-179 ngày
 * - Nhóm 5 – Nợ có khả năng mất vốn: 180+ ngày
 *
 * Chạy: npx ts-node scripts/update-overdue-management.ts
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
// CẤU HÌNH 5 NHÓM MỚI
// ═══════════════════════════════════════════════════
const NEW_RANGES = [
    {
        classification: 'Nhóm 1 – Nợ đủ tiêu chuẩn',
        minimumAgeDays: 1,
        maximumAgeDays: 9,
        description: 'Dưới 10 ngày - Thông báo SMS, email...',
    },
    {
        classification: 'Nhóm 2 – Nợ cần chú ý',
        minimumAgeDays: 10,
        maximumAgeDays: 29,
        description: '10-29 ngày - Lưu DB nợ xấu, chấm điểm tín dụng',
    },
    {
        classification: 'Nhóm 3 – Nợ dưới tiêu chuẩn',
        minimumAgeDays: 30,
        maximumAgeDays: 89,
        description: '30-89 ngày - Cấm cho vay, lãi phạt 150%',
    },
    {
        classification: 'Nhóm 4 – Nợ nghi ngờ',
        minimumAgeDays: 90,
        maximumAgeDays: 179,
        description: '90-179 ngày - Thu hồi nợ, báo CIC',
    },
    {
        classification: 'Nhóm 5 – Nợ có khả năng mất vốn',
        minimumAgeDays: 180,
        maximumAgeDays: null as number | null,
        description: '180+ ngày - Cấm vĩnh viễn, có thể kiện',
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
// UPDATE LOGIC
// ═══════════════════════════════════════════════════

async function updateDelinquencyRanges(client: AxiosInstance): Promise<number[]> {
    console.log('\n🔨 Bước 1: Cập nhật Delinquency Ranges sang 5 nhóm mới...');

    const bucketName = 'Chính sách quản lý quá hạn P2P';

    // Lấy bucket hiện có
    const bucketsRes = await client.get('/delinquency/buckets');
    const buckets: any[] = bucketsRes.data || [];
    const bucket = buckets.find((b: any) => b.name === bucketName);

    if (!bucket) {
        throw new Error(`Không tìm thấy bucket "${bucketName}". Chạy setup-overdue-management.ts trước.`);
    }

    // Lấy chi tiết bucket để có đầy đủ ranges (list API có thể không trả về)
    const detailRes = await client.get(`/delinquency/buckets/${bucket.id}`);
    const ranges: any[] = detailRes.data?.ranges || bucket.ranges || [];
    if (ranges.length < 4) {
        throw new Error(
            `Bucket có ${ranges.length} ranges, cần ít nhất 4. Cấu hình hiện tại không khớp.`
        );
    }

    // Sắp xếp theo minimumAgeDays (thứ tự: 1, 31, 61, 91...)
    const sortedRanges = [...ranges].sort(
        (a: any, b: any) => (a.minimumAgeDays ?? 0) - (b.minimumAgeDays ?? 0)
    );

    const rangeIds: number[] = [];
    const hasGroup5 = sortedRanges.some(
        (r: any) => r.minimumAgeDays === 180 && (r.classification || '').includes('Nhóm 5')
    );

    // Cập nhật 4 ranges hiện có (hoặc cả 5 nếu đã có Nhóm 5 từ lần chạy trước)
    const rangesToUpdate = hasGroup5 ? 5 : 4;
    for (let i = 0; i < rangesToUpdate; i++) {
        const existing = sortedRanges[i];
        const target = NEW_RANGES[i];
        console.log(
            `  📝 Cập nhật Range ${i + 1}: "${existing.classification}" → "${target.classification}" (${target.minimumAgeDays}-${target.maximumAgeDays ?? '∞'} ngày)...`
        );

        await client.put(`/delinquency/ranges/${existing.id}`, {
            classification: target.classification,
            minimumAgeDays: target.minimumAgeDays,
            maximumAgeDays: target.maximumAgeDays,
            locale: 'vi',
        });

        console.log(`      Đã cập nhật (ID: ${existing.id})`);
        rangeIds.push(existing.id);
    }

    // Tạo range mới Nhóm 5 (180+) nếu chưa có
    if (!hasGroup5) {
        const target5 = NEW_RANGES[4];
        console.log(`  ➕ Tạo Range mới: "${target5.classification}" (${target5.minimumAgeDays}+ ngày)...`);

        const createRes = await client.post('/delinquency/ranges', {
            classification: target5.classification,
            minimumAgeDays: target5.minimumAgeDays,
            maximumAgeDays: target5.maximumAgeDays,
            locale: 'vi',
        });

        const newRangeId = createRes.data.resourceId;
        rangeIds.push(newRangeId);
        console.log(`      Tạo thành công (ID: ${newRangeId})`);
    }

    return rangeIds;
}

async function updateDelinquencyBucket(client: AxiosInstance, rangeIds: number[]) {
    console.log('\n🔨 Bước 2: Cập nhật Bucket với danh sách ranges mới...');

    const bucketName = 'Chính sách quản lý quá hạn P2P';
    const bucketsRes = await client.get('/delinquency/buckets');
    const buckets: any[] = bucketsRes.data || [];
    const bucket = buckets.find((b: any) => b.name === bucketName);

    if (!bucket) {
        throw new Error(`Không tìm thấy bucket "${bucketName}".`);
    }

    await client.put(`/delinquency/buckets/${bucket.id}`, {
        name: bucketName,
        ranges: rangeIds,
        locale: 'vi',
    });

    console.log(`   Bucket "${bucketName}" (ID: ${bucket.id}) đã được cập nhật với 5 ranges.`);
    return bucket.id;
}

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('  CẬP NHẬT QUẢN LÝ QUÁ HẠN (5 NHÓM MỚI)');
    console.log('══════════════════════════════════════════════════');
    console.log('\nCấu hình mới:');
    NEW_RANGES.forEach((r, i) => {
        const rangeStr = r.maximumAgeDays != null ? `${r.minimumAgeDays}-${r.maximumAgeDays}` : `${r.minimumAgeDays}+`;
        console.log(`  ${i + 1}. ${r.classification}: ${rangeStr} ngày`);
    });

    const client = await createFineractClient();

    // 1. Cập nhật 4 ranges + tạo range Nhóm 5
    const rangeIds = await updateDelinquencyRanges(client);

    // 2. Cập nhật bucket với danh sách ranges mới
    await updateDelinquencyBucket(client, rangeIds);

    console.log('\n✨ CẬP NHẬT HOÀN TẤT!');
    console.log('   Kiểm tra tại: http://localhost:4200/#/products/delinquency-bucket-configurations/buckets');
}

main().catch((err) => {
    console.error('\n💥 Lỗi Fatal:', err.message);
    if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
