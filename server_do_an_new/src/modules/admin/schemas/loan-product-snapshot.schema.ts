import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface SnapshotProductItem {
  id: number;
  name: string;
  shortName: string;
  interestRatePerPeriod?: number;
}

@Schema({ timestamps: true, collection: 'loan_product_snapshots' })
export class LoanProductSnapshot extends Document {
  @Prop({ required: true, unique: true, default: 'default' })
  scope: string;

  @Prop({ type: [Object], required: true, default: [] })
  products: SnapshotProductItem[];

  @Prop({ required: true })
  updatedAtSnapshot: Date;
}

export const LoanProductSnapshotSchema = SchemaFactory.createForClass(LoanProductSnapshot);
LoanProductSnapshotSchema.index({ scope: 1 });
