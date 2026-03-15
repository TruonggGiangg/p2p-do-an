import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditScoreHistoryReason =
  | 'initial_account_creation'
  | 'loan_repayment'
  | 'late_payment'
  | 'manual_adjustment'
  | 'system_recalculation';

@Schema({
  collection: 'credit_score_histories',
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: false },
})
export class CreditScoreHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CreditScore', required: true, index: true })
  creditScoreId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  beforeScore: number | null;

  @Prop({ type: Number, required: true, min: 300, max: 850 })
  afterScore: number;

  @Prop({ type: Number, required: true, default: 0 })
  changeAmount: number;

  @Prop({
    type: String,
    required: true,
    enum: ['initial_account_creation', 'loan_repayment', 'late_payment', 'manual_adjustment', 'system_recalculation'],
    default: 'initial_account_creation',
  })
  reason: CreditScoreHistoryReason;

  @Prop({ type: String, required: true, default: 'system' })
  trigger: string;

  @Prop({ type: String })
  note?: string;

  createdAt: Date;
}

export const CreditScoreHistorySchema = SchemaFactory.createForClass(CreditScoreHistory);
CreditScoreHistorySchema.index({ userId: 1, createdAt: -1 });
