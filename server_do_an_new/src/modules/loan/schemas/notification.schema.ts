import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationType =
  | 'loan_approved'
  | 'loan_rejected'
  | 'loan_disbursed'
  | 'contract_ready'
  | 'contract_signed'
  | 'repayment_due'
  | 'repayment_received'
  | 'overdue_reminder'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'kyc_update_requested'
  | 'general';

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, default: 'general' })
  type: NotificationType;

  @Prop({ default: false })
  read: boolean;

  /** Optional data payload — chứa thông tin liên quan (loanId, contractId, etc.) */
  @Prop({ type: Object, default: {} })
  data: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
