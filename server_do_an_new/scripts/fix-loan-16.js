
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new';

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const fineractLoanId = 16;
    const loan = await mongoose.connection.db.collection('loan_applications').findOne({ fineractLoanId });

    if (!loan) {
        console.log(`Loan #${fineractLoanId} not found`);
        await mongoose.disconnect();
        return;
    }

    console.log('Current documents:', JSON.stringify(loan.documents, null, 2));

    // Find the 'unknown' but approved document
    const unknownApproved = (loan.documents || []).find(d => d.documentTypeId === 'unknown' && d.reviewStatus === 'approved');

    // Find the pending required document (e.g., CCCD)
    const requiredPending = (loan.documents || []).find(d => d.documentTypeId !== 'unknown' && d.reviewStatus === 'pending');

    if (unknownApproved && requiredPending) {
        console.log(`Merging ${unknownApproved.fineractDocumentId} into ${requiredPending.documentTypeId}`);

        // Update the required one with the fineract ID and approve it
        requiredPending.fineractDocumentId = unknownApproved.fineractDocumentId;
        requiredPending.reviewStatus = 'approved';
        requiredPending.reviewedAt = unknownApproved.reviewedAt || new Date();

        // Remove the unknown one
        const newDocs = (loan.documents || []).filter(d => d !== unknownApproved);

        await mongoose.connection.db.collection('loan_applications').updateOne(
            { _id: loan._id },
            { $set: { documents: newDocs } }
        );
        console.log('Merge successful!');
    } else {
        console.log('Could not find documents to merge. Check if they are already merged or in different state.');

        // Fallback: If there's an 'unknown' approved doc but no pending required doc, 
        // maybe we should just assign a type to it if we know what it is.
        // In this case, "CCCD mặt trước" has ID 6999be334cbe281d8ae8.
        if (unknownApproved) {
            console.log('Fixing unknownApproved directly for Loan #16...');
            unknownApproved.documentTypeId = '6999be334cbe281d8ae8';
            await mongoose.connection.db.collection('loan_applications').updateOne(
                { _id: loan._id },
                { $set: { documents: loan.documents } }
            );
            console.log('Direct fix successful!');
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
