import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvestController } from './invest.controller';
import { InvestService } from './invest.service';
import { InvestmentContractService } from './investment-contract.service';
import { MatchingService } from './matching.service';
import { InvestmentOrder, InvestmentOrderSchema } from './schemas/investment-order.schema';
import { InvestmentContract, InvestmentContractSchema } from './schemas/investment-contract.schema';
import { LoanModule } from '../loan/loan.module';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InvestmentOrder.name, schema: InvestmentOrderSchema },
      { name: InvestmentContract.name, schema: InvestmentContractSchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
    ]),
    forwardRef(() => LoanModule),
  ],
  controllers: [InvestController],
  providers: [InvestService, InvestmentContractService, MatchingService],
  exports: [InvestService, InvestmentContractService, MatchingService],
})
export class InvestModule {}

