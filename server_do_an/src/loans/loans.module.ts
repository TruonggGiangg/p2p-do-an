import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoansController } from './loans.controller';
import { LoansService } from './services/loans.service';
import { HyperledgerService } from './services/hyperledger.service';
import { LoanCalculationService } from './services/loan-calculation.service';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { AuthModule } from '@auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Loan.name, schema: LoanSchema }]),
    AuthModule,
    ThrottlerModule,
  ],
  controllers: [LoansController],
  providers: [LoansService, HyperledgerService, LoanCalculationService],
  exports: [LoansService, HyperledgerService, LoanCalculationService],
})
export class LoansModule {}

