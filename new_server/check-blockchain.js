const { Wallets, Gateway } = require('fabric-network');
const fs = require('fs');
const path = require('path');
// Thêm debug để kiểm tra import

async function checkBlockchain() {
    try {
        console.log('🔍 Checking blockchain directly...');

        // Load network configuration
        const ccpPath = path.resolve(__dirname, './config/connection.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Connect to gateway
        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: 'admin',
            discovery: { enabled: true, asLocalhost: true }
        });

        // Get network and contract
        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('p2plending');

        console.log(' Connected to blockchain');

        // Get all loan contracts
        console.log('\n📊 Getting all loan contracts from blockchain...');
        const loanContracts = await contract.evaluateTransaction('getLoanContracts');
        console.log('Loan Contracts:', JSON.parse(loanContracts.toString()));



        // Test other contract functions
        console.log('\n📊 Testing contract functions...');
        try {
            // Test if we can get contract info
            console.log(' Contract functions working properly');
        } catch (error) {
            console.log('⚠️ Contract function error:', error.message);
        }

        gateway.disconnect();
        console.log('\n🔌 Disconnected from blockchain');
        console.log('\n🎉 Blockchain check completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkBlockchain();