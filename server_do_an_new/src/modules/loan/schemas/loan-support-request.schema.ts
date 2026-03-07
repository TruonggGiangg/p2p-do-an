import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportRequestType = 'WAIVE_PENALTY' | 'RESCHEDULE';
export type SupportRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Schema({ timestamps: true, collection: 'loan_support_requests' })
export class LoanSupportRequest extends Document {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'LoanApplication', required: true, index: true })
    loanId: Types.ObjectId;

    @Prop({ required: true })
    fineractLoanId: number;

    @Prop({ required: true, enum: ['WAIVE_PENALTY', 'RESCHEDULE'] })
    requestType: SupportRequestType;

    @Prop({ required: true })
    reason: string;

    // For RESCHEDULE requests specifically
    @Prop({ required: false })
    proposedRescheduleDate?: string;

    @Prop({ required: false })
    proposedExtraPeriods?: number;

    @Prop({ required: true, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' })
    status: SupportRequestStatus;

    @Prop({ required: false })
    adminNote?: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    resolvedBy?: Types.ObjectId;

    @Prop({ required: false })
    resolvedAt?: Date;
}

export const LoanSupportRequestSchema = SchemaFactory.createForClass(LoanSupportRequest);
