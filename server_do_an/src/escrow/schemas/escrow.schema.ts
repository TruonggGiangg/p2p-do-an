import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EscrowDocument = Escrow & Document;

@Schema({ timestamps: true })
export class Escrow {
    @Prop({ required: true, unique: true, index: true })
    escrowId: string; // ESCROW_timestamp

    @Prop({ required: true, index: true })
    loanContractId: string;

    @Prop({ required: true, index: true })
    lenderId: string; // P2P user ID

    @Prop({ required: true, index: true })
    borrowerId: string; // P2P user ID

    @Prop({ required: true })
    amount: number;

    @Prop({
        required: true,
        enum: ['waiting', 'funded', 'released', 'returned', 'failed'],
        default: 'waiting'
    })
    status: string;

    @Prop()
    fundTransactionId?: string; // Fineract transaction ID: lender → escrow

    @Prop()
    releaseTransactionId?: string; // Fineract transaction ID: escrow → borrower

    @Prop()
    returnTransactionId?: string; // Fineract transaction ID: escrow → lender (if cancelled)

    @Prop({ type: Object })
    metadata?: {
        fineractLenderClientId?: number;
        fineractBorrowerClientId?: number;
        fineractEscrowAccountId?: number;
        investmentId?: string;
        createdAt?: Date;
        fundedAt?: Date;
        releasedAt?: Date;
        returnedAt?: Date;
        errorMessage?: string;
        [key: string]: any;
    };
}

export const EscrowSchema = SchemaFactory.createForClass(Escrow);

// Indexes for performance
EscrowSchema.index({ loanContractId: 1, status: 1 });
EscrowSchema.index({ lenderId: 1, createdAt: -1 });
EscrowSchema.index({ borrowerId: 1, createdAt: -1 });
