import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Schema({ timestamps: true, collection: 'users' })
export class User extends Document {
  @Prop({ required: true, unique: true })
  keycloakId: string;

  @Prop({ required: false, index: true, sparse: true })
  fineractClientId?: string; // Optional, indexed for lookups

  @Prop({ required: true, unique: true, index: true })
  username: string; // Phone number

  @Prop({ required: false })
  email?: string;

  @Prop({
    type: {
      firstName: { type: String },
      lastName: { type: String },
      avatar: { type: String },
    },
    _id: false,
  })
  profile: {
    firstName: string;
    lastName: string;
    avatar?: string;
  };

  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Prop({ type: Object, default: {}, required: false })
  metadata?: Record<string, any>; // Optional metadata for extensibility
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes for efficient queries
UserSchema.index({ fineractClientId: 1 }); // For Fineract client lookup
UserSchema.index({ username: 1 }); // Already unique, but explicit index for queries
UserSchema.index({ keycloakId: 1 }); // Already unique, but explicit index for queries
