
const mongoose = require('mongoose');

async function cleanup() {
    try {
        await mongoose.connect('mongodb://localhost:27017/fineract-p2p');
        console.log('Connected to MongoDB');

        // Remove all wallet references to start fresh (since sync is easy)
        // Or we could be more surgical, but clearing and re-syncing is safer
        const result = await mongoose.connection.db.collection('wallets').deleteMany({});
        console.log(`Cleared ${result.deletedCount} wallet references from MongoDB.`);

        await mongoose.disconnect();
        console.log('Cleanup complete.');
    } catch (err) {
        console.error('Cleanup failed:', err);
    }
}

cleanup();
