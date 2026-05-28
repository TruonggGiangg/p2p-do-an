import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BnplPaymentOperationType {
  REPAYMENT = 'repayment',
  PREPAYMENT = 'prepayment',
}

export enum BnplPaymentOperationStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'bnpl_payment_operations' })
export class BnplPaymentOperation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'BnplLoan', required: true, index: true })
  loanId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BnplPaymentOperationType, required: true, index: true })
  operationType: BnplPaymentOperationType;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: String, enum: BnplPaymentOperationStatus, default: BnplPaymentOperationStatus.PENDING, index: true })
  status: BnplPaymentOperationStatus;

  @Prop({ type: Object, default: null })
  requestPayload?: Record<string, any> | null;

  @Prop({ type: Object, default: null })
  responsePayload?: Record<string, any> | null;

  @Prop()
  errorMessage?: string;

  @Prop()
  fineractTransactionId?: number;
}

export const BnplPaymentOperationSchema = SchemaFactory.createForClass(BnplPaymentOperation);
BnplPaymentOperationSchema.index({ loanId: 1, operationType: 1, idempotencyKey: 1 }, { unique: true });
BnplPaymentOperationSchema.index({ userId: 1, createdAt: -1 });
