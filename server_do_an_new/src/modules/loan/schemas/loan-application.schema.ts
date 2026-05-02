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

  // ── Investment tracking fields (như HD-AMC) ──

  /** Tổng số notes (= Math.ceil(capital / baseUnitPrice)), tính khi tạo khoản vay */
  @Prop({ required: false, default: 0 })
  totalNotes: number;

  /** Số notes đã được đầu tư (confirmed invest) */
  @Prop({ required: false, default: 0 })
  investedNotes: number;

  /** Số notes tạm match từ lệnh đầu tư (chưa confirm) */
  @Prop({ required: false, default: 0 })
  nodeMatch: number;

  /** true nếu investedNotes >= totalNotes (fully funded — chỉ tính tiền thật, KHÔNG tính nodeMatch) */
  @Prop({ required: false, default: false })
  isFullMatch: boolean;

  /** % tiến độ ghép vốn = (nodeMatch + investedNotes) / totalNotes * 100 */
  @Prop({ required: false, default: 0 })
  matchPercentage: number;

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

  /** Tên khách hàng trên Fineract (để hiển thị trong danh sách nợ quá hạn) */
  @Prop({ required: false })
  clientDisplayName?: string;

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
      riskFactors: { type: [Object] }, // Danh sách yếu tố rủi ro (rule-based negatives)
      positiveFactors: { type: [String] }, // Điểm mạnh hồ sơ (rule-based positives)
      decisionExplanation: { type: String }, // Diễn giải quyết định cho UI
      modelDecision: { type: String }, // approve | manual_review | reject_or_strict_review (theo model)
      modelRiskLevel: { type: String }, // Very low/low/medium/high/Very high risk
      configVersion: { type: Number },
      autoRejectScore: { type: Number },
      autoApproveScore: { type: Number },
      maxLoanAmount: { type: Number },
      baseInterestRate: { type: Number },
      amountWithinGradeLimit: { type: Boolean },
      featuresResolved: { type: Object }, // 13 features đã được model dùng (đã chuẩn hoá)
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
    positiveFactors?: string[];
    decisionExplanation?: string;
    modelDecision?: string;
    modelRiskLevel?: string;
    configVersion?: number;
    autoRejectScore?: number;
    autoApproveScore?: number;
    maxLoanAmount?: number | null;
    baseInterestRate?: number | null;
    amountWithinGradeLimit?: boolean;
    featuresResolved?: Record<string, any>;
    scoredAt: Date;
  };

  /** Thời điểm khoản vay bị từ chối (manual hoặc AI auto-reject) */
  @Prop({ required: false })
  rejectedAt?: Date;

  /** Lý do từ chối (decisionExplanation từ AI hoặc note do admin nhập) */
  @Prop({ required: false })
  rejectionReason?: string;

  /** Ai/cái gì từ chối: 'AI_AUTO' | 'ADMIN' | userId admin */
  @Prop({ required: false })
  rejectedBy?: string;

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
LoanApplicationSchema.index({ createdAt: -1 });
// Index cho query available loans (lọc khoản vay chưa đầu tư đủ)
LoanApplicationSchema.index({ status: 1, isFullMatch: 1 });
