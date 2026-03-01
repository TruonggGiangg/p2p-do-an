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

  @Prop({
    type: String,
    enum: ['NONE', 'PENDING', 'VERIFIED', 'REJECTED'],
    default: 'NONE',
  })
  kycStatus: string;

  @Prop({ type: Object, default: null, required: false })
  kycData?: any;

  @Prop({ type: Object, default: {}, required: false })
  metadata?: Record<string, any>; // Optional metadata for extensibility

  // Smart OTP Configuration (optional)
  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      maxDevices: { type: Number, default: 3 },
      registeredDevices: { type: Number, default: 0 },
      lockedUntil: { type: Date },
      otpAttempts: { type: Number, default: 0 },
      lastOtpAt: { type: Date },
    },
    _id: false,
    required: false,
  })
  smartOTP?: {
    enabled: boolean;
    maxDevices: number;
    registeredDevices: number;
    lockedUntil?: Date;
    otpAttempts: number;
    lastOtpAt?: Date;
  };

  // Two Factor Authentication Configuration (optional)
  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      secret: { type: String },
      enabledAt: { type: Date },
    },
    _id: false,
    required: false,
  })
  twoFactor?: {
    enabled: boolean;
    secret?: string;
    enabledAt?: Date;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes for efficient queries
UserSchema.index({ fineractClientId: 1 }); // For Fineract client lookup
UserSchema.index({ username: 1 }); // Already unique, but explicit index for queries
UserSchema.index({ keycloakId: 1 }); // Already unique, but explicit index for queries
