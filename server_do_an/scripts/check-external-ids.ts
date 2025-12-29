/**
 * Check Fineract loan externalId vs MongoDB contractId
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

    const token = await getToken();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'fineract-platform-tenantid': 'default'
    };

    // Check Fineract loan 170
    console.log('═══════════════════════════════════════');
    console.log('🔍 Checking Fineract Loan 170 externalId');
    console.log('═══════════════════════════════════════\n');

    const loan170Resp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/loans/170`,
        { headers }
    );
    const fLoan170 = loan170Resp.data;
    console.log('Fineract Loan 170:');
    console.log('  id:', fLoan170.id);
    console.log('  externalId:', fLoan170.externalId);
    console.log('  accountNo:', fLoan170.accountNo);
    console.log('  status:', fLoan170.status?.value);
    console.log('  principal:', fLoan170.principal);

    // Find in MongoDB by externalId
    if (fLoan170.externalId) {
        const mongoLoan = await loans.findOne({ contractId: fLoan170.externalId });
        if (mongoLoan) {
            console.log('\n✅ Found in MongoDB:');
            console.log('  contractId:', mongoLoan.contractId);
            console.log('  fineractLoanId:', mongoLoan.fineractLoanId);
            console.log('  status:', mongoLoan.status);
        } else {
            console.log('\n❌ NOT found in MongoDB with contractId:', fLoan170.externalId);
        }
    }

    // Check Fineract loan 115
    console.log('\n═══════════════════════════════════════');
    console.log('🔍 Checking Fineract Loan 115 externalId');
    console.log('═══════════════════════════════════════\n');

    const loan115Resp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/loans/115`,
        { headers }
    );
    const fLoan115 = loan115Resp.data;
    console.log('Fineract Loan 115:');
    console.log('  id:', fLoan115.id);
    console.log('  externalId:', fLoan115.externalId);
    console.log('  accountNo:', fLoan115.accountNo);
    console.log('  status:', fLoan115.status?.value);

    if (fLoan115.externalId) {
        const mongoLoan = await loans.findOne({ contractId: fLoan115.externalId });
        if (mongoLoan) {
            console.log('\n✅ Found in MongoDB:');
            console.log('  contractId:', mongoLoan.contractId);
            console.log('  fineractLoanId:', mongoLoan.fineractLoanId);
        } else {
            console.log('\n❌ NOT found in MongoDB with contractId:', fLoan115.externalId);
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════');
    console.log('📊 KEY INSIGHT');
    console.log('═══════════════════════════════════════');
    console.log('Fineract externalId should match MongoDB contractId');
    console.log('If mismatch: reconciliation cannot find loan data!');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
