import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
    @Prop({ required: true, unique: true })
    p2pUserId: string;

    @Prop({ required: true })
    fineractClientId: string;

    @Prop({ default: false })
    isLinked: boolean;

    @Prop({ type: Object })
    metadata: Record<string, any>;

    @Prop()
    phone: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
