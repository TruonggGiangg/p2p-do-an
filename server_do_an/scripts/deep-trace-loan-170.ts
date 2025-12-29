/**
 * Deep Transaction Analysis for LOAN_170
 * Trace ALL transactions: Loan, Escrow, FD, Lender accounts
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';

// Known accounts from screenshot
const ESCROW_ACCOUNT_ID = 1; // P2P Admin
const FD_ACCOUNT_118 = 118; // 000000118
const FD_ACCOUNT_119 = 119; // 000000119
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
    console.log('🔍 DEEP TRANSACTION ANALYSIS FOR LOAN_170');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 1. Get Loan 170 details and transactions
    console.log('1️⃣ FINERACT LOAN 170\n');
    const loanResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/loans/170?associations=all`,
        { headers }
    );
    const loan = loanResp.data;
    console.log('Loan Details:');
    console.log('  externalId:', loan.externalId);
    console.log('  principal:', loan.principal, 'VND');
    console.log('  interestRate:', loan.interestRatePerPeriod, '% per month');
    console.log('  status:', loan.status?.value);
    console.log('  totalExpectedRepayment:', loan.summary?.totalExpectedRepayment);
    console.log('  totalOutstanding:', loan.summary?.totalOutstanding);

    console.log('\nLoan Transactions:');
    (loan.transactions || []).forEach((t: any) => {
        console.log(`  - ID ${t.id}: ${t.type?.value} | ${t.amount} VND | ${t.date?.join('-')}`);
    });

    // 2. Escrow Account (P2P Admin) - Account ID 1
    console.log('\n\n2️⃣ ESCROW ACCOUNT (P2P Admin) - Account 1\n');
    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${ESCROW_ACCOUNT_ID}?associations=all`,
        { headers }
    );
    const escrowTxns = escrowResp.data?.transactions || [];

    // Filter transactions related to loan 170
    const loan170EscrowTxns = escrowTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        return note.includes('170') || note.includes('loan_1766999039142');
    });

    console.log(`Found ${loan170EscrowTxns.length} escrow transactions for LOAN_170:`);
    loan170EscrowTxns.forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        const type = t.transactionType?.withdrawal ? 'WITHDRAWAL' : 'DEPOSIT';
        console.log(`  - ID ${t.id}: ${type} | ${t.amount} VND`);
        console.log(`      Note: "${note.substring(0, 80)}"`);
        console.log(`      From: ${t.transfer?.fromAccountId} → To: ${t.transfer?.toAccountId}`);
    });

    // 3. Find Lender main savings account transactions
    console.log('\n\n3️⃣ LENDER SAVINGS ACCOUNT - Account 3\n');
    const lenderResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${LENDER_SAVINGS_ACCOUNT}?associations=all`,
        { headers }
    );
    const lenderTxns = lenderResp.data?.transactions || [];

    // Find recent transactions (last 20)
    console.log(`Last 15 transactions on Lender Savings Account:`);
    lenderTxns.slice(0, 15).forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        const type = t.transactionType?.withdrawal ? 'OUT' : 'IN';
        const fromTo = t.transactionType?.withdrawal
            ? `To: ${t.transfer?.toAccountId}`
            : `From: ${t.transfer?.fromAccountId}`;
        console.log(`  - ID ${t.id}: ${type} | ${t.amount} VND | ${fromTo}`);
        if (note) console.log(`      Note: "${note.substring(0, 60)}"`);
    });

    // 4. Find DISTRIBUTION transactions (Escrow → Lender)
    console.log('\n\n4️⃣ DISTRIBUTION ANALYSIS (Escrow → Lender for LOAN_170)\n');

    // Find escrow withdrawals that went to lender
    const distributionTxns = escrowTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        const isLoan170 = note.includes('170') || note.includes('loan_1766999039142');
        const isDistribution = note.includes('distribution') || note.includes('repayment');
        const isWithdrawal = t.transactionType?.withdrawal === true;
        return isLoan170 && isWithdrawal && isDistribution;
    });

    console.log(`🔍 ESCROW WITHDRAWALS for LOAN_170 (DISTRIBUTION):`);
    if (distributionTxns.length === 0) {
        console.log('  ❌ NO DISTRIBUTION WITHDRAWALS FOUND!');
        console.log('  → This is why "Phân phối" shows 0.00 VND');
    } else {
        let totalDistributed = 0;
        distributionTxns.forEach((t: any) => {
            const note = t.transfer?.transferDescription || t.note || '';
            console.log(`  ✅ ID ${t.id}: ${t.amount} VND`);
            console.log(`      To Account: ${t.transfer?.toAccountId}`);
            console.log(`      Note: "${note.substring(0, 80)}"`);
            totalDistributed += t.amount;
        });
        console.log(`\n  Total Distributed: ${totalDistributed} VND`);
    }

    // 5. Check if distribution happened via FD closure instead
    console.log('\n\n5️⃣ FD CLOSURE ANALYSIS\n');

    // Check FD accounts (they might have distributed via closure)
    for (const fdId of ['118', '119']) {
        try {
            const fdResp = await axios.get(
                `${FINERACT_URL}/fineract-provider/api/v1/fixeddepositaccounts/${fdId}?associations=transactions`,
                { headers }
            );
            const fd = fdResp.data;
            console.log(`FD Account ${fdId}:`);
            console.log(`  Status: ${fd.status?.value}`);
            console.log(`  externalId: ${fd.externalId}`);
            console.log(`  depositAmount: ${fd.depositAmount}`);
            console.log(`  maturityAmount: ${fd.maturityAmount}`);

            if (fd.transactions) {
                console.log(`  Transactions:`);
                fd.transactions.forEach((t: any) => {
                    console.log(`    - ID ${t.id}: ${t.transactionType?.value} | ${t.amount}`);
                });
            }
            console.log('');
        } catch (e: any) {
            console.log(`FD Account ${fdId}: Error - ${e.message}`);
        }
    }

    // 6. Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Expected Flow:');
    console.log('  1. Borrower → Escrow [Trả nợ: 1,100,000]');
    console.log('  2. Escrow → Lender [Phân phối gốc+lãi]  ← MISSING!');
    console.log('  3. OR: FD Close → Lender [Hoàn vốn FD]  ✓ (1,000,000)');
    console.log('');
    console.log('Issue: "Phân phối" = 0 because:');
    console.log('  - No direct Escrow→Lender transfer with "distribution" note');
    console.log('  - Interest (100,000) stayed in Escrow as admin profit');
    console.log('');
    console.log('Solution: Distribution = interest portion that should go to lender');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
