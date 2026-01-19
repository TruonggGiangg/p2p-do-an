import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BnplWalletStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

@Schema({ timestamps: true, collection: 'bnpl_wallets' })
export class BnplWallet extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  creditLimit: number; // Hạn mức thấu chi tối đa (từ config, không hard code)

  @Prop({ required: true, default: 0, min: 0 })
  usedCredit: number; // Tổng số tiền đã sử dụng (vốn + lãi của các khoản vay còn nợ)

  @Prop({
    type: String,
    enum: BnplWalletStatus,
    default: BnplWalletStatus.ACTIVE,
  })
  status: BnplWalletStatus;
}

export const BnplWalletSchema = SchemaFactory.createForClass(BnplWallet);

// Additional indexes for efficient queries
BnplWalletSchema.index({ status: 1 }); // For filtering by status
BnplWalletSchema.index({ userId: 1, status: 1 }); // Compound index for user's wallet status queries
