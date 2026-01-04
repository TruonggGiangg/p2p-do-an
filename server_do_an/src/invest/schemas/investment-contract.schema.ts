import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Investment Info subdocument
 */
@Schema({ _id: false })
export class InvestmentInfo {
    @Prop({ required: true })
    capital: number;

    @Prop({ required: true })
    numNotes: number;

    @Prop({ default: 0 })
    serviceFee: number;

    @Prop({ default: 0 })
    monthlyPrincipalIncome: number;

    @Prop({ default: 0 })
    monthlyInterestIncome: number;

    @Prop({ default: 0 })
    monthlyIncome: number;

    @Prop({ default: 0 })
    monthlyProfit: number;

    @Prop({ default: 0 })
    entirelyProfit: number;

    @Prop({ default: Date.now })
    createdDate: Date;
}

/**
 * Repayment History subdocument
 */
@Schema({ _id: false })
export class RepaymentHistoryItem {
    @Prop()
    repaymentDate: Date;

    @Prop()
    amount: number;

    @Prop()
    fineractTransferId?: number;

    @Prop()
    principal?: number;

    @Prop()
    interest?: number;

    @Prop()
    fees?: number;

    @Prop()
    loanId?: string;
}

/**
 * Lender Schedule Item - Lịch nhận tiền của nhà đầu tư
 * Đây là hợp đồng giữa sàn và lender về lịch trả tiền
 */
@Schema({ _id: false })
export class LenderScheduleItem {
    @Prop({ required: true })
    period: number; // Kỳ thứ mấy (1, 2, 3, ...)

    @Prop({ required: true })
    dueDate: string; // Ngày đến hạn nhận tiền (DD/MM/YYYY)

    @Prop({ required: true })
    principal: number; // Gốc nhận kỳ này

    @Prop({ required: true })
    interest: number; // Lãi nhận kỳ này (đã trừ 3% spread)

    @Prop({ required: true })
    total: number; // Tổng nhận kỳ này

    @Prop({
        enum: ['pending', 'paid', 'partial', 'overdue'],
        default: 'pending'
    })
    status: string; // Trạng thái thanh toán

    @Prop()
    paidDate?: Date; // Ngày thực nhận

    @Prop()
    paidAmount?: number; // Số tiền thực nhận

    @Prop()
    fineractTransactionId?: number; // ID giao dịch Fineract
}

/**
 * InvestmentContract Schema
 */
@Schema({
    timestamps: true,
    collection: 'investment_contracts',
})
export class InvestmentContract extends Document {
    @Prop({ required: true, unique: true, index: true })
    contractId: string;

    @Prop({ required: true, index: true })
    lender: string; // Keycloak UUID

    @Prop()
    lenderFineractClientId?: number;

    @Prop({ type: Types.ObjectId, ref: 'LoanContract', required: true, index: true })
    loanContract: Types.ObjectId;

    @Prop()
    loanContractId?: string;

    @Prop({ type: InvestmentInfo, required: true })
    info: InvestmentInfo;

    @Prop({
        type: String,
        enum: ['waiting_other', 'waiting_transfer', 'fail_transfer', 'success', 'clean', 'fail'],
        default: 'waiting_other',
        index: true,
    })
    status: string;

    @Prop()
    extra?: string;

    // === FINERACT INTEGRATION ===
    @Prop()
    fineractTransferId?: number;

    @Prop()
    fineractEscrowAccountId?: number;

    // Escrow tracking fields (NEW)
    @Prop({ index: true })
    escrowId?: string; // Link to Escrow record in MongoDB

    @Prop()
    escrowTransactionId?: string; // Lender → Escrow transaction ID

    @Prop({ enum: ['pending', 'escrowed', 'disbursed', 'failed'], default: 'pending' })
    escrowStatus: string;

    @Prop()
    fineractSavingsAccountId?: number;

    @Prop()
    fineractSavingsAccountNo?: string;

    // === FIXED DEPOSIT FIELDS ===
    @Prop()
    fineractFixedDepositAccountId?: number;

    @Prop()
    fineractFixedDepositAccountNo?: string;

    @Prop()
    fixedDepositInterestRate?: number;

    @Prop()
    fixedDepositMaturityDate?: Date;

    @Prop({ enum: ['pending', 'active', 'matured', 'closed', 'premature_closed'], default: 'pending' })
    fixedDepositStatus: string;

    @Prop({ default: 0 })
    fixedDepositInterestEarned: number;

    @Prop({ default: 0 })
    fixedDepositBalance: number;

    // === REPAYMENT TRACKING ===
    @Prop({ type: [RepaymentHistoryItem], default: [] })
    repaymentHistory: RepaymentHistoryItem[];

    @Prop({ default: 0 })
    totalReceived: number;

    @Prop({ default: 0 })
    totalPrincipalReceived: number;

    @Prop({ default: 0 })
    totalInterestReceived: number;

    // === LENDER SCHEDULE (Hợp đồng lịch nhận tiền) ===
    @Prop({ type: [LenderScheduleItem], default: [] })
    lenderSchedule: LenderScheduleItem[];

    // Summary totals from schedule
    @Prop({ default: 0 })
    scheduleTotalPrincipal: number;

    @Prop({ default: 0 })
    scheduleTotalInterest: number;

    @Prop({ default: 0 })
    scheduleTotalIncome: number;

    @Prop({ default: 0 })
    schedulePeriodCount: number;

    // === FD DIRECT DISTRIBUTION TRACKING ===
    @Prop({ default: 0 })
    totalPrincipalDistributed: number;

    @Prop({ default: null })
    fixedDepositTrackedBalance: number;
}

export const InvestmentContractSchema = SchemaFactory.createForClass(InvestmentContract);

// Indexes
InvestmentContractSchema.index({ lender: 1, status: 1 });
InvestmentContractSchema.index({ loanContract: 1 });
InvestmentContractSchema.index({ 'info.createdDate': -1 });

// Transform for JSON
InvestmentContractSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});
