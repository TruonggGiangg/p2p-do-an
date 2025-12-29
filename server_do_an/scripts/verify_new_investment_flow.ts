
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InvestService } from '../src/invest/invest.service';
import { LoanService } from '../src/loan/loan.service';
import { WalletService } from '../src/wallet/services/wallet.service';
import { FineractService } from '../src/loan/services/fineract.service';
import { Types } from 'mongoose';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const investService = app.get(InvestService);
    const loanService = app.get(LoanService);
    const walletService = app.get(WalletService);
    const fineractService = app.get(FineractService);

    console.log('🚀 STARTING END-TO-END INVESTMENT FLOW TEST');
    console.log('-------------------------------------------');

    try {
        // 1. Setup Actors
        const lenderInternalId = '0987654321'; // Lender User ID (Keycloak/Mongo) - Client 3
        const loanAmount = 5000000;
        const investmentAmount = 1000000; // 2 notes * 500k

        // Get initial balance
        const initialBalance = await walletService.getWalletBalance(lenderInternalId);
        console.log(`💰 Initial Lender Balance: ${initialBalance.balance.toLocaleString('vi-VN')} VND`);

        // 2. Create Loan (Mocking Loan Creation)
        console.log('\n📝 Creating Test Loan...');
        // Note: In real flow, borrower creates loan. Here we assume a loan exists or find one waiting.
        // For simplicity, let's find a waiting loan or create a dummy one logic if needed.
        // Actually, let's just pick the LATEST WAITING LOAN to invest in.

        const AVAILABLE_LOAN = await loanService['loanModel'].findOne({ status: 'waiting' }).sort({ createdAt: -1 });

        if (!AVAILABLE_LOAN) {
            console.error('❌ No waiting loans found to test investment. Please create a loan first.');
            process.exit(1);
        }
        console.log(`✅ Found Waiting Loan: ${AVAILABLE_LOAN.contractId} (${AVAILABLE_LOAN.capital} VND)`);


        // 3. Perform Investment
        console.log(`\n💸 Investigating ${investmentAmount.toLocaleString('vi-VN')} VND...`);

        // Mock user object matching what controller passes
        const mockUser = {
            _id: lenderInternalId,
            keycloakUserId: 'f6b4a266-80dc-4743-967b-c99d57c0bdbc',
            username: 'lender_test',
            fineractClientId: 3, // Ensure this matches your test lender
            email: 'lender@test.com'
        };

        const investDto = {
            loanContractId: AVAILABLE_LOAN.contractId,
            capital: investmentAmount, // will be ignored if numNotes provided, but good for DTO
            numNotes: 2
        };

        const result = await investService.createInvestment(mockUser, investDto);
        console.log('✅ Investment Function Executed successfully');
        console.log('Result:', JSON.stringify(result, null, 2));

        // 4. Verify Balances (Crucial Step)
        console.log('\n🔍 Verifying Balances after Investment...');

        // Wait a bit for Fineract async processing if any
        await new Promise(r => setTimeout(r, 2000));

        const finalBalance = await walletService.getWalletBalance(lenderInternalId);
        console.log(`💰 Final Lender Balance: ${finalBalance.balance.toLocaleString('vi-VN')} VND`);

        const diff = initialBalance.balance - finalBalance.balance;
        console.log(`📉 Balance Decrease: ${diff.toLocaleString('vi-VN')} VND`);

        if (diff === investmentAmount) {
            console.log('✅ SUCCESS: Balance decreased exactly by investment amount. No Double Deduction!');
        } else if (diff === investmentAmount * 2) {
            console.log('❌ FAIL: Balance decreased by DOUBLE the investment amount! Double Deduction Bug exists.');
        } else {
            console.log(`⚠️ WARNING: Balance decreased by unexpected amount. Check fees or other transactions.`);
        }

    } catch (error) {
        console.error('❌ ERROR:', error);
    } finally {
        await app.close();
        process.exit(0);
    }
}

bootstrap();
