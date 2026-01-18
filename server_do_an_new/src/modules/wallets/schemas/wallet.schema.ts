import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'wallets' })
export class Wallet extends Document {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ required: true, unique: true, index: true })
    fineractSavingsId: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Index for fast lookup
WalletSchema.index({ userId: 1, fineractSavingsId: 1 });
