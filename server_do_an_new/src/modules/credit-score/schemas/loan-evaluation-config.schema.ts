import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Cấu hình đánh giá khoản vay — lưu ngưỡng điểm tín dụng & hạn mức cho từng mức rủi ro.
 * Luôn chỉ có 1 bản ghi active (dùng singleton key 'current').
 * Mỗi lần admin cập nhật → tạo snapshot lịch sử (LoanEvaluationConfigHistory).
 */
@Schema({ collection: 'loan_evaluation_configs', timestamps: true })
export class LoanEvaluationConfig extends Document {
  /** Singleton key — luôn = 'current' */
  @Prop({ type: String, required: true, unique: true, default: 'current', index: true })
  key: string;

  /** Ngưỡng điểm tự động duyệt khoản vay (0-100). Chỉ duyệt khi score >= ngưỡng */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  autoApprovalScore: number;

  /** Rủi ro thấp: điểm tối đa (upper bound). VD: 100 → score từ (mediumRiskMaxScore+1) đến 100 */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  lowRiskMaxScore: number;

  /** Rủi ro thấp: khoản vay tối đa (VND) */
  @Prop({ type: Number, required: true, min: 0 })
  lowRiskMaxAmount: number;

  /** Rủi ro trung bình: điểm tối đa */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  mediumRiskMaxScore: number;

  /** Rủi ro trung bình: khoản vay tối đa (VND) */
  @Prop({ type: Number, required: true, min: 0 })
  mediumRiskMaxAmount: number;

  /** Rủi ro cao: điểm tối đa */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  highRiskMaxScore: number;

  /** Rủi ro cao: khoản vay tối đa (VND) */
  @Prop({ type: Number, required: true, min: 0 })
  highRiskMaxAmount: number;

  /** Admin cập nhật lần cuối */
  @Prop({ type: String })
  updatedBy?: string;
}

export const LoanEvaluationConfigSchema = SchemaFactory.createForClass(LoanEvaluationConfig);

/**
 * Lưu lịch sử mỗi lần admin thay đổi cấu hình đánh giá khoản vay.
 */
@Schema({ collection: 'loan_evaluation_config_histories', timestamps: true })
export class LoanEvaluationConfigHistory extends Document {
  @Prop({ type: Number, required: true })
  autoApprovalScore: number;

  @Prop({ type: Number, required: true })
  lowRiskMaxScore: number;

  @Prop({ type: Number, required: true })
  lowRiskMaxAmount: number;

  @Prop({ type: Number, required: true })
  mediumRiskMaxScore: number;

  @Prop({ type: Number, required: true })
  mediumRiskMaxAmount: number;

  @Prop({ type: Number, required: true })
  highRiskMaxScore: number;

  @Prop({ type: Number, required: true })
  highRiskMaxAmount: number;

  @Prop({ type: String })
  changedBy?: string;

  @Prop({ type: String })
  changeNote?: string;
}

export const LoanEvaluationConfigHistorySchema = SchemaFactory.createForClass(LoanEvaluationConfigHistory);
