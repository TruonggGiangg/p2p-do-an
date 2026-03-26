import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditScore, CreditScoreSchema } from './schemas/credit-score.schema';
import { CreditScoreHistory, CreditScoreHistorySchema } from './schemas/credit-score-history.schema';
import { CreditScoreWeightConfig, CreditScoreWeightConfigSchema } from './schemas/credit-score-weight-config.schema';
import { LoanEvaluationConfig, LoanEvaluationConfigSchema } from './schemas/loan-evaluation-config.schema';
import { CreditScoreService } from './credit-score.service';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditScore.name, schema: CreditScoreSchema },
      { name: CreditScoreHistory.name, schema: CreditScoreHistorySchema },
      { name: CreditScoreWeightConfig.name, schema: CreditScoreWeightConfigSchema },
      { name: LoanEvaluationConfig.name, schema: LoanEvaluationConfigSchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
    ]),
  ],
  providers: [CreditScoreService],
  exports: [CreditScoreService],
})
export class CreditScoreModule {}
