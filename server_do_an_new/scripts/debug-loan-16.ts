
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanApplication } from '../src/modules/loan/schemas/loan-application.schema';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const loanModel = app.get<Model<LoanApplication>>(getModelToken(LoanApplication.name));

    const fineractLoanId = 16;
    const loan = await loanModel.findOne({ fineractLoanId }).lean();

    if (!loan) {
        console.log(`Loan #${fineractLoanId} not found in MongoDB`);
    } else {
        console.log(`Loan #${fineractLoanId} found:`);
        console.log(`Status: ${loan.status}`);
        console.log(`Documents count: ${loan.documents?.length}`);
        loan.documents?.forEach((d, i) => {
            console.log(`Document [${i}]:`);
            console.log(`  Name: ${d.name}`);
            console.log(`  documentTypeId: ${d.documentTypeId} (type: ${typeof d.documentTypeId})`);
            console.log(`  fineractDocumentId: ${d.fineractDocumentId} (type: ${typeof d.fineractDocumentId})`);
            console.log(`  reviewStatus: ${d.reviewStatus}`);
        });
    }

    await app.close();
}

bootstrap();
