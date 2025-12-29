/**
 * Check FD transactions for LOAN_168 to understand "Trả lãi FD" source
 */
import axios from 'axios';

const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';

async function getToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', 'community-app');
    params.append('client_secret', '123');
    params.append('username', 'mifos');
    params.append('password', 'password');

    const resp = await axios.post(
        `${KEYCLOAK_URL}/realms/fineract/protocol/openid-connect/token`,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return resp.data.access_token;
}

async function main() {
    const token = await getToken();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'fineract-platform-tenantid': 'default'
    };

    console.log('═══════════════════════════════════════\n');
    console.log('🔍 FD TRANSACTION ANALYSIS FOR LOAN_168');
    console.log('═══════════════════════════════════════\n');

    // Get FD account 115 (from screenshot FD 000000115)
    const fdId = 115;

    try {
        const fdResp = await axios.get(
            `${FINERACT_URL}/fineract-provider/api/v1/fixeddepositaccounts/${fdId}?associations=all`,
            { headers }
        );
        const fd = fdResp.data;

        console.log('FD Account:', fd.accountNo);
        console.log('External ID:', fd.externalId);
        console.log('Status:', fd.status?.value);
        console.log('Deposit Amount:', fd.depositAmount);
        console.log('Maturity Amount:', fd.maturityAmount);
        console.log('Interest Rate:', fd.nominalAnnualInterestRate, '%');
        console.log('Accrued Interest:', fd.summary?.totalInterestEarned || 0);

        console.log('\nTransactions:');
        (fd.transactions || []).forEach((t: any) => {
            console.log(`  ID ${t.id}:`);
            console.log(`    Type: ${JSON.stringify(t.transactionType)}`);
            console.log(`    Amount: ${t.amount}`);
            console.log(`    Running Balance: ${t.runningBalance}`);
            console.log(`    Date: ${t.date?.join('-')}`);
            console.log('');
        });

    } catch (e: any) {
        console.log('Error:', e.message);
    }

    // Also check savings account transaction 1256 directly
    console.log('\n───────────────────────────────────────');
    console.log('Checking Savings Transaction ID 1256...\n');

    // Get lender savings account (ID 3)
    const savingsResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/3?associations=all`,
        { headers }
    );
    const txn1256 = savingsResp.data?.transactions?.find((t: any) => t.id === 1256);

    if (txn1256) {
        console.log('Transaction 1256:');
        console.log('  Type:', JSON.stringify(txn1256.transactionType));
        console.log('  Amount:', txn1256.amount);
        console.log('  Running Balance:', txn1256.runningBalance);
        console.log('  Note:', txn1256.note || txn1256.transfer?.transferDescription);
        console.log('  Date:', txn1256.date?.join('-'));
    } else {
        console.log('Transaction 1256 not found in savings account 3');
    }
}

main().catch(console.error);
