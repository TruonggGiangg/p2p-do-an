import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Flattened savings product for snapshot comparison */
export interface SnapshotSavingsProductItem {
  id: number;
  name: string;
  shortName: string;
  nominalAnnualInterestRate?: number;
  /** Full flattened fields for field-level diff */
  [key: string]: any;
}

const SAVINGS_SNAPSHOT_SCOPE = 'savings';

@Schema({ timestamps: true, collection: 'savings_product_snapshots' })
export class SavingsProductSnapshot extends Document {
  @Prop({ required: true, unique: true, default: SAVINGS_SNAPSHOT_SCOPE })
  scope: string;

  @Prop({ type: [Object], required: true, default: [] })
  products: SnapshotSavingsProductItem[];

  @Prop({ required: true })
  updatedAtSnapshot: Date;
}

export const SavingsProductSnapshotSchema = SchemaFactory.createForClass(SavingsProductSnapshot);

export { SAVINGS_SNAPSHOT_SCOPE };
