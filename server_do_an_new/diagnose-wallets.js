const { MongoClient } = require('mongodb');
const axios = require('axios');

const MONGO_URI = 'mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new';
const FINERACT_API_URL = 'http://localhost:8080/fineract-provider/api/v1';

async function diagnose() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db('p2p_new');

        console.log('--- Current User Mappings ---');
        const users = await db.collection('users').find({ fineractClientId: { $exists: true } }).toArray();
        for (const user of users) {
            console.log(`User: ${user.username} (ID: ${user._id}) -> Fineract Client ID: ${user.fineractClientId}`);

            // Check Fineract
            try {
                const response = await axios.get(`${FINERACT_API_URL}/clients/${user.fineractClientId}/accounts`, {
                    headers: {
                        'Fineract-Platform-TenantId': 'default',
                        'Authorization': 'Basic bWlmb3M6cGFzc3dvcmQ=' // mifos:password
                    }
                });

                const savings = response.data.savingsAccounts || [];
                console.log(`  Fineract says: ${savings.length} accounts found.`);
                savings.forEach(s => {
                    console.log(`    - ID: ${s.id} | AccountNo: ${s.accountNo} | StatusId: ${s.status.id} | Status: ${s.status.value} | Product: ${s.productName}`);
                });

                // Check MongoDB wallets for this user
                const wallets = await db.collection('wallets').find({ userId: user._id }).toArray();
                console.log(`  MongoDB says: ${wallets.length} wallet references found.`);
                wallets.forEach(w => {
                    console.log(`    - _id: ${w._id} | fineractSavingsId: ${w.fineractSavingsId}`);
                });
            } catch (err) {
                console.error(`  Error fetching Fineract data for client ${user.fineractClientId}: ${err.message}`);
            }
            console.log('----------------------------');
        }
    } finally {
        await client.close();
    }
}

diagnose().catch(console.error);
