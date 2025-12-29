/**
 * Script to sync DISTRIBUTION logs from Fineract to MongoDB
 * Run: npx ts-node scripts/sync-distribution-logs.ts [loanId]
 * 
 * Problem: Some repayments were processed before DISTRIBUTION logging was added
 * Solution: Scan Fineract for "Repayment distribution for loan X" transfers and create logs
 */

import { MongoClient } from 'mongodb';
import axios from 'axios';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/p2p-do-an';
const FINERACT_URL = process.env.FINERACT_URL || 'https://localhost:8443';
const FINERACT_USERNAME = process.env.FINERACT_USERNAME || 'mifos';
const FINERACT_PASSWORD = process.env.FINERACT_PASSWORD || 'password';

async function getFineractHeaders() {
    const auth = Buffer.from(`${FINERACT_USERNAME}:${FINERACT_PASSWORD}`).toString('base64');
    return {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'fineract-platform-tenantid': 'default'
    };
}

async function getAdminAccountTransactions(escrowAccountId: number) {
    const headers = await getFineractHeaders();
    const url = `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${escrowAccountId}?associations=all`;

    const response = await axios.get(url, { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) });
    return response.data.transactions || [];
}

async function syncDistributionLogs(loanIdFilter?: string) {
    console.log('🔄 Starting Distribution Logs Sync...');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    const transactionLogs = db.collection('transactionlogs');
    const loanContracts = db.collection('loancontracts');
    const investmentContracts = db.collection('investmentcontracts');

    // Get escrow account ID from env or default
    const escrowAccountId = parseInt(process.env.FINERACT_ESCROW_ACCOUNT_ID || '1');

    console.log(`📡 Fetching transactions from Escrow Account ${escrowAccountId}...`);
    const transactions = await getAdminAccountTransactions(escrowAccountId);

    // Filter for distribution transactions (withdrawals from escrow = distribution to lender)
    const distributionTxns = transactions.filter((txn: any) => {
        const note = txn.transfer?.transferDescription || txn.note || '';
        return note.toLowerCase().includes('repayment distribution for loan')
            || note.toLowerCase().includes('interest distribution for loan');
    });

    console.log(`📋 Found ${distributionTxns.length} potential distribution transactions`);

    let created = 0;
    let skipped = 0;

    for (const txn of distributionTxns) {
        const note = txn.transfer?.transferDescription || txn.note || '';

        // Extract loan ID from note (e.g., "Repayment distribution for loan LOAN_167")
        const loanIdMatch = note.match(/loan\s+(LOAN_\d+|\d+)/i);
        if (!loanIdMatch) {
            console.log(`  ⚠️ Cannot extract loan ID from: ${note}`);
            continue;
        }

        let loanId = loanIdMatch[1];
        if (!loanId.startsWith('LOAN_')) {
            loanId = `LOAN_${loanId}`;
        }

        // Apply filter if provided
        if (loanIdFilter && loanId !== loanIdFilter) {
            continue;
        }

        // Check if log already exists
        const existingLog = await transactionLogs.findOne({
            fineractTransactionId: txn.id,
            transactionType: 'DISTRIBUTION'
        });

        if (existingLog) {
            console.log(`  ⏭️ Log already exists for txn ${txn.id}`);
            skipped++;
            continue;
        }

        // Get lender info from transfer target
        let lenderId = 'unknown';
        if (txn.transfer?.toClientId) {
            // Find investment by fineract client ID
            const wallet = await db.collection('wallets').findOne({ fineractClientId: txn.transfer.toClientId });
            if (wallet?.p2pUserId) {
                lenderId = wallet.p2pUserId;
            }
        }

        // Create distribution log
        const newLog = {
            transactionId: `TXN_DIST_SYNC_${Date.now()}_${txn.id}`,
            transactionType: 'DISTRIBUTION',
            amount: txn.amount,
            status: 'SUCCESS',
            p2pContext: 'Phân phối gốc & lãi cho nhà đầu tư',
            loanId: loanId,
            lenderId: lenderId,
            fineractTransactionId: txn.id,
            metadata: {
                action: 'distribution',
                type: note.toLowerCase().includes('interest') ? 'INTEREST' : 'BOTH',
                syncedAt: new Date(),
                originalNote: note
            },
            createdAt: new Date(txn.date[0], txn.date[1] - 1, txn.date[2])
        };

        await transactionLogs.insertOne(newLog);
        console.log(`  ✅ Created log for txn ${txn.id}: ${loanId} - ${txn.amount} VND`);
        created++;
    }

    console.log(`\n✨ Sync completed!`);
    console.log(`   Created: ${created} logs`);
    console.log(`   Skipped: ${skipped} logs`);

    await client.close();
}

// Run
const loanIdArg = process.argv[2];
syncDistributionLogs(loanIdArg)
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
