import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'wallets' })
export class Wallet extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  fineractSavingsId: string;

  @Prop({ default: false })
  isDefault: boolean;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Compound index for fast lookup
WalletSchema.index({ userId: 1, fineractSavingsId: 1 }); // For user's wallet lookup by Fineract ID
WalletSchema.index({ userId: 1 }); // For getting all wallets of a user
