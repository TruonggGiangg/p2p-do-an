
/**
 * Deep Transaction Analysis for LOAN_174
 * Trace ALL transactions: Loan, Escrow, FD, Lender accounts
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';

const LOAN_ID = 174;
const ESCROW_ACCOUNT_ID = 1; // P2P Admin
const LENDER_SAVINGS_ACCOUNT = 3; // Test Lender main savings

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
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const token = await getToken();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'fineract-platform-tenantid': 'default'
    };

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🔍 DEEP TRANSACTION ANALYSIS FOR LOAN_${LOAN_ID}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 1. Get Loan details
    console.log(`1️⃣ FINERACT LOAN ${LOAN_ID}\n`);
    const loanResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/loans/${LOAN_ID}?associations=all`,
        { headers }
    );
    const loan = loanResp.data;
    console.log('Loan Details:');
    console.log('  externalId:', loan.externalId);
    console.log('  principal:', loan.principal.toLocaleString(), 'VND');
    console.log('  status:', loan.status?.value);

    // 2. Find Lender main savings account transactions related to this loan
    console.log(`\n2️⃣ LENDER SAVINGS ACCOUNT (Account ${LENDER_SAVINGS_ACCOUNT}) - INVESTMENT CHECK\n`);
    const lenderResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${LENDER_SAVINGS_ACCOUNT}?associations=all`,
        { headers }
    );
    const lenderTxns = lenderResp.data?.transactions || [];

    // Filter withdrawals related to LOAN_174 (Investments)
    const investmentTxns = lenderTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        const type = t.transactionType?.withdrawal;
        return type && (note.includes(String(LOAN_ID)) || note.includes(loan.externalId?.toLowerCase() || 'xxx'));
    });

    console.log(`Found ${investmentTxns.length} withdrawal transactions for LOAN_${LOAN_ID}:`);
    let totalWithdrawn = 0;

    // Sort chronologically
    investmentTxns.sort((a: any, b: any) => a.id - b.id);

    investmentTxns.forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        const timestamp = new Date(t.date).getTime(); // Note: Fineract only gives date, not time in list view usually, careful.
        // Actually fineract 'date' is [Year, Month, Day].

        console.log(`  - ID ${t.id}: WITHDRAWAL | ${t.amount.toLocaleString()} VND | Date: ${t.date?.join('-')}`);
        console.log(`      Note: "${note}"`);
        console.log(`      To Account: ${t.transfer?.toAccountId}`);
        totalWithdrawn += t.amount;
    });

    console.log(`\n  💰 TOTAL LENDER WITHDRAWN: ${totalWithdrawn.toLocaleString()} VND`);
    console.log(`  💰 EXPECTED INVESTMENT: ${loan.principal.toLocaleString()} VND`);

    if (totalWithdrawn === loan.principal) {
        console.log('  ✅ MATCHED: No Double Deduction Detected.');
    } else if (totalWithdrawn > loan.principal) {
        console.log('  ❌ MISMATCH: Double Deduction LIKELY Happened!');
        console.log(`     (Withdrawn ${totalWithdrawn} > Principal ${loan.principal})`);
    }

    // 3. FD Check
    console.log(`\n3️⃣ FD ACCOUNTS CHECK\n`);
    // Search FD by externalId pattern
    const fdPattern = `FD_LOAN_${LOAN_ID}`;
    const clientsResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/clients/${loan.clientId}/accounts`,
        { headers }
    );
    const fds = (clientsResp.data.savingsAccounts || []).filter((a: any) =>
        a.depositType?.id === 200 &&
        (a.externalId?.includes(fdPattern) || a.externalId?.includes(`LOAN_${LOAN_ID}`))
    );

    for (const fd of fds) {
        console.log(`  FD ${fd.id} (${fd.externalId})`);
        console.log(`    Amount: ${fd.accountBalance?.toLocaleString()} VND`);
        console.log(`    Status: ${fd.status?.value}`);
    }

    // 4. Distribution Check (Escrow -> Lender)
    console.log(`\n4️⃣ DISTRIBUTION (REPAYMENT) CHECK\n`);
    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${ESCROW_ACCOUNT_ID}?associations=all`,
        { headers }
    );
    const escrowTxns = escrowResp.data?.transactions || [];

    const distributionTxns = escrowTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        // Check for loan ID in note
        return t.transactionType?.withdrawal &&
            (note.includes(String(LOAN_ID)) || note.includes(loan.externalId?.toLowerCase())) &&
            (note.includes('distribution') || note.includes('repayment'));
    });

    console.log(`Found ${distributionTxns.length} distribution transactions:`);
    let totalDistributed = 0;
    distributionTxns.forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        console.log(`  - ID ${t.id}: ${t.amount.toLocaleString()} VND | Note: "${note}"`);
        totalDistributed += t.amount;
    });
    console.log(`  💰 TOTAL DISTRIBUTED: ${totalDistributed.toLocaleString()} VND`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
