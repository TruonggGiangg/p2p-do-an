import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConfigRateDocument = ConfigRate & Document;

@Schema({ timestamps: true })
export class ConfigRate {
  @Prop({ type: String, default: 'default' })
  name: string;

  @Prop({ type: Number, default: 15, required: true })
  factorConstant: number;

  @Prop({ type: Number, default: 0.01, required: true })
  ficoCoefficient: number;

  @Prop({ type: Number, default: 0.000001, required: true })
  capitalCoefficient: number;

  @Prop({ type: Number, default: 0.1, required: true })
  monthCoefficient: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ConfigRateSchema = SchemaFactory.createForClass(ConfigRate);

// Index để đảm bảo chỉ có 1 config active
ConfigRateSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

