import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'job_run_histories' })
export class JobRunHistory extends Document {
  @Prop({ required: true, index: true })
  jobName: string;

  @Prop({ required: true })
  runAt: Date;

  @Prop({ type: String, enum: ['running', 'success', 'error'], default: 'running' })
  status: 'running' | 'success' | 'error';

  @Prop({ type: Number, default: null })
  durationMs: number | null;

  @Prop({ type: Object, default: {} })
  params: Record<string, any>;

  @Prop({ type: Object, default: null })
  result: any;

  @Prop({ type: String, default: null })
  error: string | null;
}

export const JobRunHistorySchema = SchemaFactory.createForClass(JobRunHistory);
JobRunHistorySchema.index({ jobName: 1, runAt: -1 });
