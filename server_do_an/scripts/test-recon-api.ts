/**
 * Test reconciliation API directly
 */
import axios from 'axios';

async function main() {
    console.log('Testing reconciliation API for LOAN_170...\n');

    try {
        const resp = await axios.get('http://localhost:4000/reconciliation/loan/LOAN_170/p2p-view');
        const data = resp.data;

        console.log('Response received!');
        console.log('Loan:', data.loan?.loanId);
        console.log('Transactions count:', data.transactions?.length);
        console.log('\nSummary:');
        console.log('  đầuTư:', data.summary?.đầuTư);
        console.log('  giảiNgân:', data.summary?.giảiNgân);
        console.log('  tràNợ:', data.summary?.tràNợ);
        console.log('  phânPhối:', data.summary?.phânPhối, '← Should be 80000');
        console.log('  hoànVốnFD:', data.summary?.hoànVốnFD);
        console.log('  lợiNhuận:', data.summary?.lợiNhuận);

        console.log('\nTransactions:');
        (data.transactions || []).forEach((t: any) => {
            console.log(`  ${t.transactionType}: ${t.amount} - ${t.p2pContext}`);
        });

    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

main();
