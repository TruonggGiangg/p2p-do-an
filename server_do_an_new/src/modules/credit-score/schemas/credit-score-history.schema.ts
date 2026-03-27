import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditScoreHistoryReason =
  | 'initial_account_creation'
  | 'loan_repayment'
  | 'loan_prepayment'
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

  @Prop({ type: Number, required: true, min: 150, max: 750 })
  afterScore: number;

  @Prop({ type: Number, required: true, default: 0 })
  changeAmount: number;

  @Prop({
    type: String,
    required: true,
    enum: [
      'initial_account_creation',
      'loan_repayment',
      'loan_prepayment',
      'late_payment',
      'manual_adjustment',
      'system_recalculation',
    ],
    default: 'initial_account_creation',
  })
  reason: CreditScoreHistoryReason;

  @Prop({ type: String, required: true, default: 'system' })
  trigger: string;

  @Prop({ type: String })
  note?: string;

  /** 5 factor scores at the time of this event */
  @Prop({
    type: {
      paymentHistory: { type: Number, default: 0 },
      debtLevel: { type: Number, default: 0 },
      creditAge: { type: Number, default: 0 },
      creditMix: { type: Number, default: 0 },
      newCredit: { type: Number, default: 0 },
    },
  })
  factors?: {
    paymentHistory: number;
    debtLevel: number;
    creditAge: number;
    creditMix: number;
    newCredit: number;
  };

  createdAt: Date;
}

export const CreditScoreHistorySchema = SchemaFactory.createForClass(CreditScoreHistory);
CreditScoreHistorySchema.index({ userId: 1, createdAt: -1 });
