import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'credit_scores', versionKey: false })
export class CreditScore extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 570, min: 150, max: 750 })
  score: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  totalLoans: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  latePayments: number;

  @Prop({ type: Date, required: true, default: Date.now, index: true })
  lastUpdated: Date;

  /** 5 factor scores (0-100 each), populated on every recalculation */
  @Prop({
    type: {
      paymentHistory: { type: Number, default: 0 },
      debtLevel: { type: Number, default: 0 },
      creditAge: { type: Number, default: 0 },
      creditMix: { type: Number, default: 0 },
      newCredit: { type: Number, default: 0 },
    },
    default: { paymentHistory: 0, debtLevel: 0, creditAge: 0, creditMix: 0, newCredit: 0 },
  })
  factors: {
    paymentHistory: number;
    debtLevel: number;
    creditAge: number;
    creditMix: number;
    newCredit: number;
  };
}

export const CreditScoreSchema = SchemaFactory.createForClass(CreditScore);
