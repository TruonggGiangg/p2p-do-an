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
    @Prop({ type: Types.ObjectId, ref: 'BnplWallet', required: true, index: true })
    walletId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ required: true, unique: true, index: true })
    fineractLoanId: string; // ID khoản vay trong Fineract

    @Prop({ required: true })
    principal: number; // Số tiền vốn gốc

    @Prop({ required: true, default: 0 })
    totalInterest: number; // Tổng lãi (lấy từ Fineract)

    @Prop({ required: true })
    totalRepayment: number; // Tổng phải trả = vốn + lãi

    @Prop({ required: true, default: 0 })
    paidAmount: number; // Số tiền đã trả

    @Prop({ required: true })
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

// Compound index for efficient queries
BnplLoanSchema.index({ walletId: 1, status: 1 });
BnplLoanSchema.index({ userId: 1, status: 1 });
