import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'crypto';

export enum DelinquencyCollectionStage {
  NONE = 'NONE',
  REMINDER = 'REMINDER',
  WARNING = 'WARNING',
  COLLECTION = 'COLLECTION',
  LEGAL = 'LEGAL',
  WRITE_OFF = 'WRITE_OFF',
}

@Schema({ timestamps: true, collection: 'delinquency_policy' })
export class DelinquencyPolicy extends Document {
  @Prop({ required: true, default: () => randomUUID(), unique: true, index: true })
  policy_id: string;

  @Prop({ required: true, unique: true, index: true })
  debt_group: number;

  @Prop({ required: true })
  debt_group_name: string;

  @Prop({ required: true, default: true })
  send_email: boolean;

  @Prop({ required: true, default: true })
  send_sms: boolean;

  @Prop({ required: true, default: true })
  send_notification: boolean;

  @Prop({ required: true, default: false })
  apply_penalty: boolean;

  @Prop({ required: true, default: false })
  block_new_loan: boolean;

  @Prop({
    required: true,
    enum: Object.values(DelinquencyCollectionStage),
    default: DelinquencyCollectionStage.REMINDER,
  })
  collection_stage: DelinquencyCollectionStage;

  @Prop({ required: true, default: false })
  legal_escalation: boolean;

  @Prop({ required: true, default: true })
  is_active: boolean;

  @Prop({ required: false })
  description?: string;
}

export const DelinquencyPolicySchema = SchemaFactory.createForClass(DelinquencyPolicy);
DelinquencyPolicySchema.index({ is_active: 1, debt_group: 1 }, { name: 'idx_policy_active_group' });
