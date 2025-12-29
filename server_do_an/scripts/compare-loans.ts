/**
 * Compare LOAN_170 vs LOAN_115 - Full analysis from Fineract + MongoDB
 * Run: npx ts-node scripts/compare-loans.ts
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
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
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const loans = db.collection('loancontracts');
    const invests = db.collection('investmentcontracts');
    const txnLogs = db.collection('transactionlogs');

    const token = await getToken();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'fineract-platform-tenantid': 'default'
    };

    // ====================
    // LOAN_115 (Working - from p2p-do-an)
    // ====================
    console.log('═══════════════════════════════════════');
    console.log('📋 LOAN_115 Analysis (Expected: WORKING)');
    console.log('═══════════════════════════════════════\n');

    // MongoDB data
    const loan115 = await loans.findOne({ fineractLoanId: 115 });
    if (loan115) {
        console.log('[MongoDB] LoanContract:');
        console.log(`  contractId: ${loan115.contractId}`);
        console.log(`  fineractLoanId: ${loan115.fineractLoanId}`);
        console.log(`  status: ${loan115.status}`);
        console.log(`  capital: ${loan115.info?.capital}`);
        console.log(`  borrowerInterestRate: ${loan115.borrowerInterestRate}%`);

        // Investments
        const invest115 = await invests.find({ loanId: loan115.contractId }).toArray();
        console.log(`\n[MongoDB] Investments: ${invest115.length}`);
        invest115.forEach((inv: any, i: number) => {
            console.log(`  ${i + 1}. ${inv.contractId}: ${inv.info?.capital} VND, lender=${inv.lender}, fdAccountId=${inv.fineractFixedDepositAccountId}`);
        });

        // Transaction logs
        const logs115 = await txnLogs.find({ loanId: loan115.contractId }).toArray();
        console.log(`\n[MongoDB] TransactionLogs: ${logs115.length}`);
        logs115.forEach((l: any) => {
            console.log(`  - ${l.transactionType}: ${l.amount} VND (${l.p2pContext || 'N/A'})`);
        });
    } else {
        console.log('[MongoDB] LOAN with fineractLoanId=115 NOT FOUND');
    }

    // Fineract data
    try {
        const loanResp = await axios.get(
            `${FINERACT_URL}/fineract-provider/api/v1/loans/115?associations=all`,
            { headers }
        );
        const fLoan = loanResp.data;
        console.log(`\n[Fineract] Loan 115:`);
        console.log(`  status: ${fLoan.status?.value}`);
        console.log(`  principal: ${fLoan.principal}`);
        console.log(`  interestRatePerPeriod: ${fLoan.interestRatePerPeriod}%`);
        console.log(`  totalRepaymentExpected: ${fLoan.summary?.totalRepaymentExpected}`);
        console.log(`  totalOutstanding: ${fLoan.summary?.totalOutstanding}`);

        // Transactions
        const txns = fLoan.transactions || [];
        console.log(`\n[Fineract] Transactions: ${txns.length}`);
        txns.slice(-5).forEach((t: any) => {
            console.log(`  - ID ${t.id}: ${t.type?.value} ${t.amount} VND`);
        });
    } catch (e: any) {
        console.log(`[Fineract] Error: ${e.message}`);
    }

    // ====================
    // LOAN_170 (Broken - from P2P reference?)
    // ====================
    console.log('\n═══════════════════════════════════════');
    console.log('📋 LOAN_170 Analysis (Expected: BROKEN)');
    console.log('═══════════════════════════════════════\n');

    // MongoDB data
    const loan170 = await loans.findOne({ fineractLoanId: 170 });
    if (loan170) {
        console.log('[MongoDB] LoanContract:');
        console.log(`  contractId: ${loan170.contractId}`);
        console.log(`  fineractLoanId: ${loan170.fineractLoanId}`);
        console.log(`  status: ${loan170.status}`);
    } else {
        console.log('[MongoDB] LOAN with fineractLoanId=170 NOT FOUND in p2p-do-an DB!');
        console.log('  → This loan was likely created via P2P reference project');
    }

    // Investments for loan 170
    const invest170 = await invests.find({
        $or: [
            { 'metadata.fineractLoanId': 170 },
            { loanId: { $regex: /170/ } }
        ]
    }).toArray();
    console.log(`\n[MongoDB] Investments matching "170": ${invest170.length}`);

    // Transaction logs
    const logs170 = await txnLogs.find({
        $or: [
            { loanId: 'LOAN_170' },
            { 'metadata.fineractLoanId': 170 }
        ]
    }).toArray();
    console.log(`[MongoDB] TransactionLogs for LOAN_170: ${logs170.length}`);
    logs170.forEach((l: any) => {
        console.log(`  - ${l.transactionType}: ${l.amount} VND`);
    });

    // Fineract data
    try {
        const loanResp = await axios.get(
            `${FINERACT_URL}/fineract-provider/api/v1/loans/170?associations=all`,
            { headers }
        );
        const fLoan = loanResp.data;
        console.log(`\n[Fineract] Loan 170 EXISTS:`);
        console.log(`  status: ${fLoan.status?.value}`);
        console.log(`  principal: ${fLoan.principal}`);
        console.log(`  client: ${fLoan.clientName} (ID: ${fLoan.clientId})`);
        console.log(`  totalRepaymentExpected: ${fLoan.summary?.totalRepaymentExpected}`);
        console.log(`  totalOutstanding: ${fLoan.summary?.totalOutstanding}`);

        // Transactions
        const txns = fLoan.transactions || [];
        console.log(`\n[Fineract] Transactions: ${txns.length}`);
        txns.forEach((t: any) => {
            console.log(`  - ID ${t.id}: ${t.type?.value} ${t.amount} VND`);
        });
    } catch (e: any) {
        console.log(`[Fineract] Loan 170 Error: ${e.message}`);
    }

    // Escrow transactions for loan 170
    console.log('\n[Fineract] Escrow transactions mentioning "170":');
    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/1?associations=all`,
        { headers }
    );
    const escrowTxns = escrowResp.data?.transactions || [];
    const loan170Txns = escrowTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        return note.includes('170') && (note.includes('loan') || note.includes('distribution'));
    });
    console.log(`  Found ${loan170Txns.length} transactions:`);
    loan170Txns.forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        console.log(`  - ID ${t.id}: ${t.transactionType?.value} ${t.amount} VND`);
        console.log(`      Note: "${note.substring(0, 60)}..."`);
    });

    console.log('\n════════════════════════════════════════');
    console.log('📊 CONCLUSION');
    console.log('════════════════════════════════════════');
    console.log('LOAN_115: Created via p2p-do-an → MongoDB has loan + investments + logs');
    console.log('LOAN_170: Created via P2P reference → NOT in p2p-do-an MongoDB!');
    console.log('→ Reconciliation cannot display LOAN_170 because loan data is missing.');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
