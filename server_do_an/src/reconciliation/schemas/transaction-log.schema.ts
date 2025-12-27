import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * TransactionLog Schema
 * Audit trail cho mọi giao dịch quan trọng trong hệ thống P2P
 */
@Schema({
    timestamps: true,
    collection: 'transaction_logs',
})
export class TransactionLog extends Document {
    @Prop({ required: true, unique: true, index: true })
    transactionId: string;

    @Prop({
        required: true,
        enum: ['INVEST', 'DISBURSE', 'REPAY', 'FD_TRANSFER', 'FD_CLOSE', 'FD_CREATE', 'LOAN_APPROVE', 'LOAN_ACTIVATE', 'DISTRIBUTION', 'ESCROW_TRANSFER'],
        index: true,
    })
    transactionType: string;

    // === FINERACT INTEGRATION ===
    @Prop({ index: true })
    fineractTransactionId?: number;

    @Prop()
    fineractLoanId?: number;

    @Prop()
    fineractFixedDepositAccountId?: number;

    @Prop()
    fineractSavingsAccountId?: number;

    // === AMOUNT ===
    @Prop({ required: true })
    amount: number;

    @Prop({ default: 'VND' })
    currency: string;

    // === STATUS ===
    @Prop({
        required: true,
        enum: ['SUCCESS', 'FAILED', 'PENDING', 'PROCESSING'],
        default: 'PENDING',
        index: true,
    })
    status: string;

    // === P2P CONTEXT (Ngữ cảnh tiếng Việt) ===
    @Prop({ required: true })
    p2pContext: string; // Ví dụ: "Hoàn vốn FD cho Loan LOAN_xxx", "Gửi vào FD cho Investment INV_xxx"

    // === REFERENCES ===
    @Prop({ index: true })
    loanId?: string; // Reference to LoanContract.contractId

    @Prop({ index: true })
    investmentId?: string; // Reference to InvestmentContract.contractId

    @Prop({ type: Types.ObjectId, ref: 'User', index: true })
    lenderId?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', index: true })
    borrowerId?: Types.ObjectId;

    // === METADATA ===
    @Prop({ type: Object })
    metadata?: Record<string, any>; // Flexible field for additional info

    @Prop()
    errorMessage?: string; // Only for FAILED status

    @Prop()
    fineractResponse?: string; // Raw Fineract API response (for debugging)

    // === RECONCILIATION ===
    @Prop({ default: false, index: true })
    reconciled: boolean;

    @Prop()
    reconciledAt?: Date;

    @Prop()
    reconciledBy?: string; // Admin user ID hoặc "SYSTEM"
}

export const TransactionLogSchema = SchemaFactory.createForClass(TransactionLog);

// Indexes for common queries
TransactionLogSchema.index({ transactionType: 1, status: 1 });
TransactionLogSchema.index({ loanId: 1, transactionType: 1 });
TransactionLogSchema.index({ investmentId: 1, transactionType: 1 });
TransactionLogSchema.index({ createdAt: -1 });
TransactionLogSchema.index({ reconciled: 1, status: 1 });

// Transform for JSON
TransactionLogSchema.set('toJSON', {
    transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});
