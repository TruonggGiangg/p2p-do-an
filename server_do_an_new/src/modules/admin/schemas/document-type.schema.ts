import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum FileFormat {
  IMAGE = 'image',
  PDF = 'pdf',
  ANY = 'any',
}

@Schema({ timestamps: true, collection: 'document_types' })
export class DocumentType extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  required: boolean;

  @Prop({ required: false })
  description?: string;

  @Prop({ type: String, enum: FileFormat, default: FileFormat.ANY })
  fileFormat: FileFormat;
}

export const DocumentTypeSchema = SchemaFactory.createForClass(DocumentType);
DocumentTypeSchema.index({ name: 1 });
