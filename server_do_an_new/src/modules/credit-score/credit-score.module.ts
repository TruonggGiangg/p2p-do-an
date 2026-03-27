import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditScore, CreditScoreSchema } from './schemas/credit-score.schema';
import { CreditScoreHistory, CreditScoreHistorySchema } from './schemas/credit-score-history.schema';
import { LoanEvaluationConfig, LoanEvaluationConfigSchema } from './schemas/loan-evaluation-config.schema';
import { CreditScoreService } from './credit-score.service';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { LoanDelinquency, LoanDelinquencySchema } from '../delinquency/entities/loan-delinquency.schema';
import { DelinquencyPolicy, DelinquencyPolicySchema } from '../delinquency/entities/delinquency-policy.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditScore.name, schema: CreditScoreSchema },
      { name: CreditScoreHistory.name, schema: CreditScoreHistorySchema },
      { name: LoanEvaluationConfig.name, schema: LoanEvaluationConfigSchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
      { name: User.name, schema: UserSchema },
      { name: LoanDelinquency.name, schema: LoanDelinquencySchema },
      { name: DelinquencyPolicy.name, schema: DelinquencyPolicySchema },
    ]),
  ],
  providers: [CreditScoreService],
  exports: [CreditScoreService],
})
export class CreditScoreModule {}
