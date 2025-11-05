import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SettlementDocument = Settlement & Document;

@Schema({ timestamps: true })
export class Settlement {
  @Prop({ type: String, required: true, unique: true })
  contractId: string; // unique id per installment

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  borrower: Types.ObjectId;

  @Prop({ type: String, required: true })
  loanId: string; // Loan contractId (string on BC)

  @Prop({
    type: {
      principalAmount: { type: Number, required: true },
      interestAmount: { type: Number, required: true },
      penaltyAmount: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
      maturityDate: { type: Date, required: true },
      realpaidDate: { type: Date, default: null },
    },
    required: true,
  })
  info: {
    principalAmount: number;
    interestAmount: number;
    penaltyAmount: number;
    totalAmount: number;
    maturityDate: Date;
    realpaidDate?: Date | null;
  };

  @Prop({ type: Number, required: true })
  orderNo: number;

  @Prop({ type: String, enum: ['undue', 'due', 'settled', 'overdue'], default: 'undue' })
  status: 'undue' | 'due' | 'settled' | 'overdue';

  @Prop({ type: String, default: null })
  extra?: string | null;
}

export const SettlementSchema = SchemaFactory.createForClass(Settlement);

SettlementSchema.index({ loanId: 1, orderNo: 1 }, { unique: true });
SettlementSchema.index({ borrower: 1, status: 1 });
SettlementSchema.index({ 'info.maturityDate': 1 });


