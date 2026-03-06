/**
 * OTP Types
 * Shared types cho Smart OTP và 2FA
 */

// ==================== OTP Action Types ====================

export enum OtpActionType {
  LOAN_CREATE = "LOAN_CREATE",
  INVESTMENT = "INVESTMENT",
  TRANSFER = "TRANSFER",
  WITHDRAWAL = "WITHDRAWAL",
  DEVICE_REGISTER = "DEVICE_REGISTER",
  PASSWORD_CHANGE = "PASSWORD_CHANGE",
  PROFILE_UPDATE = "PROFILE_UPDATE",
  REPAYMENT = "REPAYMENT",
  PREPAY = "PREPAY",
  PIN_SETUP = "PIN_SETUP",
  PIN_CHANGE = "PIN_CHANGE",
  OTHER = "OTHER",
}

// ==================== Device Binding Types ====================

export interface DeviceFingerprint {
  deviceId: string;
  deviceName?: string;
  os?: string;
  osVersion?: string;
  model?: string;
  brand?: string;
  buildNumber?: string;
  appVersion?: string;
}

export interface DeviceBindingInfo {
  deviceId: string;
  deviceName: string;
  registeredAt: string;
  lastUsedAt?: string;
  fingerprint?: DeviceFingerprint;
}

// ==================== Smart OTP Session Types ====================

export interface SmartOtpSession {
  sessionId: string;
  actionType: OtpActionType;
  expiresAt: string;
  expiresIn: number;
}

export interface SmartOtpStatus {
  enabled: boolean;
  registeredDevices: number;
  maxDevices: number;
  devices: DeviceBindingInfo[];
}

// ==================== Smart OTP Request/Response Types ====================

export interface RegisterDeviceRequest {
  publicKey: string;
  deviceFingerprint: DeviceFingerprint;
  verificationToken?: string;
}

export interface RegisterDeviceResponse {
  success: boolean;
  message: string;
  deviceId: string;
  totpSecret: string;
}

export interface RequestOtpRequest {
  deviceId: string;
  actionType: OtpActionType;
  actionData?: Record<string, any>;
}

export interface RequestOtpResponse {
  success: boolean;
  message: string;
  sessionId: string;
  expiresAt: string;
  expiresIn: number;
}

export interface VerifyOtpRequest {
  sessionId: string;
  otp: string;
  signature: string;
  timestamp: number;
  deviceId: string;
  actionType: OtpActionType;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  verified?: boolean;
  actionData?: Record<string, any>;
}

// ==================== Two Factor Types ====================

export interface TwoFactorSecret {
  secret: string;
  otpauthUrl: string;
  qrCodeUrl?: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
}
