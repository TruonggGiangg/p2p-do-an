import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'credit_score_weight_configs',
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: true },
})
export class CreditScoreWeightConfig extends Document {
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  paymentHistory: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  debtLevel: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  creditAge: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  creditMix: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  newCredit: number;

  @Prop({ type: String, required: true, default: 'default', unique: true, index: true })
  key: string;

  createdAt: Date;
  updatedAt: Date;
}

export const CreditScoreWeightConfigSchema = SchemaFactory.createForClass(CreditScoreWeightConfig);
CreditScoreWeightConfigSchema.index({ key: 1 }, { unique: true });
