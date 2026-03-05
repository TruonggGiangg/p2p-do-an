import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'activity_logs' })
export class ActivityLog extends Document {
  /** MongoDB _id của user thực hiện hành động */
  @Prop({ required: true })
  userId: string;

  /** Tên đăng nhập / username */
  @Prop({ required: true })
  username: string;

  /** Vai trò: admin | staff */
  @Prop({ required: true })
  userRole: string;

  /** HTTP method: POST | PUT | PATCH | DELETE */
  @Prop({ required: true })
  method: string;

  /** Đường dẫn endpoint, ví dụ /api/admin/staff */
  @Prop({ required: true })
  path: string;

  /** Mô tả hành động bằng tiếng Việt (tự sinh từ method + path) */
  @Prop({ required: true })
  action: string;

  /** HTTP status code phản hồi */
  @Prop()
  statusCode: number;

  /** Body gửi lên (đã loại bỏ password) */
  @Prop({ type: Object })
  requestBody: Record<string, any>;

  /** Message trả về từ server */
  @Prop()
  responseMessage: string;

  /** Địa chỉ IP */
  @Prop()
  ip: string;

  /** User-Agent trình duyệt */
  @Prop()
  userAgent: string;

  /** Thông tin đối tượng bị tác động (người vay, khoản vay…) */
  @Prop({ type: Object })
  targetInfo: Record<string, any>;

  /** Thời gian xử lý (ms) */
  @Prop()
  duration: number;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// Index cho truy vấn phân trang theo thời gian và userId
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
