/**
 * Verify Distribution Notes for Multiple Loans
 * Check which loans have correct contractId format vs numeric format
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';

const LOANS_TO_CHECK = [171, 146, 160, 168, 115]; // From screenshots

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

    // Get all escrow transactions
    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/1?associations=all`,
        { headers }
    );
    const escrowTxns = escrowResp.data?.transactions || [];

    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔍 DISTRIBUTION NOTE FORMAT VERIFICATION');
    console.log('════════════════════════════════════════════════════════════════\n');

    for (const loanId of LOANS_TO_CHECK) {
        console.log(`\n─── LOAN ${loanId} ───`);

        // Get Fineract externalId
        try {
            const loanResp = await axios.get(
                `${FINERACT_URL}/fineract-provider/api/v1/loans/${loanId}`,
                { headers }
            );
            const externalId = loanResp.data?.externalId || 'N/A';
            console.log(`Fineract externalId: ${externalId}`);

            // Find distribution transactions
            const distTxns = escrowTxns.filter((t: any) => {
                const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
                return note.includes(String(loanId)) || note.includes(externalId.toLowerCase());
            }).filter((t: any) => {
                const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
                return note.includes('distribution') && t.transactionType?.withdrawal;
            });

            if (distTxns.length === 0) {
                console.log(`❌ No DISTRIBUTION withdrawals found`);
            } else {
                console.log(`✅ Found ${distTxns.length} distribution(s):`);
                let hasContractIdFormat = false;
                let hasNumericFormat = false;
                let total = 0;

                distTxns.forEach((t: any) => {
                    const note = t.transfer?.transferDescription || t.note || '';
                    console.log(`   ID ${t.id}: ${t.amount} VND - "${note.substring(0, 60)}..."`);
                    total += t.amount;

                    if (note.includes('LOAN_')) {
                        hasContractIdFormat = true;
                    } else if (note.match(/loan \d+/i)) {
                        hasNumericFormat = true;
                    }
                });

                console.log(`   Total: ${total.toLocaleString()} VND`);

                if (hasContractIdFormat) {
                    console.log(`   ✅ Note format: Uses contractId (LOAN_xxx)`);
                } else if (hasNumericFormat) {
                    console.log(`   ⚠️  Note format: Uses numeric (loan 123) - may not display in UI`);
                }
            }

        } catch (e: any) {
            console.log(`Error: ${e.message}`);
        }
    }

    console.log('\n\n════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ = Uses LOAN_xxx format → UI displays correctly');
    console.log('⚠️  = Uses numeric format → UI shows 0');
    console.log('Fix: Ensure all distribution notes use loan.contractId');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
