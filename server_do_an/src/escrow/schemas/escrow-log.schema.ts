import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EscrowLogDocument = EscrowLog & Document;

@Schema({ timestamps: true })
export class EscrowLog {
    @Prop({ required: true, index: true })
    escrowId: string;

    @Prop({ required: true })
    action: string; // 'created', 'funded', 'released', 'returned', 'failed'

    @Prop()
    amount?: number;

    @Prop()
    userId?: string; // Who performed the action

    @Prop()
    transactionId?: string; // Fineract transaction ID

    @Prop({ type: Object })
    details?: {
        fromAccount?: string;
        toAccount?: string;
        previousStatus?: string;
        newStatus?: string;
        errorMessage?: string;
        [key: string]: any;
    };

    @Prop()
    timestamp: Date;
}

export const EscrowLogSchema = SchemaFactory.createForClass(EscrowLog);

// Index for querying logs by escrow and time
EscrowLogSchema.index({ escrowId: 1, timestamp: -1 });
