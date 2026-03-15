import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'credit_scores', versionKey: false })
export class CreditScore extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 650, min: 300, max: 850 })
  score: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  totalLoans: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  latePayments: number;

  @Prop({ type: Date, required: true, default: Date.now, index: true })
  lastUpdated: Date;
}

export const CreditScoreSchema = SchemaFactory.createForClass(CreditScore);
CreditScoreSchema.index({ userId: 1 }, { unique: true });
