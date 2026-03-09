import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'permissions' })
export class Permission extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Role', required: true, index: true })
  roleId: Types.ObjectId;

  /** CASL action: manage, create, read, update, delete, approve, disburse */
  @Prop({ required: true })
  action: string;

  /** CASL subject: LoanProduct, Customer, Loan ... or 'all' */
  @Prop({ required: true })
  subject: string;

  /** true = can, false = cannot (deny rule) */
  @Prop({ default: true })
  allowed: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);

PermissionSchema.index({ roleId: 1, action: 1, subject: 1 }, { unique: true });
