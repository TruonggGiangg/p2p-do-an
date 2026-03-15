import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditScore, CreditScoreSchema } from './schemas/credit-score.schema';
import { CreditScoreHistory, CreditScoreHistorySchema } from './schemas/credit-score-history.schema';
import { CreditScoreService } from './credit-score.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditScore.name, schema: CreditScoreSchema },
      { name: CreditScoreHistory.name, schema: CreditScoreHistorySchema },
    ]),
  ],
  providers: [CreditScoreService],
  exports: [CreditScoreService],
})
export class CreditScoreModule {}
