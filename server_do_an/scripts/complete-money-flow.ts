/**
 * Complete Money Flow Comparison: LOAN_170 vs LOAN_115
 * Trace từ Escrow Account để so sánh luồng tiền
 */
import mongoose from 'mongoose';
import axios from 'axios';

const MONGODB_URI = 'mongodb+srv://pnttoan1474:hcLcr7dk65Ry1g3s@cluster0.o63zzed.mongodb.net/TestP2PLending';
const FINERACT_URL = 'http://118.69.41.95:8080';
const KEYCLOAK_URL = 'http://118.69.41.95:9000';

const ESCROW_ACCOUNT = 1;
const LENDER_SAVINGS = 3;

async function getToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', 'community-app');
    params.append('client_secret', '123');
    params.append('username', 'mifos');
    params.append('password', 'password');

    const resp = await axios.post(
        `${KEYCLOAK_URL}/realms/fineract/protocol/openid-connect/token`,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return resp.data.access_token;
}

async function traceLoanFlow(loanId: number, headers: any) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 LOAN ${loanId} - COMPLETE MONEY FLOW`);
    console.log('═'.repeat(60));

    // 1. Loan details
    const loanResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/loans/${loanId}?associations=all`,
        { headers }
    );
    const loan = loanResp.data;
    console.log(`\n[LOAN ${loanId}] externalId: ${loan.externalId}`);
    console.log(`  Principal: ${loan.principal.toLocaleString()} VND`);
    console.log(`  Interest: ${loan.summary?.totalInterestCharged || 0} VND`);
    console.log(`  Total Expected: ${loan.summary?.totalExpectedRepayment || 0} VND`);

    // 2. Loan transactions
    console.log(`\n[LOAN TRANSACTIONS]:`);
    (loan.transactions || []).forEach((t: any) => {
        console.log(`  ${t.id}: ${t.type?.value} - ${t.amount.toLocaleString()} VND`);
    });

    // 3. Escrow transactions matching this loan
    const escrowResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${ESCROW_ACCOUNT}?associations=all`,
        { headers }
    );
    const escrowTxns = escrowResp.data?.transactions || [];

    const loanEscrowTxns = escrowTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        return note.includes(String(loanId)) || note.includes(loan.externalId?.toLowerCase() || 'xxx');
    });

    console.log(`\n[ESCROW TRANSACTIONS] for loan ${loanId}:`);

    let đầuTư = 0, giảiNgân = 0, tràNợ = 0, phânPhối = 0;

    loanEscrowTxns.forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        const type = t.transactionType?.withdrawal ? 'OUT' : 'IN';
        const amount = t.amount;

        console.log(`  ${t.id}: ${type} ${amount.toLocaleString()} VND`);
        console.log(`      → ${note.substring(0, 70)}`);

        // Categorize
        const noteLower = note.toLowerCase();
        if (noteLower.includes('escrow') && type === 'IN') {
            đầuTư += amount;
        } else if (noteLower.includes('disburs') && type === 'OUT') {
            giảiNgân += amount;
        } else if (noteLower.includes('prepay') || noteLower.includes('repay')) {
            if (type === 'IN') {
                tràNợ += amount;
            }
        }
        if ((noteLower.includes('distribution') || noteLower.includes('repayment distribution')) && type === 'OUT') {
            phânPhối += amount;
        }
    });

    // 4. Lender Savings transactions matching this loan
    const lenderResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/savingsaccounts/${LENDER_SAVINGS}?associations=all`,
        { headers }
    );
    const lenderTxns = lenderResp.data?.transactions || [];

    const loanLenderTxns = lenderTxns.filter((t: any) => {
        const note = (t.transfer?.transferDescription || t.note || '').toLowerCase();
        return note.includes(String(loanId)) || note.includes(loan.externalId?.toLowerCase() || 'xxx');
    });

    console.log(`\n[LENDER SAVINGS TRANSACTIONS] for loan ${loanId}:`);
    loanLenderTxns.forEach((t: any) => {
        const note = t.transfer?.transferDescription || t.note || '';
        const type = t.transactionType?.withdrawal ? 'OUT' : 'IN';
        console.log(`  ${t.id}: ${type} ${t.amount.toLocaleString()} VND`);
        console.log(`      → ${note.substring(0, 70)}`);
    });

    // 5. FD accounts for this loan
    console.log(`\n[FD ACCOUNTS]:`);
    // Search FD by externalId pattern
    const fdPattern = `FD_LOAN_${loanId}`;
    const clientsResp = await axios.get(
        `${FINERACT_URL}/fineract-provider/api/v1/clients/3/accounts`,
        { headers }
    );
    const lenderAccounts = clientsResp.data;
    const fds = (lenderAccounts.savingsAccounts || []).filter((a: any) =>
        a.depositType?.id === 200 &&
        (a.externalId?.includes(fdPattern) || a.externalId?.includes(`LOAN_${loanId}`))
    );

    let hoànVốnFD = 0;
    for (const fd of fds) {
        console.log(`  FD ${fd.id}: ${fd.externalId}`);
        console.log(`    Status: ${fd.status?.value}, Balance: ${fd.accountBalance || 0}`);

        // Get FD transactions
        try {
            const fdResp = await axios.get(
                `${FINERACT_URL}/fineract-provider/api/v1/fixeddepositaccounts/${fd.id}?associations=transactions`,
                { headers }
            );
            const fdData = fdResp.data;
            if (fdData.status?.value?.toLowerCase().includes('closed')) {
                hoànVốnFD += fdData.depositAmount || 0;
            }
            console.log(`    Transactions:`);
            (fdData.transactions || []).forEach((t: any) => {
                console.log(`      - ${t.id}: ${t.transactionType?.value} ${t.amount}`);
            });
        } catch (e: any) {
            console.log(`    (Could not fetch FD details)`);
        }
    }

    // 6. Summary
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`LOAN ${loanId} SUMMARY:`);
    console.log(`  Đầu tư (Escrow IN):     ${đầuTư.toLocaleString()} VND`);
    console.log(`  Giải ngân (Escrow OUT): ${giảiNgân.toLocaleString()} VND`);
    console.log(`  Trả nợ (Escrow IN):     ${tràNợ.toLocaleString()} VND`);
    console.log(`  Phân phối (Escrow OUT): ${phânPhối.toLocaleString()} VND ← KEY!`);
    console.log(`  Hoàn vốn FD:            ${hoànVốnFD.toLocaleString()} VND`);
    console.log('─'.repeat(40));

    return { đầuTư, giảiNgân, tràNợ, phânPhối, hoànVốnFD };
}

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const token = await getToken();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'fineract-platform-tenantid': 'default'
    };

    // Compare both loans
    const flow170 = await traceLoanFlow(170, headers);
    const flow115 = await traceLoanFlow(115, headers);

    console.log('\n\n' + '═'.repeat(60));
    console.log('📊 COMPARISON: LOAN_170 vs LOAN_115');
    console.log('═'.repeat(60));
    console.log('\n         LOAN_170      LOAN_115      DIFF');
    console.log('─'.repeat(60));
    console.log(`Đầu tư:   ${flow170.đầuTư.toString().padEnd(12)} ${flow115.đầuTư.toString().padEnd(12)} ${flow170.đầuTư - flow115.đầuTư}`);
    console.log(`Giải ngân: ${flow170.giảiNgân.toString().padEnd(12)} ${flow115.giảiNgân.toString().padEnd(12)} ${flow170.giảiNgân - flow115.giảiNgân}`);
    console.log(`Trả nợ:    ${flow170.tràNợ.toString().padEnd(12)} ${flow115.tràNợ.toString().padEnd(12)} ${flow170.tràNợ - flow115.tràNợ}`);
    console.log(`Phân phối: ${flow170.phânPhối.toString().padEnd(12)} ${flow115.phânPhối.toString().padEnd(12)} ${flow170.phânPhối - flow115.phânPhối}`);
    console.log(`Hoàn vốn:  ${flow170.hoànVốnFD.toString().padEnd(12)} ${flow115.hoànVốnFD.toString().padEnd(12)} ${flow170.hoànVốnFD - flow115.hoànVốnFD}`);

    console.log('\n\n📌 KEY INSIGHT:');
    console.log('Phân phối = Escrow withdrawals with "distribution" in note');
    console.log('If LOAN_170 has 0 Phân phối but LOAN_115 has value → BUG in repayment flow');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
