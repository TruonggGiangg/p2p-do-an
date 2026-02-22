import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Links a Fineract loan product (by id) to document types with optional override for required/sortOrder.
 */
@Schema({ timestamps: true, collection: 'loan_product_document_types' })
export class LoanProductDocumentType extends Document {
  /** Fineract loan product id */
  @Prop({ required: true, index: true })
  fineractProductId: number;

  @Prop({ type: Types.ObjectId, ref: 'DocumentType', required: true, index: true })
  documentTypeId: Types.ObjectId;

  @Prop({ default: false })
  required: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const LoanProductDocumentTypeSchema = SchemaFactory.createForClass(LoanProductDocumentType);
LoanProductDocumentTypeSchema.index({ fineractProductId: 1, documentTypeId: 1 }, { unique: true });
LoanProductDocumentTypeSchema.index({ fineractProductId: 1 });
