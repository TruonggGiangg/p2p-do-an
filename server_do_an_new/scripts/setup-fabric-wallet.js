const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const serverRoot = path.resolve(__dirname, '..');
        const repoRoot = path.resolve(serverRoot, '..');

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(serverRoot, 'fabric-wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Identity to be created
        const identityLabel = 'admin';

        // Check to see if we've already enrolled the admin user.
        const identity = await wallet.get(identityLabel);
        if (identity) {
            console.log(`An identity for the admin user "${identityLabel}" already exists in the wallet`);
            return;
        }

        // Paths to the cryptogen generated certificates
        const credPath = path.join(repoRoot, 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp');
        const certPath = path.join(credPath, 'signcerts', 'cert.pem');
        const keyDir = path.join(credPath, 'keystore');
        const files = fs.readdirSync(keyDir);
        const keyFileName = files.find(f => f.endsWith('_sk'));

        if (!keyFileName) {
            console.error('Private Key not found in keystore directory.');
            process.exit(1);
        }

        const keyPath = path.join(keyDir, keyFileName);

        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            console.error('Certificate or Private Key not found at expected path.');
            process.exit(1);
        }

        const certificate = fs.readFileSync(certPath).toString();
        const privateKey = fs.readFileSync(keyPath).toString();

        const x509Identity = {
            credentials: {
                certificate,
                privateKey,
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put(identityLabel, x509Identity);
        console.log(`Successfully imported admin identity into the wallet`);

    } catch (error) {
        console.error(`Failed to import admin identity: ${error}`);
        process.exit(1);
    }
}

main();
