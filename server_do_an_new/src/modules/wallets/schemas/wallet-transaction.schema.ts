import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * WalletTransaction — Lưu vết giao dịch ví trên MongoDB.
 * Fineract là source-of-truth cho số dư, nhưng MongoDB lưu lịch sử song song
 * để đối soát, audit, và hiển thị nhanh cho client.
 */
@Schema({ timestamps: true, collection: 'wallet_transactions' })
export class WalletTransaction extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  fineractSavingsId: string;

  @Prop({ type: Number })
  fineractTransactionId?: number;

  @Prop({
    required: true,
    enum: ['withdrawal', 'deposit', 'transfer_out', 'transfer_in', 'repayment', 'prepayment', 'disbursement'],
  })
  type: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ type: Number })
  balanceBefore?: number;

  @Prop({ type: Number })
  balanceAfter?: number;

  @Prop({ type: String })
  note?: string;

  /** Reference to loan if applicable */
  @Prop({ type: Types.ObjectId, ref: 'LoanApplication' })
  loanId?: Types.ObjectId;

  @Prop({ type: Number })
  fineractLoanId?: number;

  @Prop({ type: String })
  otpSessionId?: string;

  @Prop({ required: true, enum: ['success', 'failed', 'pending'], default: 'success' })
  status: string;

  @Prop({ type: String })
  failureReason?: string;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ fineractSavingsId: 1, createdAt: -1 });
