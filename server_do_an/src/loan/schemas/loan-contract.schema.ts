import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Loan Info subdocument
 */
@Schema({ _id: false })
export class LoanInfo {
    @Prop({ required: true })
    capital: number;

    @Prop({ default: 0 })
    rate: number;

    @Prop({ required: true })
    periodMonth: number;

    @Prop({ required: true })
    willing: string;

    @Prop({ required: true })
    disbursementDate: Date;

    @Prop({ required: true })
    maturityDate: Date;

    @Prop({ default: Date.now })
    createdDate: Date;

    @Prop()
    investingEndDate?: Date;

    @Prop({ default: 0 })
    monthlyPrincipalPay: number;

    @Prop({ default: 0 })
    monthlyInterestPay: number;

    @Prop({ default: 0 })
    monthlyPay: number;

    @Prop({ default: 0 })
    entirelyPay: number;

    @Prop()
    annualRate?: number;

    @Prop()
    lenderRate?: number;  // Monthly lender interest rate

    @Prop()
    annualLenderRate?: number;  // Annual lender interest rate

    @Prop()
    spread?: number;  // Admin spread percentage (typically 3%)
}

/**
 * Fineract Repayment Schedule subdocument
 */
@Schema({ _id: false })
export class FineractRepaymentSchedule {
    @Prop()
    totalPrincipalExpected?: number;

    @Prop()
    totalInterestCharged?: number;

    @Prop()
    totalRepaymentExpected?: number;

    @Prop()
    totalRepayment?: number;

    @Prop()
    totalOutstanding?: number;

    @Prop()
    loanTermInDays?: number;

    @Prop({ type: [Object] })
    periods?: Array<{
        period: number;
        dueDate: Date;
        principalDue: number;
        interestDue: number;
        totalDue: number;
        complete: boolean;
    }>;

    @Prop()
    lastSyncedAt?: Date;
}

/**
 * Fineract Timeline subdocument
 */
@Schema({ _id: false })
export class FineractTimeline {
    @Prop()
    submittedOnDate?: Date;

    @Prop()
    expectedDisbursementDate?: Date;

    @Prop()
    expectedMaturityDate?: Date;

    @Prop()
    approvedOnDate?: Date;

    @Prop()
    actualDisbursementDate?: Date;
}

/**
 * Disbursement Account subdocument
 */
@Schema({ _id: false })
export class DisbursementAccount {
    @Prop({ enum: ['mobile_wallet', 'bank_transfer'], default: 'mobile_wallet' })
    account_type: string;

    @Prop()
    phone_number?: string;

    @Prop()
    account_name?: string;

    @Prop()
    bank_name?: string;

    @Prop({ default: true })
    is_default_phone: boolean;
}

/**
 * Payment record subdocument
 */
@Schema({ _id: false })
export class PaymentRecord {
    @Prop({ required: true })
    disbursement_id: string;

    @Prop({ required: true })
    amount: number;

    @Prop({ default: Date.now })
    disbursement_date: Date;

    @Prop({ enum: ['bank_transfer', 'wallet'], default: 'wallet' })
    disbursement_method: string;

    @Prop()
    bank_account?: string;

    @Prop()
    bank_name?: string;

