
const mongoose = require('mongoose');

async function checkMapping() {
    try {
        await mongoose.connect('mongodb://localhost:27017/fineract-p2p');
        console.log('Connected to MongoDB');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
        const Wallet = mongoose.model('Wallet', new mongoose.Schema({}, { strict: false }), 'wallets');

        const users = await User.find().toArray ? await User.find().toArray() : await User.find().lean();
        console.log('--- USERS ---');
        users.forEach(u => {
            console.log(`User: ${u.username} | ClientID: ${u.fineractClientId} | _id: ${u._id}`);
        });

        const wallets = await Wallet.find().toArray ? await Wallet.find().toArray() : await Wallet.find().lean();
        console.log('\n--- WALLETS ---');
        wallets.forEach(w => {
            console.log(`Wallet: ${w.fineractSavingsId} | userId: ${w.userId} | _id: ${w._id}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkMapping();
