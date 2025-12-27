/**
 * Script to ADD Chart to Product 3 (which has 0 charts)
 */

import axios from 'axios';

const FINERACT_BASE_URL = 'http://118.69.41.95:8080';
const FINERACT_TENANT_ID = 'default';
const FD_PRODUCT_ID = 3;
const KEYCLOAK_TOKEN_URL = 'http://118.69.41.95:9000/realms/fineract/protocol/openid-connect/token';

async function getAccessToken(): Promise<string> {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'password');
    formData.append('client_id', 'community-app');
    formData.append('username', 'mifos');
    formData.append('password', 'password');

    const response = await axios.post(KEYCLOAK_TOKEN_URL, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data.access_token;
}

async function addChartToProduct() {
    console.log('🔧 Adding Interest Rate Chart to Product 3...\n');

    const token = await getAccessToken();
    console.log('1. ✅ Token obtained\n');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Fineract-Platform-TenantId': FINERACT_TENANT_ID,
        'Content-Type': 'application/json',
    };

    // Get current product first
    console.log('2. Getting current Product 3 details...');
    const productUrl = `${FINERACT_BASE_URL}/fineract-provider/api/v1/fixeddepositproducts/${FD_PRODUCT_ID}`;
    const current = await axios.get(productUrl, { headers });
    console.log(`   Name: ${current.data.name}`);
    console.log(`   Charts: ${current.data.charts?.length || 0}`);
    console.log(`   Min term: ${current.data.minDepositTerm} months`);
    console.log(`   Max term: ${current.data.maxDepositTerm} months\n`);

    // Try adding chart with simpler format - ONLY period, NO amount range
    console.log('3. Adding chart via PUT...');

    // Try different date formats
    const chartPayloads = [
        {
            name: 'Attempt 1: yyyy-MM-dd format',
            payload: {
                locale: 'en',
                charts: [{
                    name: 'P2P Rate Chart',
                    description: 'Interest Rate Chart',
                    fromDate: '2025-01-01',
                    dateFormat: 'yyyy-MM-dd',
                    locale: 'en',
                    isPrimaryGroupingByAmount: false,
                    chartSlabs: [{
                        periodType: 2,
                        fromPeriod: 1,
                        toPeriod: 60,
                        annualInterestRate: 10
                    }]
                }]
            }
        },
        {
            name: 'Attempt 2: dd MMMM yyyy format',
            payload: {
                locale: 'en',
                charts: [{
                    name: 'P2P Rate Chart',
                    fromDate: '01 January 2025',
                    dateFormat: 'dd MMMM yyyy',
                    locale: 'en',
                    isPrimaryGroupingByAmount: false,
                    chartSlabs: [{
                        periodType: 2,
                        fromPeriod: 1,
                        toPeriod: 60,
                        annualInterestRate: 10
                    }]
                }]
            }
        },
        {
            name: 'Attempt 3: With endDate',
            payload: {
                locale: 'en',
                charts: [{
                    name: 'P2P Rate Chart',
                    fromDate: '2025-01-01',
                    endDate: '2030-12-31',
                    dateFormat: 'yyyy-MM-dd',
                    locale: 'en',
                    isPrimaryGroupingByAmount: false,
                    chartSlabs: [{
                        periodType: 2,
                        fromPeriod: 1,
                        toPeriod: 60,
                        annualInterestRate: 10
                    }]
                }]
            }
        }
    ];

    for (const attempt of chartPayloads) {
        console.log(`\n   ${attempt.name}...`);
        try {
            await axios.put(productUrl, attempt.payload, { headers });
            console.log('   ✅ SUCCESS!');

            // Verify
            const v = await axios.get(productUrl, { headers });
            console.log(`   Charts now: ${v.data.charts?.length || 0}`);
            if (v.data.charts?.length > 0) {
                console.log(`   Rate: ${v.data.charts[0].chartSlabs?.[0]?.annualInterestRate}%`);
            }

            console.log('\n🎯 CHART ADDED! Test investment flow now.');
            return;
        } catch (error: any) {
            const e = error.response?.data;
            if (e?.errors) {
                e.errors.forEach((err: any) => console.log(`   ❌ ${err.defaultUserMessage}`));
            } else {
                console.log(`   ❌ ${JSON.stringify(e || error.message).substring(0, 100)}`);
            }
        }
    }

    console.log('\n⚠️ All attempts failed. Need to check Fineract UI or database directly.');
}

addChartToProduct().catch(console.error);
