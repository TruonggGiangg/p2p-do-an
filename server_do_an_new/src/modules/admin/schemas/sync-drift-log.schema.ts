import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface ProductDiffItem {
  id: number;
  name?: string;
  shortName?: string;
}

@Schema({ timestamps: true, collection: 'sync_drift_logs' })
export class SyncDriftLog extends Document {
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
