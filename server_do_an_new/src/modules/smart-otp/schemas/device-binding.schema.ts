import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DeviceStatus } from '../enums/device-status.enum';

/**
 * Device Fingerprint Interface
 */
export interface DeviceFingerprint {
  os?: string; // iOS, Android
  osVersion?: string;
  model?: string; // iPhone 15, Galaxy S24
  brand?: string; // Apple, Samsung
  buildNumber?: string;
  appVersion?: string;
}

/**
 * Device Binding Schema
 * Lưu trữ thiết bị đã ràng buộc với Smart OTP
 * Mỗi user có thể đăng ký tối đa 3 devices
 */
@Schema({ timestamps: true, collection: 'device_bindings' })
export class DeviceBinding extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  deviceId: string; // Unique device identifier

  @Prop({ required: true, trim: true, default: 'Unknown Device' })
  deviceName: string;

  @Prop({ required: true })
  publicKey: string; // ECDSA public key (hex format)

  @Prop({ required: true })
  totpSecret: string; // TOTP shared secret (Base32 encoded)

  @Prop({
    type: {
      os: { type: String },
      osVersion: { type: String },
      model: { type: String },
      brand: { type: String },
      buildNumber: { type: String },
      appVersion: { type: String },
    },
    _id: false,
  })
  fingerprint?: DeviceFingerprint;

  @Prop({
    type: String,
    enum: DeviceStatus,
    default: DeviceStatus.ACTIVE,
    index: true,
  })
  status: DeviceStatus;

  @Prop()
  lastUsedAt?: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  registeredFromIP?: string;
}

export const DeviceBindingSchema = SchemaFactory.createForClass(DeviceBinding);

// Compound unique index: mỗi user chỉ có 1 record cho mỗi deviceId
DeviceBindingSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

// Index cho tìm kiếm nhanh devices active của user
DeviceBindingSchema.index({ userId: 1, status: 1 });
