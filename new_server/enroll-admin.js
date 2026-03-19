const { Wallets, Gateway } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');


console.log('Wallets:', typeof Wallets);
console.log('Gateway:', typeof Gateway);
async function enrollAdmin() {
    try {
        console.log('👤 Enrolling admin user...');

        // Load network configuration
        const ccpPath = path.resolve(__dirname, './config/connection.json');

        // Kiểm tra file có tồn tại không
        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Connection config not found at: ${ccpPath}`);
        }

        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create a new CA client for interacting with the CA
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        // Create a new file system based wallet for managing identities
        const walletPath = path.join(process.cwd(), 'wallet');

        // Tạo thư mục wallet nếu chưa có
        if (!fs.existsSync(walletPath)) {
            console.log('📁 Creating wallet directory...');
            fs.mkdirSync(walletPath, { recursive: true });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check to see if we've already enrolled the admin user
        const adminExists = await wallet.get('admin');
        if (adminExists) {
            console.log(' An identity for the admin user "admin" already exists in the wallet');
            return;
        }

        // Enroll the admin user, and import the new identity into the wallet
        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put('admin', x509Identity);
        console.log(' Successfully enrolled admin user "admin" and imported it into the wallet');

    } catch (error) {
        console.error(`❌ Failed to enroll admin user "admin": ${error.message}`);
        console.error('Stack trace:', error.stack);
        process.exit(1); // Thoát với code lỗi
    }
}

// Sửa cách gọi function
enrollAdmin()
    .then(() => {
        console.log('----   Enrollment completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('----   Enrollment failed:', error.message);
        process.exit(1);
    });