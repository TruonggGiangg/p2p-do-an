import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoanDelinquencyStatus = 'normal' | 'overdue' | 'defaulted' | 'resolved';
export type LoanCollectionStage = 'none' | 'reminder' | 'warning' | 'collection' | 'legal';

@Schema({ timestamps: true, collection: 'loan_delinquency' })
export class LoanDelinquency extends Document {
  @Prop({ type: Types.ObjectId, ref: 'LoanApplication', required: true, index: true })
  loanId: Types.ObjectId;

  @Prop({ required: true, index: true, unique: true })
  fineractLoanId: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  borrowerId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  delinquentDays: number;

  @Prop({ required: true, default: 0 })
  debtGroup: number;

  @Prop({ required: true, default: 0 })
  overdueAmount: number;

  @Prop({ required: false })
  firstOverdueDate?: Date;

  @Prop({ required: false })
  lastOverdueDate?: Date;

  @Prop({ required: true, enum: ['normal', 'overdue', 'defaulted', 'resolved'], default: 'normal' })
  status: LoanDelinquencyStatus;

  @Prop({ required: true, enum: ['none', 'reminder', 'warning', 'collection', 'legal'], default: 'none' })
  collectionStage: LoanCollectionStage;

  @Prop({ required: true, default: () => new Date(), index: true })
  lastSyncedAt: Date;

  @Prop({ required: false })
  resolvedAt?: Date;

  @Prop({ required: true, default: false, index: true })
  isDeleted: boolean;

  @Prop({ required: false })
  deletedAt?: Date;
}

export const LoanDelinquencySchema = SchemaFactory.createForClass(LoanDelinquency);
LoanDelinquencySchema.index({ status: 1, debtGroup: 1, overdueAmount: -1 });
LoanDelinquencySchema.index({ borrowerId: 1, lastSyncedAt: -1 });
