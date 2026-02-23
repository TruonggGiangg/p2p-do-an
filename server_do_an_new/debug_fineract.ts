import axios from 'axios';

async function check() {
    const auth = Buffer.from('mifos:password').toString('base64');
    const baseURL = 'http://localhost:8080/fineract-provider/api/v1';

    console.log('--- FETCHING PRODUCTS ---');
    try {
        const resP = await axios.get(`${baseURL}/loanproducts`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Fineract-Platform-TenantId': 'default'
            }
        });
        const products = resP.data.pageItems || resP.data || [];
        products.forEach((p: any) => {
            console.log(`Product ID: ${p.id} | Name: ${p.name} | ShortName: ${p.shortName}`);
        });
    } catch (e: any) {
        console.error('Failed to fetch products:', e.message);
    }

    console.log('\n--- FETCHING LOANS FOR CLIENT 5 ---');
    try {
        const resL = await axios.get(`${baseURL}/loans?clientId=5`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Fineract-Platform-TenantId': 'default'
            }
        });
        const loans = resL.data.pageItems || resL.data || [];
        console.log(`Found ${loans.length} total loans for client 5.`);
        loans.forEach((l: any) => {
            console.log(`Loan ID: ${l.id} | ProductID: ${l.productId} | Product: ${l.productName} | Status: ${l.status?.value}`);
        });
    } catch (e: any) {
        console.error('Failed to fetch loans:', e.message);
    }
}

check();
