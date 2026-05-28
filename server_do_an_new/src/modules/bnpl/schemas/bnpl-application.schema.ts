import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BnplApplicationStatus {
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'bnpl_applications' })
export class BnplApplication extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: BnplApplicationStatus,
    default: BnplApplicationStatus.SUBMITTED,
    index: true,
  })
  status: BnplApplicationStatus;

  @Prop({ min: 0 })
  requestedLimit?: number;

  @Prop({ min: 0 })
  approvedLimit?: number;

  @Prop({ min: 0 })
  income?: number;

  @Prop()
  occupation?: string;

  @Prop()
  purpose?: string;

  @Prop()
  address?: string;

  @Prop({ min: 1, max: 12 })
  requestedTermMonths?: number;

  @Prop({ type: Object, default: null })
  kycSnapshot?: Record<string, any> | null;

  @Prop({ type: Object, default: null })
  creditScoreSnapshot?: Record<string, any> | null;

  @Prop({ type: Object, default: null })
  incomeSnapshot?: Record<string, any> | null;

  @Prop({ type: Object, default: null })
  existingDebtSnapshot?: Record<string, any> | null;

  @Prop({ type: Object, default: null })
  riskDecision?: Record<string, any> | null;

  @Prop({ type: [String], default: [] })
  riskReasons: string[];

  @Prop({ default: Date.now })
  submittedAt: Date;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  signedAt?: Date;

  @Prop()
  signatureText?: string;

  @Prop()
  rejectReason?: string;
}

export const BnplApplicationSchema = SchemaFactory.createForClass(BnplApplication);

BnplApplicationSchema.index({ userId: 1, status: 1 });
BnplApplicationSchema.index({ createdAt: -1 });
