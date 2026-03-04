import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface FieldChangeItem {
  field: string;
  label: string;
  before: any;
  after: any;
}

export interface ProductDiffItem {
  id: number;
  name?: string;
  shortName?: string;
  /** Chi tiết thay đổi từng trường (chỉ có khi modified) */
  fieldChanges?: FieldChangeItem[];
}

@Schema({ timestamps: true, collection: 'sync_drift_logs' })
export class SyncDriftLog extends Document {
  @Prop({ required: false, default: 'loan' })
  scope?: 'loan' | 'savings';

  @Prop({ required: true, default: () => new Date() })
  syncedAt: Date;

  @Prop({ type: [Object], default: [] })
  added: ProductDiffItem[];

  @Prop({ type: [Object], default: [] })
  removed: ProductDiffItem[];

  @Prop({ type: [Object], default: [] })
  modified: ProductDiffItem[];

  @Prop({ default: false })
  hasDrift: boolean;

  @Prop({ required: false })
  snapshotHash?: string;
}

export const SyncDriftLogSchema = SchemaFactory.createForClass(SyncDriftLog);
SyncDriftLogSchema.index({ syncedAt: -1 });
