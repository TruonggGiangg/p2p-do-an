import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Một thay đổi theo trường (để truy vết) */
export interface LoanSyncChangeItem {
  field: string;
  label: string;
  before: any;
  after: any;
}

/** Chi tiết đồng bộ từng khoản vay */
export interface LoanSyncRunDetailItem {
  fineractLoanId: number;
  status: 'synced' | 'skipped' | 'error';
  message?: string;
  changes?: LoanSyncChangeItem[];
}

/**
 * Log mỗi lần chạy batch đồng bộ khoản vay từ Fineract (cron 2h sáng hoặc nút "Đồng bộ khoản vay").
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

  /** Chi tiết từng khoản: trạng thái và danh sách thay đổi (field-level) để truy vết */
  @Prop({ type: [Object], default: [] })
  details?: LoanSyncRunDetailItem[];
}

export const LoanSyncRunSchema = SchemaFactory.createForClass(LoanSyncRun);
LoanSyncRunSchema.index({ ranAt: -1 });
