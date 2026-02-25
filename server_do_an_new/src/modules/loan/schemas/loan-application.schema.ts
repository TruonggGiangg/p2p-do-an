import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoanApplicationStatus = 'pending' | 'approved' | 'rejected' | 'disbursed' | 'cancelled' | 'closed';

export interface ScheduleItem {
  period: number;
  principal: number;
  interest: number;
  total: number;
  remainingAfter: number;
  dueDate?: string;
}

@Schema({ timestamps: true, collection: 'loan_applications' })
export class LoanApplication extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  productId: number;

  @Prop({ required: true })
  capital: number;

  @Prop({ required: true })
  periodMonth: number;

  @Prop({ required: true })
  monthlyRatePercent: number;

  @Prop({ default: 'Declining Balance' })
  interestType: string;

  @Prop({ default: 1000 })
  inMultiplesOf: number;

  @Prop({ required: false })
  willing?: string;

  @Prop({ required: true })
  disbursementDate: string;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  disbursementWalletId: Types.ObjectId;

  @Prop({ type: String, default: 'pending' })
  status: LoanApplicationStatus;

  @Prop({ type: [Object], default: [] })
  schedulePreview: ScheduleItem[];

  @Prop({ default: 0 })
  monthlyPay: number;

  @Prop({ default: 0 })
  entirelyPay: number;

  @Prop({ type: [Object], default: [] })
  documents: Array<{
    documentTypeId: string;
    name: string;
    uri?: string;
    fineractDocumentId?: number;
    uploadedAt?: Date;
    /** Trạng thái duyệt: pending | approved | rejected */
    reviewStatus?: 'pending' | 'approved' | 'rejected';
    reviewedAt?: Date;
  }>;

  @Prop({ required: false })
  fineractLoanId?: number;

  @Prop({ type: [Object], default: [] })
  repaymentHistory: Array<{
    amount: number;
    date: string;
    type: 'repayment' | 'prepayment';
    fineractTransactionId?: number;
    breakdown?: {
      principal?: number;
      interest?: number;
      fees?: number;
      penalty?: number;
    };
    createdAt: Date;
  }>;
}

export const LoanApplicationSchema = SchemaFactory.createForClass(LoanApplication);
LoanApplicationSchema.index({ userId: 1, status: 1 });
LoanApplicationSchema.index({ productId: 1 });
LoanApplicationSchema.index({ createdAt: -1 });
