import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BnplLoanStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  ACTIVE = 'active', // Đã giải ngân
  CLOSED = 'closed', // Đã thanh toán hết
  OVERPAID = 'overpaid',
  WRITTEN_OFF = 'written_off',
}

@Schema({ timestamps: true, collection: 'bnpl_loans' })
export class BnplLoan extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'BnplWallet',
    required: true,
    index: true,
  })
  walletId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  fineractLoanId: string; // ID khoản vay trong Fineract

  @Prop({ required: true, min: 0 })
  principal: number; // Số tiền vốn gốc

  @Prop({ required: true, default: 0, min: 0 })
  totalInterest: number; // Tổng lãi (cache từ Fineract, không phải source of truth)

  @Prop({ required: true, min: 0 })
  totalRepayment: number; // Tổng phải trả = vốn + lãi (cache từ Fineract)

  @Prop({ required: true, default: 0, min: 0 })
  paidAmount: number; // Số tiền đã trả (cache từ Fineract)

  @Prop({ required: true, min: 1 })
  numberOfRepayments: number; // Số kỳ trả nợ

  @Prop({
    type: String,
    enum: BnplLoanStatus,
    default: BnplLoanStatus.PENDING_APPROVAL,
  })
  status: BnplLoanStatus;

  @Prop()
  description?: string; // Mô tả giao dịch (e.g., "Mua iPhone 15")

  @Prop()
  disbursedAt?: Date; // Ngày giải ngân
}

export const BnplLoanSchema = SchemaFactory.createForClass(BnplLoan);

// Compound indexes for efficient queries
BnplLoanSchema.index({ walletId: 1, status: 1 }); // Get loans by wallet and status
BnplLoanSchema.index({ userId: 1, status: 1 }); // Get loans by user and status
BnplLoanSchema.index({ fineractLoanId: 1 }); // Already unique, but explicit index for lookups
BnplLoanSchema.index({ createdAt: -1 }); // For sorting by creation date (newest first)
BnplLoanSchema.index({ disbursedAt: -1 }); // For sorting by disbursement date
