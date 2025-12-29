/**
 * Sync DISTRIBUTION logs for LOAN_170 with OAuth2
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';
const KEYCLOAK_REALM = 'fineract';
const FINERACT_CLIENT_ID = 'community-app';
const FINERACT_CLIENT_SECRET = '123';

async function getOAuth2Token(): Promise<string> {
    const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', FINERACT_CLIENT_ID);
    params.append('client_secret', FINERACT_CLIENT_SECRET);
    params.append('username', 'mifos');
    params.append('password', 'password');

    const resp = await axios.post(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return resp.data.access_token;
}

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const logs = db.collection('transactionlogs');
    const loans = db.collection('loancontracts');
    const invests = db.collection('investmentcontracts');

    // Get OAuth2 token
    console.log('🔑 Getting OAuth2 token...');
    const token = await getOAuth2Token();
    console.log('✅ Got OAuth2 token');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'fineract-platform-tenantid': 'default'
    };

    // Find loan by fineractLoanId = 170
    const allLoans = await loans.find({}).limit(20).toArray();
    console.log('Loans in DB:', allLoans.map((l: any) => `${l.contractId} (F:${l.fineractLoanId})`).join(', '));

    const loan = allLoans.find((l: any) => l.fineractLoanId === 170);
    const loanId = loan?.contractId || 'LOAN_1766992459';
    console.log('Target loanId:', loanId);

    // Get escrow transactions
    const escrowResp = await axios.get(`${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/1?associations=all`, { headers });
    const txns = escrowResp.data?.transactions || [];
    console.log(`📋 Escrow has ${txns.length} transactions`);

    // Find withdrawals from escrow that might be distributions
    let created = 0;
    for (const txn of txns) {
        if (!txn.transactionType?.withdrawal) continue;

        const note = (txn.transfer?.transferDescription || txn.note || '').toLowerCase();
        // Match distribution-related notes or loan 170
        if (!note.includes('distribution') && !note.includes('170')) continue;

        console.log(`Found: ID=${txn.id}, Amount=${txn.amount}, Note="${note.substring(0, 50)}..."`);

        // Check if already exists
        const existing = await logs.findOne({ fineractTransactionId: txn.id, transactionType: 'DISTRIBUTION' });
        if (existing) {
            console.log(`  ⏭️ Already exists`);
            continue;
        }

        // Get investment for lender info
        const investment = await invests.findOne({ loanId: loanId });

        await logs.insertOne({
            transactionId: `TXN_DIST_SYNC_${txn.id}`,
            transactionType: 'DISTRIBUTION',
            amount: txn.amount,
            status: 'SUCCESS',
            p2pContext: 'Phân phối gốc & lãi cho nhà đầu tư',
            loanId: loanId,
            lenderId: investment?.lender || 'unknown',
            fineractTransactionId: txn.id,
            metadata: { syncedAt: new Date(), note: note },
            createdAt: new Date()
        });
        console.log(`  ✅ Created DISTRIBUTION log for ${txn.amount} VND`);
        created++;
    }

    console.log(`\n✨ Done! Created ${created} DISTRIBUTION logs`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
