import axios from 'axios';
import * as dotenv from 'dotenv';
import * as https from 'https';

// Load biến môi trường
dotenv.config();

const FINERACT_URL = process.env.FINERACT_API_URL || 'https://localhost:8080/fineract-provider/api/v1';
const FINERACT_TENANT = process.env.FINERACT_TENANT_IDENTIFIER || 'default';

// Tài khoản Keycloak
const FINERACT_ADMIN_USER = process.env.FINERACT_USERNAME || 'mifos';
const FINERACT_ADMIN_PASSWORD = process.env.FINERACT_PASSWORD || 'password';

// Endpoint Keycloak
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:9000';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'fineract';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'community-app';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || 'real-client-secret-123';

// Webhook config
// Khuyến nghị: Dùng ngrok để test local. VD: https://xxx.ngrok-free.app/api/webhooks/fineract
const WEBHOOK_PAYLOAD_URL = (process.env.WEBHOOK_PAYLOAD_URL || 'https://your-p2p-domain.com/api/webhooks/fineract').replace(/\/?$/, '/');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function getAdminToken() {
    try {
        console.log(`Đang lấy token Fineract Admin từ Keycloak (${KEYCLOAK_URL})...`);
        const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
        const params = new URLSearchParams();
        params.append('client_id', KEYCLOAK_CLIENT_ID);
        params.append('client_secret', KEYCLOAK_CLIENT_SECRET);
        params.append('username', FINERACT_ADMIN_USER);
        params.append('password', FINERACT_ADMIN_PASSWORD);
        params.append('grant_type', 'password');

        const response = await axios.post(tokenUrl, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log(' Lấy token thành công!');
        return response.data.access_token;
    } catch (error: any) {
        console.error('❌ Lỗi lấy token:', error?.response?.data || error.message);
        process.exit(1);
    }
}

async function setupWebhook() {
    console.log(`\n=== Bắt đầu thiết lập Webhook Fineract ===`);
    const token = await getAdminToken();

    const axiosInstance = axios.create({
        baseURL: FINERACT_URL,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Fineract-Platform-TenantId': FINERACT_TENANT,
            'Content-Type': 'application/json'
        },
        httpsAgent
    });

    try {
        console.log(`\n0. Lấy danh sách Hook Templates...`);
        const tmplRes = await axiosInstance.get('/hooks/template');
        console.log("Hook Templates:", JSON.stringify(tmplRes.data, null, 2));

        console.log(`\n1. Kiểm tra Webhook hiện tại...`);
        const hooksRes = await axiosInstance.get('/hooks');
        const existingHooks = hooksRes.data || [];

        const displayName = "P2P Overdue Webhook";
        const existingHook = existingHooks.find((h: any) => h.displayName === displayName);

        const payload = {
            name: "Web", // Fineract requires this to be exactly "Web" for templateId 1
            isActive: true,
            displayName: displayName,
            config: {
                "Payload URL": WEBHOOK_PAYLOAD_URL,
                "Content Type": "json" // Fineract supports 'json' or 'form'
            },
            events: [
                { entityName: "loan", actionName: "CREATE" },
                { entityName: "loan", actionName: "APPROVE" },
                { entityName: "loan", actionName: "DISBURSE" },
                { entityName: "loan", actionName: "REPAYMENT" },
                { entityName: "loan", actionName: "WAIVECHARGE" },
                { entityName: "loan", actionName: "CHARGEPAYMENT" },
                { entityName: "loan", actionName: "UPDATE" },
                { entityName: "loan", actionName: "RESCHEDULE" }
            ]
        };

        if (existingHook) {
            console.log(`♻️ Webhook "${displayName}" đã tồn tại (ID: ${existingHook.id}). Đang cập nhật...`);
            await axiosInstance.put(`/hooks/${existingHook.id}`, payload);
            console.log(` Cập nhật Webhook thành công!`);
        } else {
            console.log(`➕ Đang tạo mới Webhook "${displayName}"...`);
            await axiosInstance.post(`/hooks`, payload);
            console.log(` Tạo mới Webhook thành công!`);
        }

        console.log(`\n🔔 Payload URL đã được lưu là: ${WEBHOOK_PAYLOAD_URL}`);

    } catch (error: any) {
        console.error(`❌ Cấu hình Webhook thất bại:`, error?.response?.data || error.message);
        if (error?.response?.data?.errors) {
            console.error(JSON.stringify(error.response.data.errors, null, 2));
        }
    }
}

setupWebhook().then(() => console.log('\n=== Hoàn tất script ==='));
