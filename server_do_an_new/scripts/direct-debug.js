
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new';

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const docTypes = await mongoose.connection.db.collection('document_types').find().toArray();
    console.log('--- Document Types ---');
    docTypes.forEach(t => {
        console.log(`Name: ${t.name}, ID: ${t._id} (type: ${typeof t._id}, length: ${t._id.toString().length})`);
    });

    const loanId = 16;
    const loan = await mongoose.connection.db.collection('loan_applications').findOne({ fineractLoanId: loanId });
    if (loan) {
        console.log('\n--- Loan #16 Documents ---');
        (loan.documents || []).forEach((d, i) => {
            console.log(`Doc [${i}]: ${d.name} | typeId: ${d.documentTypeId} | status: ${d.reviewStatus}`);
        });
    }

    await mongoose.disconnect();
}

run().catch(console.error);
