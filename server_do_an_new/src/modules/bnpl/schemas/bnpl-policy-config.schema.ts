import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum BnplInterestType {
  FLAT = 'flat',
  DECLINING_BALANCE = 'declining_balance',
}

@Schema({ collection: 'bnpl_policy_configs', timestamps: true })
export class BnplPolicyConfig extends Document {
  @Prop({ type: Number, required: true, index: true })
  version: number;

  @Prop({ type: Number, required: true, min: 1 })
  loanProductId: number;

  @Prop({ type: Number, required: true, min: 0 })
  creditLimit: number;

  @Prop({ type: Number, required: true, min: 1, max: 12 })
  defaultRepayments: number;

  @Prop({ type: Number, required: true, min: 1, max: 12 })
  minRepayments: number;

  @Prop({ type: Number, required: true, min: 1, max: 12 })
  maxRepayments: number;

  @Prop({ type: Number, required: true, min: 0 })
  minAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  maxAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  monthlyRate: number;

  @Prop({ type: String, enum: BnplInterestType, required: true })
  interestType: BnplInterestType;

  @Prop({ type: Number, default: 0, min: 0 })
  lateFeeRate: number;

  @Prop({ type: Number, default: 0, min: 0 })
  lateFeeFlat: number;

  @Prop({ type: Number, default: 0, min: 0 })
  gracePeriodDays: number;

  @Prop({ type: Number, default: 3, min: 1 })
  maxActiveLoans: number;

  @Prop({ type: Boolean, default: true })
  allowEarlyRepayment: boolean;

  @Prop({ type: Number, default: 1000, min: 1 })
  currencyMultiples: number;

  @Prop({ type: String })
  changedBy?: string;

  @Prop({ type: String })
  changeNote?: string;

  @Prop({ type: String, required: true })
  configHash: string;

  @Prop({ type: String, default: '' })
  blockchainTxHash?: string;
}

export const BnplPolicyConfigSchema = SchemaFactory.createForClass(BnplPolicyConfig);
BnplPolicyConfigSchema.index({ version: -1 });
