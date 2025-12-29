/**
 * Fix: Create missing loan entry for Fineract loan 170
 * And sync all related transactions
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
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const loans = db.collection('loancontracts');
    const invests = db.collection('investmentcontracts');
    const txnLogs = db.collection('transactionlogs');

    const token = await getToken();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'fineract-platform-tenantid': 'default'
    };

    // Get Fineract loan 170 details
    const loanResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/loans/170?associations=all`,
        { headers }
    );
    const fLoan = loanResp.data;
    const externalId = fLoan.externalId; // LOAN_1766999039142

    console.log('Fineract Loan 170:');
    console.log('  externalId:', externalId);
    console.log('  principal:', fLoan.principal);
    console.log('  status:', fLoan.status?.value);
    console.log('  clientId:', fLoan.clientId);
    console.log('  interestRate:', fLoan.interestRatePerPeriod, '% per', fLoan.interestRateFrequencyType?.value);

    // Check if exists
    const existing = await loans.findOne({ contractId: externalId });
    if (existing) {
        console.log('\n✅ Loan already exists in MongoDB');
        console.log('  fineractLoanId:', existing.fineractLoanId);
        console.log('  status:', existing.status);
    } else {
        console.log('\n📝 Creating loan entry in MongoDB...');

        const loanDoc = {
            contractId: externalId,
            fineractLoanId: 170,
            borrower: 'test-borrower-keycloak-id', // Would need actual Keycloak ID
            status: 'clean', // Loan is closed
            fineractStatus: 'CLOSED_OBLIGATIONS_MET',
            borrowerInterestRate: fLoan.interestRatePerPeriod * 12, // Annual
            lenderInterestRate: (fLoan.interestRatePerPeriod * 12) - 3, // 3% spread
            info: {
                capital: fLoan.principal,
                periodMonth: fLoan.termFrequency || 12,
                rate: fLoan.interestRatePerPeriod,
                entirelyPay: fLoan.summary?.totalExpectedRepayment || fLoan.principal * 1.1,
                monthlyPay: Math.round(fLoan.principal / (fLoan.termFrequency || 12) * 1.1),
                createdDate: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await loans.insertOne(loanDoc);
        console.log('✅ Created loan:', externalId);
    }

    // Now sync DISTRIBUTION logs for this loan
    console.log('\n📝 Syncing DISTRIBUTION logs for', externalId);

    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/1?associations=all`,
        { headers }
    );
    const txns = escrowResp.data?.transactions || [];

    let created = 0;
    for (const txn of txns) {
        if (!txn.transactionType?.withdrawal) continue;

        const note = (txn.transfer?.transferDescription || txn.note || '').toLowerCase();
        // Match loan 170 or externalId
        if (!note.includes('170') && !note.includes(externalId.toLowerCase())) continue;
        if (!note.includes('distribution')) continue;

        // Check existing
        const existingLog = await txnLogs.findOne({
            fineractTransactionId: txn.id,
            transactionType: 'DISTRIBUTION'
        });
        if (existingLog) continue;

        await txnLogs.insertOne({
            transactionId: `TXN_DIST_SYNC_${txn.id}`,
            transactionType: 'DISTRIBUTION',
            amount: txn.amount,
            status: 'SUCCESS',
            p2pContext: 'Phân phối gốc & lãi cho nhà đầu tư',
            loanId: externalId,
            lenderId: 'unknown',
            fineractTransactionId: txn.id,
            metadata: { syncedAt: new Date(), originalNote: note.substring(0, 100) },
            createdAt: new Date()
        });
        console.log('  ✅ Created DISTRIBUTION log:', txn.id, txn.amount, 'VND');
        created++;
    }

    console.log(`\n✨ Done! Created ${created} DISTRIBUTION logs`);

    // Verify
    const distLogs = await txnLogs.find({ loanId: externalId, transactionType: 'DISTRIBUTION' }).toArray();
    console.log(`📊 Total DISTRIBUTION logs for ${externalId}: ${distLogs.length}`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
