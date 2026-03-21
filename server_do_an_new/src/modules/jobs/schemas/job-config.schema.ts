import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'job_configs' })
export class JobConfig extends Document {
  @Prop({ required: true, unique: true, index: true })
  jobName: string;

  @Prop({ type: Number, default: null })
  intervalMs: number | null;

  @Prop({ type: String, default: null })
  scheduleTime: string | null;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: Object, default: {} })
  params: Record<string, any>;
}

export const JobConfigSchema = SchemaFactory.createForClass(JobConfig);
