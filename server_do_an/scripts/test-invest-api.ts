
import axios from 'axios';

async function testInvestment() {
    const API_URL = 'http://localhost:3000';
    // User credentials (Lender: 0987654321 / 123456)
    // We need a valid JWT token first.

    try {
        console.log('🚀 TESTING INVESTMENT FLOW VIA API');

        // 1. Login
        console.log('🔑 Logging in as Lender...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: '0987654321', // Client 3
            password: '1' // Assuming '1' is password based on previous logs or try '123456'
        });

        const token = loginRes.data.access_token;
        console.log('✅ Login success. Token obtained.');

        // 2. Get Balance Before
        console.log('💰 Checking Initial Balance...');
        const balanceRes = await axios.get(`${API_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const initialBalance = balanceRes.data.balance;
        console.log(`Initial Balance: ${initialBalance.toLocaleString('vi-VN')} VND`);

        // 3. Find Available Loan
        console.log('🔍 Finding Loan...');
        const loansRes = await axios.get(`${API_URL}/invest/available-loans`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const loan = loansRes.data.data[0];

        if (!loan) {
            console.error('❌ No available loans found.');
            return;
        }
        console.log(`✅ Found Loan: ${loan.contractId}`);

        // 4. Invest
        const investAmount = 1000000; // 1M
        console.log(`💸 Investing ${investAmount.toLocaleString('vi-VN')} VND...`);

        const investRes = await axios.post(`${API_URL}/invest/create`, {
            loanContractId: loan.contractId,
            numNotes: 2 // 2 * 500k = 1M
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ Investment API Call Success');

        // 5. Wait & Check Balance After
        console.log('⏳ Waiting 3s for transactions...');
        await new Promise(r => setTimeout(r, 3000));

        const finalBalanceRes = await axios.get(`${API_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const finalBalance = finalBalanceRes.data.balance;
        console.log(`Final Balance: ${finalBalance.toLocaleString('vi-VN')} VND`);

        const diff = initialBalance - finalBalance;
        console.log(`📉 Balance Diff: ${diff.toLocaleString('vi-VN')} VND`);

        if (diff === investAmount) {
            console.log('✅ PASS: Correct deduction.');
        } else if (diff === investAmount * 2) {
            console.log('❌ FAIL: DOUBLE DEDUCTION DETECTED!');
        } else {
            console.log(`⚠️ WARNING: Unexpected diff: ${diff}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testInvestment();
