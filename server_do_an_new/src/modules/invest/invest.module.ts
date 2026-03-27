import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvestController } from './invest.controller';
import { InvestService } from './invest.service';
import { InvestmentContractService } from './investment-contract.service';
import { InvestPaymentService } from './invest-payment.service';
import { InvestStatsService } from './invest-stats.service';
import { MatchingService } from './matching.service';
import { InvestmentOrder, InvestmentOrderSchema } from './schemas/investment-order.schema';
import { InvestmentContract, InvestmentContractSchema } from './schemas/investment-contract.schema';
import { LoanModule } from '../loan/loan.module';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { LoanDelinquency, LoanDelinquencySchema } from '../delinquency/entities/loan-delinquency.schema';
import { FineractModule } from '../fineract/fineract.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InvestmentOrder.name, schema: InvestmentOrderSchema },
      { name: InvestmentContract.name, schema: InvestmentContractSchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
      { name: User.name, schema: UserSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: LoanDelinquency.name, schema: LoanDelinquencySchema },
    ]),
    forwardRef(() => LoanModule),
    FineractModule,
  ],
  controllers: [InvestController],
  providers: [InvestService, InvestmentContractService, InvestPaymentService, InvestStatsService, MatchingService],
  exports: [InvestService, InvestmentContractService, InvestPaymentService, InvestStatsService, MatchingService],
})
export class InvestModule {}
