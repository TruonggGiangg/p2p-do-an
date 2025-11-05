import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoanDocument = Loan & Document;

@Schema({ timestamps: true })
export class Loan {
  @Prop({ type: String, required: true, unique: true })
  contractId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  borrower: Types.ObjectId;

  // Match info
  @Prop({ type: Number, default: 0 })
  nodeMatch: number;

  @Prop({ type: Number, default: 0 })
  matchedAmount: number;

  @Prop({ type: Number, default: 0 })
  matchPercentage: number;

  @Prop({ type: Boolean, default: false })
  isFullMatch: boolean;

  @Prop({ type: Types.ObjectId, ref: 'WaitingRoom', default: null })
  waitingRoomId: Types.ObjectId | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'WaitingRoom' }], default: [] })
  waitingRooms: Types.ObjectId[];

  // Loan info (đồng bộ với chaincode)
  @Prop({
    type: {
      capital: { type: Number, required: true },
      periodMonth: { type: Number, required: true },
      score: { type: Number, required: true },
      willing: { type: String, required: true },
      rate: { type: Number, default: 0 },
      monthlyPrincipalPay: { type: Number, default: 0 },
      monthlyInterestPay: { type: Number, default: 0 },
      monthlyPay: { type: Number, default: 0 },
      entirelyPay: { type: Number, default: 0 },
      disbursementDate: { type: Date, required: true },
      maturityDate: { type: Date, required: true },
      createdAt: { type: Date, default: Date.now },
    },
    required: true,
  })
  info: {
    capital: number;
    periodMonth: number;
    score: number;
    willing: string;
    rate: number;
    monthlyPrincipalPay: number;
    monthlyInterestPay: number;
    monthlyPay: number;
    entirelyPay: number;
    disbursementDate: Date;
    maturityDate: Date;
    createdAt: Date;
  };

  @Prop({ type: Number, required: true })
  totalNotes: number;

  @Prop({ type: Number, default: 0 })
  investedNotes: number;

  @Prop({
    type: String,
    enum: ['waiting', 'success', 'clean', 'fail'],
    default: 'waiting',
  })
  status: string;

  @Prop({ type: String, default: null })
  extra: string | null;

  @Prop({ type: Boolean, default: false })
  disburse_done: boolean;

  @Prop({ type: Date, default: null })
  disburse_date: Date | null;

  @Prop({ type: Number, default: 0 })
  disburse_amount: number;

  @Prop({ type: Date, default: null })
  lastReminderSent: Date | null;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);

// Indexes
LoanSchema.index({ status: 1, investedNotes: 1, totalNotes: 1 });
LoanSchema.index({ 'info.rate': 1, 'info.periodMonth': 1, 'info.capital': 1 });
LoanSchema.index({ 'info.maturityDate': 1 });
LoanSchema.index({ createdAt: -1 });
LoanSchema.index({ borrower: 1, status: 1 });

