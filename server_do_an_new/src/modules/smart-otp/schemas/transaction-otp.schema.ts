import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OtpActionType } from '../enums/otp-action-type.enum';
import { OtpSessionStatus } from '../enums/otp-session-status.enum';

/**
 * Transaction OTP Schema
 * Lưu trữ OTP session cho từng giao dịch
 * Mỗi khi user thực hiện action cần OTP, một session mới được tạo với thời hạn 5 phút
 */
@Schema({ timestamps: true, collection: 'transaction_otps' })
export class TransactionOtp extends Document {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string; // UUID unique cho session

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  deviceId: string;

  @Prop({
    type: String,
    enum: OtpActionType,
    required: true,
    index: true,
  })
  actionType: OtpActionType;

  @Prop({ type: Object, default: {} })
  actionData: Record<string, any>; // Dữ liệu giao dịch (để verify sau khi OTP success)

  @Prop({
    type: String,
    enum: OtpSessionStatus,
    default: OtpSessionStatus.PENDING,
    index: true,
  })
  status: OtpSessionStatus;

  @Prop({ required: true, index: true })
  expiresAt: Date; // Thời điểm hết hạn (5 phút từ lúc tạo)

  @Prop({ default: 0 })
  attempts: number; // Số lần thử (max 3)

  @Prop()
  verifiedAt?: Date; // Thời điểm xác thực thành công

  @Prop()
  completedAt?: Date; // Thời điểm hoàn tất (sau khi consume)

  @Prop()
  ipAddress?: string; // IP request (cho security audit)

  @Prop()
  userAgent?: string; // User agent (cho security audit)
}

export const TransactionOtpSchema = SchemaFactory.createForClass(TransactionOtp);

// TTL index: tự động xóa records sau 24 giờ
TransactionOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Index cho cleanup expired sessions
TransactionOtpSchema.index({ status: 1, expiresAt: 1 });

// Index cho tìm kiếm session pending của user
TransactionOtpSchema.index({ userId: 1, status: 1, expiresAt: 1 });
