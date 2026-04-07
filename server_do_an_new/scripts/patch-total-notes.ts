import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanApplication } from '../src/modules/loan/schemas/loan-application.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const loanModel: Model<LoanApplication> = app.get(getModelToken(LoanApplication.name));
  
  console.log('Finding approved loans to patch...');
  const loans = await loanModel.find({ status: 'approved' });
  let patched = 0;
  
  for (const loan of loans) {
    if (!loan.totalNotes || loan.totalNotes <= 0) {
      const calculatedTotalNotes = Math.ceil((loan.capital || 0) / 500000);
      loan.totalNotes = calculatedTotalNotes;
      await loan.save();
      console.log(`Patched Loan ${loan._id} (capital: ${loan.capital}) -> totalNotes: ${calculatedTotalNotes}`);
      patched++;
    }
  }
  
  console.log(`Successfully patched ${patched} loans!`);
  await app.close();
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
