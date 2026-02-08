
import mongoose from 'mongoose';

async function checkMapping() {
    await mongoose.connect('mongodb://localhost:27017/fineract-p2p');

    const UserSchema = new mongoose.Schema({
        username: String,
        fineractClientId: String
    });
    const User = mongoose.model('User', UserSchema);

    const WalletSchema = new mongoose.Schema({
        userId: mongoose.Schema.Types.ObjectId,
        fineractSavingsId: String
    });
    const Wallet = mongoose.model('Wallet', WalletSchema);

    const users = await User.find();
    console.log('--- USERS ---');
    for (const u of users) {
        console.log(`User: ${u.username} | FineractClientID: ${u.fineractClientId} | _id: ${u._id}`);
    }

    const wallets = await Wallet.find();
    console.log('\n--- WALLETS ---');
    for (const w of wallets) {
        console.log(`Wallet _id: ${w._id} | userId: ${w.userId} | fineractSavingsId: ${w.fineractSavingsId}`);
    }

    await mongoose.disconnect();
}

checkMapping();