    @Prop({ enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' })
    status: string;

    @Prop()
    notes?: string;
}

/**
 * Disbursement Info subdocument for idempotency
 * Tracks disbursement status to prevent duplicate processing
 */
@Schema({ _id: false })
export class DisbursementInfo {
    @Prop({
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    })
    status: string;

    @Prop()
    startedAt?: Date;

    @Prop()
    completedAt?: Date;

    @Prop()
    fineractDisbursementId?: number;

    @Prop()
    transferId?: string;

    @Prop()
    error?: string;
}

/**
 * LoanContract Schema
 * Main schema for loan contracts
 */
@Schema({
    timestamps: true,
    collection: 'loan_contracts',
})
export class LoanContract extends Document {
    @Prop({ required: true, unique: true, index: true })
    contractId: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    borrower: Types.ObjectId;

    // === MATCHING INFO ===
    @Prop({ default: 0 })
    nodeMatch: number;

    @Prop({ default: 0 })
    matchedAmount: number;

    @Prop({ default: 0 })
    matchPercentage: number;

    @Prop({ default: false })
    isFullMatch: boolean;

    @Prop({ type: Types.ObjectId, ref: 'WaitingRoom' })
    waitingRoomId?: Types.ObjectId;

    @Prop({ type: [Types.ObjectId], ref: 'WaitingRoom', default: [] })
    waitingRooms: Types.ObjectId[];

    // === LOAN INFO ===
    @Prop({ type: LoanInfo, required: true })
    info: LoanInfo;

    @Prop({ required: true })
    totalNotes: number;

    @Prop({ default: 0 })
    investedNotes: number;

    @Prop({
        type: String,
        enum: ['waiting', 'success', 'clean', 'fail'],
        default: 'waiting',
        index: true,
    })
    status: string;

    @Prop()
    extra?: string;

    // === ODOO SYNC ===
    @Prop({ default: false })
    odoo_sync: boolean;

    @Prop()
    odoo_sync_date?: Date;

    // === DISBURSEMENT ===
    @Prop({ default: false })
    disburse_done: boolean;

    @Prop()
    disburse_date?: Date;

    @Prop({ default: 0 })
    disburse_amount: number;

    @Prop({ type: DisbursementAccount })
    disbursement_account?: DisbursementAccount;

    @Prop({ type: [PaymentRecord], default: [] })
    payments: PaymentRecord[];

    // === DISBURSEMENT INFO (Idempotency) ===
    @Prop({ type: DisbursementInfo })
    disbursementInfo?: DisbursementInfo;

    // === FINERACT INTEGRATION ===
    @Prop({ index: true })
    fineractLoanId?: number;

    @Prop()
    borrowerFineractClientId?: number;

    @Prop()
    fineractStatus?: string;

    @Prop()
    fineractProductId?: number;

    @Prop({ type: FineractRepaymentSchedule })
    fineractRepaymentSchedule?: FineractRepaymentSchedule;

    @Prop({ type: FineractTimeline })
    fineractTimeline?: FineractTimeline;

    // === DYNAMIC INTEREST RATES ===
    @Prop()
    lenderInterestRate?: number;

    @Prop()
    borrowerInterestRate?: number;

    @Prop({ default: 0 })
    adminSpread: number;

    @Prop({ default: 0 })
    adminSpreadPercentage: number;

    @Prop({ enum: ['auto', 'manual', 'credit_score_based'], default: 'auto' })
    spreadCalculationMethod: string;

    @Prop({ enum: ['small', 'medium', 'large'], default: 'medium' })
    loanSizeTier: string;

    @Prop({ default: 0 })
    adminSpreadEarned: number;

    @Prop({ type: [Object], default: [] })
    spreadEarnedHistory: Array<{
        repaymentDate: Date;
        spreadAmount: number;
        lenderInterest: number;
        borrowerInterest: number;
    }>;

    // === CREDIT SCORING ===
    @Prop({ min: 300, max: 850 })
    creditScore?: number;

    @Prop()
    creditGrade?: string; // A+, A, B+, B, C+, C, D, F

    @Prop({ enum: ['low', 'medium', 'high', 'very_high'] })
    riskLevel?: string;

    // === DEFAULT HANDLING ===
    @Prop({ default: false })
    isDefaulted: boolean;

    @Prop()
    defaultDate?: Date;

    @Prop({ default: 0 })
    daysOverdue: number;

    @Prop({ default: 0 })
    latePaymentCount: number;

    // === RESERVE FUND ===
    @Prop({ default: false })
    reserveFundCovered: boolean;

    @Prop({ default: 0 })
    reserveFundAmount: number;

    // === BLOCKCHAIN ===
    @Prop()
    blockchainTxId?: string;

    @Prop({ default: false })
    blockchainSynced: boolean;
}

export const LoanContractSchema = SchemaFactory.createForClass(LoanContract);

// Indexes
LoanContractSchema.index({ status: 1, investedNotes: 1, totalNotes: 1 });
LoanContractSchema.index({ 'info.rate': 1, 'info.periodMonth': 1, 'info.capital': 1 });
LoanContractSchema.index({ 'info.investingEndDate': 1 });
LoanContractSchema.index({ 'info.maturityDate': 1 });
LoanContractSchema.index({ createdAt: -1 });

// Virtual for percentage funded
LoanContractSchema.virtual('fundedPercentage').get(function () {
    if (this.totalNotes === 0) return 0;
    return Math.round((this.investedNotes / this.totalNotes) * 100);
});

// Transform for JSON
LoanContractSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});
