import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'credit_score_weight_configs',
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: true },
})
export class CreditScoreWeightConfig extends Document {
  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  description?: string;

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

  @Prop({ type: Boolean, default: false, index: true })
  isDefault: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date })
  appliedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const CreditScoreWeightConfigSchema = SchemaFactory.createForClass(CreditScoreWeightConfig);
CreditScoreWeightConfigSchema.index({ key: 1 }, { unique: true });
