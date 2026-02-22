import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'document_types' })
export class DocumentType extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  required: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ required: false })
  description?: string;
}

export const DocumentTypeSchema = SchemaFactory.createForClass(DocumentType);
DocumentTypeSchema.index({ name: 1 });
DocumentTypeSchema.index({ sortOrder: 1 });
