import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Sub-documents ─────────────────────────────────────────
export interface LenderScheduleItem {
  period: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  paidDate?: Date;
  paidAmount?: number;
}

export interface RepaymentHistoryItem {
  date: Date;
  amount: number;
  principal: number;
  interest: number;
  fineractTransactionId?: number;
}

export type InvestmentContractStatus = 'pending' | 'pending_signature' | 'active' | 'matured' | 'closed';
export type FDStatus = 'pending' | 'active' | 'matured' | 'closed' | 'premature_closed';

// ── Main Schema ───────────────────────────────────────────
@Schema({ timestamps: true, collection: 'investment_contracts' })
export class InvestmentContract extends Document {
  /** Mã HĐ duy nhất: INV_{loanId}_{timestamp} */
  @Prop({ required: true, unique: true, index: true })
  contractId: string;

  /** Nhà đầu tư */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  lenderId: Types.ObjectId;

  /** Khoản vay được đầu tư */
  @Prop({ type: Types.ObjectId, ref: 'LoanApplication', required: true, index: true })
  loanApplicationId: Types.ObjectId;

  /** Lệnh đầu tư nguồn (nullable nếu đầu tư trực tiếp) */
  @Prop({ type: Types.ObjectId, ref: 'InvestmentOrder', default: null })
  investmentOrderId: Types.ObjectId;

  // ── Financial Info ──
  /** Vốn đầu tư (VND) */
  @Prop({ required: true })
  capital: number;

  /** Số notes đầu tư */
  @Prop({ required: true })
  numNotes: number;

  /** Kỳ hạn (tháng) */
  @Prop({ required: true })
  periodMonth: number;

  /** Lãi suất tháng (% — e.g. 1.5 = 1.5%/tháng) */
  @Prop({ required: true })
  monthlyRatePercent: number;

  /** Lãi suất năm (% — e.g. 18.0 = 18%/năm) */
  @Prop({ required: true })
  annualRatePercent: number;

  /** Thu nhập hàng tháng (gốc + lãi) */
  @Prop({ default: 0 })
  monthlyIncome: number;

  /** Tổng lợi nhuận lãi suất */
  @Prop({ default: 0 })
  entirelyProfit: number;

  /** Tổng phải trả (vốn + lãi) */
  @Prop({ default: 0 })
  entirelyPay: number;

  /** Phí dịch vụ */
  @Prop({ default: 0 })
  serviceFee: number;

  // ── Status ──
  @Prop({
    type: String,
    enum: ['pending', 'pending_signature', 'active', 'matured', 'closed'],
    default: 'pending',
    index: true,
  })
  status: InvestmentContractStatus;

  // ── Digital Signature ──
  @Prop({ required: false, default: null })
  signedAt: Date;

  @Prop({ required: false, default: null })
  signatureData: string;

  @Prop({ required: false, default: false })
  smartCASignatureVerified: boolean;

  @Prop({ required: false, default: null })
  signatureProvider: string;

  @Prop({ required: false, default: null })
  signatureVerifiedAt: Date;

  @Prop({ required: false, default: null })
  legalApprovalAt: Date;

  // ── Fineract Fixed Deposit ──
  @Prop({ required: false, default: null })
  fineractFDAccountId: number;

  @Prop({ required: false, default: null })
  fineractFDAccountNo: string;

  @Prop({ required: false, default: null })
  fineractFDProductId: number;

  @Prop({ required: false, default: null })
  fdInterestRate: number;

  @Prop({ required: false, default: null })
  fdMaturityDate: Date;

  @Prop({ type: String, enum: ['pending', 'active', 'matured', 'closed', 'premature_closed'], default: 'pending' })
  fdStatus: FDStatus;

  @Prop({ default: 0 })
  fdInterestEarned: number;

  @Prop({ default: 0 })
  fdBalance: number;

  // ── Lender Schedule (lịch nhận tiền) ──
  @Prop({
    type: [
      {
        period: { type: Number, required: true },
        dueDate: { type: String, required: true },
        principal: { type: Number, required: true },
        interest: { type: Number, required: true },
        total: { type: Number, required: true },
        status: { type: String, enum: ['pending', 'paid', 'partial', 'overdue'], default: 'pending' },
        paidDate: { type: Date },
        paidAmount: { type: Number },
      },
    ],
    default: [],
    _id: false,
  })
  lenderSchedule: LenderScheduleItem[];

  /** Tổng gốc trong schedule */
  @Prop({ default: 0 })
  scheduleTotalPrincipal: number;

  /** Tổng lãi trong schedule */
  @Prop({ default: 0 })
  scheduleTotalInterest: number;

  /** Tổng thu nhập schedule (gốc + lãi) */
  @Prop({ default: 0 })
  scheduleTotalIncome: number;

  /** Số kỳ */
  @Prop({ default: 0 })
  schedulePeriodCount: number;

  // ── Repayment History ──
  @Prop({
    type: [
      {
        date: { type: Date },
        amount: { type: Number },
        principal: { type: Number },
        interest: { type: Number },
        fineractTransactionId: { type: Number },
      },
    ],
    default: [],
    _id: false,
  })
  repaymentHistory: RepaymentHistoryItem[];

  @Prop({ default: 0 })
  totalReceived: number;

  @Prop({ default: 0 })
  totalPrincipalReceived: number;

  @Prop({ default: 0 })
  totalInterestReceived: number;

  // ── Payment Status (Fineract transfer + FD) ──
  @Prop({
    type: String,
    enum: ['completed', 'transfer_failed', 'partial_fd_failed', 'pending'],
    default: 'pending',
  })
  paymentStatus: string;

  @Prop({ required: false, default: null })
  paymentError: string;
}

export const InvestmentContractSchema = SchemaFactory.createForClass(InvestmentContract);

// ── Indexes ──
InvestmentContractSchema.index({ lenderId: 1, status: 1 });
InvestmentContractSchema.index({ loanApplicationId: 1 });
InvestmentContractSchema.index({ status: 1, createdAt: -1 });

// ── toJSON ──
InvestmentContractSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});
