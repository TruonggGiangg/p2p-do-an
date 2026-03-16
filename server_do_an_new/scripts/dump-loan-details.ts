/**
 * Script: Dump full JSON chi tiết tất cả Loan Products từ Fineract
 * Chạy: npx ts-node scripts/dump-loan-details.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG = {
  fineractUrl: process.env.FINERACT_API_URL || 'http://localhost:8080/fineract-provider/api/v1',
  tenant: process.env.FINERACT_TENANT || 'default',
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:9000',
  keycloakRealm: process.env.KEYCLOAK_REALM || 'fineract',
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || 'community-app',
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'real-client-secret-123',
  username: process.env.FINERACT_USERNAME || 'mifos',
  password: process.env.FINERACT_PASSWORD || 'password',
  authMode: (process.env.FINERACT_AUTH_MODE || 'keycloak') as 'keycloak' | 'basic',
};

async function getKeycloakToken(): Promise<string | null> {
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
  } catch {
    return null;
  }
}

async function main() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Fineract-Platform-TenantId': CONFIG.tenant,
  };

  const token = await getKeycloakToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    const basic = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
    headers['Authorization'] = `Basic ${basic}`;
  }

  const client = axios.create({ baseURL: CONFIG.fineractUrl, headers });

  const list = await client.get('/loanproducts');
  const allDetails: any[] = [];

  for (const p of list.data) {
    const detail = await client.get(`/loanproducts/${p.id}`);
    allDetails.push(detail.data);
  }

  const outPath = path.join(__dirname, '..', 'loan-products-full.json');
  fs.writeFileSync(outPath, JSON.stringify(allDetails, null, 2), 'utf8');
  console.log(`Done: ${allDetails.length} products written to ${outPath}`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
