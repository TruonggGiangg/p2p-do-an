const mongoose = require('mongoose');
require('dotenv').config();

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(' Connected to MongoDB:', process.env.MONGODB_URI.replace(/\/\/.*:.*@/, '//***:***@'));

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');

        const users = await User.find().lean();
        console.log('\n--- USERS IN DATABASE ---');
        console.log('Total users:', users.length);

        users.forEach((user, index) => {
            console.log(`${index + 1}. Username: ${user.username} | Email: ${user.email || 'N/A'} | ID: ${user._id}`);
        });

        // Kiểm tra user "mifos" cụ thể
        const mifosUser = await User.findOne({ username: 'mifos' });
        if (mifosUser) {
            console.log('\n❌ User "mifos" ĐÃ TỒN TẠI:');
            console.log(JSON.stringify(mifosUser, null, 2));
        } else {
            console.log('\n User "mifos" CHƯA TỒN TẠI');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkUsers();