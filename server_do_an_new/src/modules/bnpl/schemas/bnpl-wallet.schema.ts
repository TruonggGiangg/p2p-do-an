import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BnplWalletStatus {
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
    CLOSED = 'closed',
}

@Schema({ timestamps: true, collection: 'bnpl_wallets' })
export class BnplWallet extends Document {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
    userId: Types.ObjectId;

    @Prop({ required: true, default: 5000000 })
    creditLimit: number; // Hạn mức thấu chi tối đa

    @Prop({ required: true, default: 0 })
    usedCredit: number; // Tổng số tiền đã sử dụng (vốn + lãi của các khoản vay còn nợ)

    @Prop({
        type: String,
        enum: BnplWalletStatus,
        default: BnplWalletStatus.ACTIVE,
    })
    status: BnplWalletStatus;
}

export const BnplWalletSchema = SchemaFactory.createForClass(BnplWallet);
