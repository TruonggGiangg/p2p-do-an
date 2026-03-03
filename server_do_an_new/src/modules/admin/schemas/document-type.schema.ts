import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Loại trường nhập liệu cho tài liệu
 * - file: Đính kèm file (upload)
 * - text: Ô nhập text tự do
 * - select: Dropdown chọn 1 giá trị từ danh sách options
 * - button: Giống select, hiển thị dạng nhóm button chọn
 */
export enum DocumentFieldType {
  FILE = 'file',
  TEXT = 'text',
  SELECT = 'select',
  BUTTON = 'button',
}

@Schema({ timestamps: true, collection: 'document_types' })
export class DocumentType extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  required: boolean;

  @Prop({ required: false })
  description?: string;

  @Prop({ type: String, enum: DocumentFieldType, default: DocumentFieldType.FILE })
  fieldType: DocumentFieldType;

  @Prop({ type: [String], default: [] })
  options: string[];
}

export const DocumentTypeSchema = SchemaFactory.createForClass(DocumentType);
DocumentTypeSchema.index({ name: 1 });
