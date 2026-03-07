import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AdminService } from '../src/modules/admin/admin.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanApplication } from '../src/modules/loan/schemas/loan-application.schema';

async function verify() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const adminService = app.get(AdminService);
    const loanModel = app.get<Model<LoanApplication>>(getModelToken('LoanApplication'));

    console.log('--- BEFORE VERIFICATION (Loan #18) ---');
    const loanBefore = await loanModel.findOne({ fineractLoanId: 18 }).lean();
    console.log('Documents:', JSON.stringify(loanBefore?.documents, null, 2));

    console.log('\n--- CALLING canApproveLoan(18) to trigger auto-healing ---');
    const result = await adminService.canApproveLoan(18);
    console.log('Result:', JSON.stringify(result, null, 2));

    console.log('\n--- AFTER VERIFICATION (Loan #18) ---');
    const loanAfter = await loanModel.findOne({ fineractLoanId: 18 }).lean();
    console.log('Documents:', JSON.stringify(loanAfter?.documents, null, 2));

    await app.close();
}

verify().catch(console.error);
