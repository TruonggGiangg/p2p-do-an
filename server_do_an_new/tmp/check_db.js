const { MongoClient } = require('mongodb');

async function check() {
    const uri = 'mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('p2p');
        const collection = db.collection('loan_applications');

        const totalLoans = await collection.countDocuments({});
        const disbursedLoans = await collection.countDocuments({ status: 'disbursed' });
        const overdueValueLoans = await collection.countDocuments({ status: 'disbursed', totalOverdue: { $gt: 0 } });

        console.log('Total Loans in DB:', totalLoans);
        console.log('Disbursed Loans:', disbursedLoans);
        console.log('Loans with totalOverdue > 0:', overdueValueLoans);

        const samples = await collection.find({ status: 'disbursed' }).limit(5).toArray();
        samples.forEach((loan, idx) => {
            console.log(`\nSample ${idx + 1}: ${loan._id}`);
            console.log(`- totalOverdue: ${loan.totalOverdue}`);
            console.log(`- delinquentDays: ${loan.delinquentDays}`);
            console.log(`- repaymentSchedule items: ${loan.repaymentSchedule ? loan.repaymentSchedule.length : 'N/A'}`);
            if (loan.repaymentSchedule) {
                const overdueItems = loan.repaymentSchedule.filter(item => {
                    if (item.period === 0 || item.complete) return false;
                    // Check if due date is past (roughly)
                    return true; // We'll look at the data manually
                });
                console.log(`- Sample Schedule Item 1: ${JSON.stringify(loan.repaymentSchedule[1] || 'None')}`);
            }
        });

    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    } finally {
        await client.close();
    }
}

check();
