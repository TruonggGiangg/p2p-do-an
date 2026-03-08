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

  @Prop({ required: false })
  lastSyncedAt?: Date;

  @Prop({ required: false, default: 0 })
  outstandingAmount?: number;

  @Prop({ required: false, default: 0 })
  totalPenaltyExpected?: number;

  @Prop({ required: false, default: 0 })
  totalFeeExpected?: number;

  @Prop({ required: false, default: 0 })
  totalOverdue?: number;

  @Prop({ required: false, default: 0 })
  principalPaid?: number;

  @Prop({ required: false, default: 0 })
  principalOutstanding?: number;

  @Prop({ required: false, default: 0 })
  interestPaid?: number;

  @Prop({ required: false, default: 0 })
  interestOutstanding?: number;

  @Prop({ required: false, default: 0 })
  feePaid?: number;

  @Prop({ required: false, default: 0 })
  feeOutstanding?: number;

  @Prop({ required: false, default: 0 })
  penaltyPaid?: number;

  @Prop({ required: false, default: 0 })
  penaltyOutstanding?: number;

  @Prop({ required: false, default: 0 })
  totalPaid?: number;

  @Prop({ required: false, default: 0 })
  totalOutstanding?: number;

  @Prop({ type: [Number], required: false })
  lastPaymentDate?: number[];

  @Prop({ required: false, default: 0 })
  lastPaymentAmount?: number;

  @Prop({ required: false, default: 0 })
  delinquentDays?: number;

  @Prop({ required: false })
  delinquencyClassification?: string;

  @Prop({ required: false })
  fineractStatusString?: string;

  // Store full repayment schedule from Fineract
  @Prop({ type: [Object], default: [] })
  repaymentSchedule?: any[];

  // Store full transactions from Fineract
  @Prop({ type: [Object], default: [] })
  transactions?: any[];

  @Prop({ type: [Object], default: [] })
  charges?: any[];

  @Prop({ type: [Object], default: [] })
  collateral?: any[];

  @Prop({ type: [Object], default: [] })
  guarantors?: any[];

  @Prop({ type: Object, default: {} })
  delinquencyRange?: any;

  @Prop({ type: [Object], default: [] })
  delinquencyTag?: any[];

  @Prop({ type: [Object], default: [] })
  installmentLevelDelinquency?: any[];

  @Prop({ type: [Object], default: [] })
  delinquencyTags?: any[];

  @Prop({ type: [Object], default: [] })
  delinquencyActions?: any[];

  // ── AIScore PD Result ──
  // Lưu kết quả chấm điểm tín dụng khi tạo khoản vay
  // Luồng: XGBoost → PD → Credit Score → Grade/SubGrade → Tier → Decision
  @Prop({
    type: {
      pd: { type: Number }, // Probability of Default (0.0 - 1.0)
      creditScore: { type: Number }, // 300-850
      grade: { type: String }, // A-G
      subGrade: { type: String }, // A1-G5
      tier: { type: String }, // Platinum | Gold | Silver | Basic
      decision: { type: String }, // APPROVE | REVIEW | REJECT
      riskLevel: { type: String }, // LOW | MEDIUM | HIGH | VERY_HIGH
      riskFactors: { type: [Object] }, // Danh sách yếu tố rủi ro
      scoredAt: { type: Date }, // Thời điểm chấm điểm
    },
    _id: false,
    required: false,
  })
  aiScore?: {
    pd: number;
    creditScore: number;
    grade: string;
    subGrade: string;
    tier: string;
    decision: string;
    riskLevel: string;
    riskFactors: Array<Record<string, any>>;
    scoredAt: Date;
  };

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
