/**
 * Fix DISTRIBUTION logs - map correct loanId from Fineract to MongoDB
 * Run: npx ts-node scripts/fix-distribution-logs.ts
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';
const KEYCLOAK_REALM = 'fineract';
const CLIENT_ID = 'community-app';
const CLIENT_SECRET = '123';

async function getOAuth2Token(): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('username', 'mifos');
    params.append('password', 'password');

    const resp = await axios.post(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return resp.data.access_token;
}

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const logs = db.collection('transactionlogs');
    const loans = db.collection('loancontracts');
    const invests = db.collection('investmentcontracts');

    // Build fineractLoanId → contractId map from MongoDB
    const allLoans = await loans.find({}).toArray();
    const loanMap: { [key: number]: string } = {};
    allLoans.forEach((l: any) => {
        if (l.fineractLoanId && l.contractId) {
            loanMap[l.fineractLoanId] = l.contractId;
        }
    });
    console.log(`📋 Built loan map: ${Object.keys(loanMap).length} loans`);
    console.log('Sample:', Object.entries(loanMap).slice(0, 5));

    // Get OAuth2 token
    const token = await getOAuth2Token();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'fineract-platform-tenantid': 'default'
    };

    // Get escrow transactions
    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/1?associations=all`,
        { headers }
    );
    const txns = escrowResp.data?.transactions || [];
    console.log(`📋 Escrow has ${txns.length} transactions`);

    // Clear old synced DISTRIBUTION logs (only those synced by script)
    const deleted = await logs.deleteMany({
        transactionType: 'DISTRIBUTION',
        transactionId: { $regex: /^TXN_DIST_SYNC_/ }
    });
    console.log(`🗑️ Deleted ${deleted.deletedCount} old synced logs`);

    let created = 0;
    let skipped = 0;

    for (const txn of txns) {
        if (!txn.transactionType?.withdrawal) continue;

        const note = (txn.transfer?.transferDescription || txn.note || '').toLowerCase();
        if (!note.includes('distribution') && !note.includes('interest distribution')) continue;

        // Extract Fineract loan ID from note (e.g., "loan 170", "loan_170", "loan 170")
        let fineractLoanId: number | null = null;

        // Pattern 1: "loan_XXX" or "loan XXX" or "loan:XXX"
        const loanMatch = note.match(/loan[_\s:]*(\d+)/i);
        if (loanMatch) {
            fineractLoanId = parseInt(loanMatch[1], 10);
        }

        if (!fineractLoanId) {
            console.log(`  ⚠️ Cannot parse loan ID from: "${note.substring(0, 50)}..."`);
            skipped++;
            continue;
        }

        // Map to MongoDB contractId
        const contractId = loanMap[fineractLoanId];
        if (!contractId) {
            console.log(`  ⚠️ No MongoDB loan for fineractLoanId ${fineractLoanId}`);
            skipped++;
            continue;
        }

        // Check if log already exists with correct loanId
        const existing = await logs.findOne({
            fineractTransactionId: txn.id,
            transactionType: 'DISTRIBUTION',
            loanId: contractId
        });
        if (existing) {
            skipped++;
            continue;
        }

        // Get lender from investment
        const investment = await invests.findOne({ loanId: contractId });
        const lenderId = investment?.lender || 'unknown';

        const logDoc = {
            transactionId: `TXN_DIST_SYNC_${txn.id}`,
            transactionType: 'DISTRIBUTION',
            amount: txn.amount,
            status: 'SUCCESS',
            p2pContext: 'Phân phối gốc & lãi cho nhà đầu tư',
            loanId: contractId,  // ✅ Correct contractId!
            lenderId: lenderId,
            fineractTransactionId: txn.id,
            metadata: {
                syncedAt: new Date(),
                fineractLoanId: fineractLoanId,
                originalNote: note.substring(0, 100)
            },
            createdAt: new Date()
        };

        await logs.insertOne(logDoc);
        console.log(`  ✅ Created: txn ${txn.id} → ${contractId} (${txn.amount} VND)`);
        created++;
    }

    console.log(`\n✨ Done! Created: ${created}, Skipped: ${skipped}`);

    // Verify counts
    const distLogs = await logs.countDocuments({ transactionType: 'DISTRIBUTION' });
    console.log(`📊 Total DISTRIBUTION logs in DB: ${distLogs}`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
