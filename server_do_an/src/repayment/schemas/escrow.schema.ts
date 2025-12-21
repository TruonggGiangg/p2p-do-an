import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EscrowDocument = Escrow & Document;

@Schema({ timestamps: true })
export class Escrow {
    @Prop({ required: true, unique: true })
    escrowId: string;

    @Prop({ required: true })
    loanContractId: string;

    @Prop({ required: true })
    lenderId: string;

    @Prop({ required: true })
    borrowerId: string;

    @Prop({ required: true })
    amount: number;

    @Prop({ required: true, enum: ['waiting', 'escrowed', 'disbursed', 'refunded', 'cancelled'] })
    status: string;

    @Prop()
    transactionId: string;

    @Prop()
    fineractTransferId: string;

    @Prop()
    paymentMethod: string;

    @Prop({ type: Object })
    metadata: Record<string, any>;
}

export const EscrowSchema = SchemaFactory.createForClass(Escrow);
