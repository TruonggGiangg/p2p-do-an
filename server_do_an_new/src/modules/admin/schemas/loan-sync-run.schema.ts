import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Log mỗi lần chạy batch đồng bộ khoản vay từ Fineract (cron 2h sáng hoặc nút "Đồng bộ từ Fineract").
 * Xem trong Mongo collection: loan_sync_runs
 */
@Schema({ timestamps: true, collection: 'loan_sync_runs' })
export class LoanSyncRun extends Document {
  @Prop({ required: true, default: () => new Date() })
  ranAt: Date;

  /** 'cron' = chạy tự động 2:00 AM, 'manual' = gọi API từ admin */
  @Prop({ required: true, enum: ['cron', 'manual'] })
  trigger: 'cron' | 'manual';

  @Prop({ required: true, default: 0 })
  totalFromFineract: number;

  @Prop({ required: true, default: 0 })
  synced: number;

  @Prop({ required: true, default: 0 })
  errorCount: number;

  @Prop({ required: true, default: 0 })
  skipped: number;

  @Prop({ required: false })
  message?: string;
}

export const LoanSyncRunSchema = SchemaFactory.createForClass(LoanSyncRun);
LoanSyncRunSchema.index({ ranAt: -1 });
