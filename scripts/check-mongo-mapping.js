
const mongoose = require('mongoose');

async function checkMapping() {
    try {
        await mongoose.connect('mongodb://localhost:27017/fineract-p2p');
        console.log('Connected to MongoDB');

        const users = await mongoose.connection.db.collection('users').find().toArray();
        console.log('--- USERS ---');
        users.forEach(u => {
            console.log(`User: ${u.username} | FineractClientID: ${u.fineractClientId} | _id: ${u._id}`);
        });

        const wallets = await mongoose.connection.db.collection('wallets').find().toArray();
        console.log('\n--- WALLETS ---');
        wallets.forEach(w => {
            console.log(`Wallet _id: ${w._id} | userId: ${w.userId} | fineractSavingsId: ${w.fineractSavingsId}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkMapping();
