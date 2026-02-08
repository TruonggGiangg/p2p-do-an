
const mongoose = require('mongoose');

async function checkAtlas() {
    const uri = 'mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new';
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB Atlas');

        const db = mongoose.connection.db;

        const users = await db.collection('users').find({}).toArray();
        console.log('--- USERS ---');
        users.forEach(u => {
            console.log(`User: ${u.username} | _id: ${u._id} | fineractClientId: ${u.fineractClientId}`);
        });

        const wallets = await db.collection('wallets').find({}).toArray();
        console.log('\n--- WALLETS ---');
        wallets.forEach(w => {
            console.log(`Wallet: ${w.fineractSavingsId} | userId: ${w.userId} | _id: ${w._id}`);
            console.log(`userId type: ${typeof w.userId}, isObjectId: ${w.userId instanceof mongoose.Types.ObjectId}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Atlas check failed:', err);
    }
}

checkAtlas();
