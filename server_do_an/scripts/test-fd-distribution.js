import axios from 'axios';

/**
 * P2P Flow Test Script - FD Tracking with Direct Distribution
 * 
 * 1. Setup: 2 Lenders, 1 Borrower
 * 2. Borrower: Create 1M VND Loan (12 months)
 * 3. Lenders: Each invest 500k VND (Fixed Deposit)
 * 4. Repayment: Simulating month-by-month distribution
 */

const BASE_URL = 'http://localhost:3000/api'; // Adjust to your local port
const AUTH_URL = 'http://localhost:3001/auth'; // Adjust if auth is separate

async function runTest() {
    console.log('🚀 Starting P2P FD Direct Distribution Test...');

    try {
        // --- STEP 1: LOGIN / PREPARE ACCOUNTS ---
        // Note: For this script, we assume lenders and borrower are already registered/active
        // These IDs would come from your Keycloak or User DB
        const borrowerId = 'borrower-test-uuid'; 
        const lender1Id = 'lender-1-uuid';
        const lender2Id = 'lender-2-uuid';

        // --- STEP 2: CREATE LOAN (1,000,000 VND, 12 Months) ---
        console.log('\n--- Step 2: Creating 1,000,000 VND Loan (12 months) ---');
        const loanResponse = await axios.post(`${BASE_URL}/loans/create`, {
            borrowerId: borrowerId,
            capital: 1000000,
            term: 12,
            rate: 18, // 18% Annual
            purpose: 'Test Direct Distribution',
            disbursementDate: new Date().toISOString()
        });
        
        const loan = loanResponse.data;
        const loanContractId = loan.contractId;
        console.log(`✅ Loan Created: ${loanContractId} (Fineract: ${loan.fineractLoanId})`);

        // --- STEP 3: INVESTMENTS (2 Lenders x 500k) ---
        console.log('\n--- Step 3: Lenders investing 500,000 VND each ---');
        
        const investLender = async (lenderId, amount) => {
            const res = await axios.post(`${BASE_URL}/invest/create`, {
                lenderId: lenderId,
                loanContractId: loan._id,
                amount: amount,
                notes: 1 // 1 node = 500k
            });
            console.log(`✅ Lender ${lenderId} invested ${amount} (FD: ${res.data.fineractFixedDepositAccountNo})`);
            return res.data;
        };

        const inv1 = await investLender(lender1Id, 500000);
        const inv2 = await investLender(lender2Id, 500000);

        // --- STEP 4: DISBURSEMENT ---
        console.log('\n--- Step 4: Disbursing Loan ---');
        await axios.post(`${BASE_URL}/loans/disburse/${loanContractId}`);
        console.log(`✅ Loan ${loanContractId} Disbursed.`);

        // --- STEP 5: SIMULATE REPAYMENTS (Periodic) ---
        console.log('\n--- Step 5: Simulating Regular Repayments (Full P+I) ---');
        
        // Month 1 Repayment
        // Expected ~92k (Principal ~76k, Interest ~15k for 18% rate)
        const repayAmount = 91680; 
        const repayRes = await axios.post(`${BASE_URL}/repayment/process`, {
            loanId: loanContractId,
            amount: repayAmount,
            date: new Date().toISOString()
        });

        console.log('✅ Repayment 1 Processed:');
        repayRes.data.distributions.forEach(dist => {
            console.log(`   - Distributed to ${dist.lenderId}: ${dist.amount.toLocaleString()} VND (P: ${dist.principal}, I: ${dist.interest})`);
        });

        // --- STEP 6: VERIFY TRACKING STATUS ---
        console.log('\n--- Step 6: Verifying Tracked Balances in MongoDB ---');
        const invStatus = await axios.get(`${BASE_URL}/invest/detail/${inv1.contractId}`);
        console.log(`📊 Lender 1 Tracked Balance: ${invStatus.data.fixedDepositTrackedBalance.toLocaleString()} VND`);
        console.log(`📊 Lender 1 Total Distributed: ${invStatus.data.totalPrincipalDistributed.toLocaleString()} VND`);

        console.log('\n✨ Test Sequence Completed Successfully!');
        
    } catch (error) {
        console.error('\n❌ Test Failed:', error.response?.data || error.message);
    }
}

runTest();
