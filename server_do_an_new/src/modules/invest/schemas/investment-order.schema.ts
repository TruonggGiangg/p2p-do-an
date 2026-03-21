import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Sub-document: khoản vay đã ghép ───────────────────────────
export interface MatchedLoanItem {
  loanId: string;
  nodeMatch: number;
  isInvested: boolean;
  matchedAt: Date;
  loanDetails?: any;
}

// ── Main Schema ───────────────────────────────────────────────
@Schema({ timestamps: true, collection: 'investment_orders' })
export class InvestmentOrder extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  lenderId: Types.ObjectId;

  /** Tên danh mục (tùy chọn, để dễ quản lý) */
  @Prop({ required: false, default: '' })
  name: string;

  /** Tổng vốn đầu tư (VND) */
  @Prop({ required: true })
  capital: number;

  /** Giới hạn vốn tối đa cho mỗi khoản vay */
  @Prop({ required: true })
  maxCapital: number;

  /** Tổng số node có thể đầu tư = ceil(capital / baseUnitPrice) */
  @Prop({ required: true, default: 0 })
  totalNodes: number;

  /** Số node đã ghép */
  @Prop({ default: 0 })
  matchedNodes: number;

  /** Khoảng lãi suất chấp nhận (% / tháng) */
  @Prop({
    type: { min: { type: Number, required: true }, max: { type: Number, required: true } },
    _id: false,
    required: true,
  })
  interestRange: { min: number; max: number };

  /** Mảng mục đích đầu tư */
  @Prop({ type: [String], required: true })
  purpose: string[];

  /** Khoảng kỳ hạn chấp nhận (tháng) */
  @Prop({
    type: { min: { type: Number, required: true }, max: { type: Number, required: true } },
    _id: false,
    required: true,
  })
  periodRange: { min: number; max: number };

  /** Danh sách khoản vay đã ghép */
  @Prop({
    type: [
      {
        loanId: { type: String, required: true },
        nodeMatch: { type: Number, required: true },
        isInvested: { type: Boolean, default: false },
        matchedAt: { type: Date, default: Date.now },
        loanDetails: { type: Object, required: false },
      },
    ],
    default: [],
    _id: false,
  })
  loans: MatchedLoanItem[];

  /** Tổng vốn đã ghép (VND) */
  @Prop({ default: 0 })
  matchedCapital: number;

  /** Trạng thái: open / closed */
  @Prop({ type: String, enum: ['open', 'closed'], default: 'open', index: true })
  status: 'open' | 'closed';
}

export const InvestmentOrderSchema = SchemaFactory.createForClass(InvestmentOrder);

// ── Indexes ───────────────────────────────────────────────────
InvestmentOrderSchema.index({ status: 1, createdAt: 1 });
InvestmentOrderSchema.index({ lenderId: 1, status: 1 });

// ── toJSON transform ──────────────────────────────────────────
InvestmentOrderSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});
