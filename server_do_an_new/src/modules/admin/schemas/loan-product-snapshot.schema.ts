import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Flattened loan product for snapshot comparison */
export interface SnapshotProductItem {
  id: number;
  name: string;
  shortName: string;
  interestRatePerPeriod?: number;
  /** Full flattened fields for field-level diff */
  [key: string]: any;
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
