/**
 * Smart OTP Service
 * Xử lý Smart OTP với Device Binding phía client
 * 
 * Features:
 * - Generate ECDSA key pair
 * - Secure storage for keys
 * - TOTP generation (local, no network)
 * - Signature generation for device binding
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { ec as EC } from 'elliptic';
import { Buffer } from 'buffer';
import { generateSync } from 'otplib';
import api from '../core/api';
import type {
  DeviceFingerprint,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  SmartOtpStatus,
  DeviceBindingInfo,
} from '../types/otp.types';

// TOTP Configuration (must match server)
const TOTP_CONFIG = {
  digits: 6,
  step: 30, // 30 seconds
};

// SecureStore keys
const STORAGE_KEYS = {
  DEVICE_BINDING: 'smart_otp_device_binding',
  TOTP_SECRET: 'smart_otp_totp_secret',
  PRIVATE_KEY: 'smart_otp_private_key',
  PUBLIC_KEY: 'smart_otp_public_key',
  DEVICE_ID: 'smart_otp_device_id',
};

const ec = new EC('p256');

/**
 * Get unique device identifier
 */
const getDeviceId = async (): Promise<string> => {
  // Try to get stored device ID first
  let deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    // Generate new device ID based on device info
    const deviceInfo = [
      Device.deviceName || '',
      Device.modelName || '',
      Device.osName || '',
      Device.osVersion || '',
      Application.applicationId || '',
      Date.now().toString(),
    ].join('|');

    deviceId = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      deviceInfo,
    );

    // Store for future use
    await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
};

/**
 * Get device fingerprint for registration
 */
export const getDeviceFingerprint = async (): Promise<DeviceFingerprint> => {
  const deviceId = await getDeviceId();

  return {
    deviceId,
    deviceName: Device.deviceName || 'Unknown Device',
    model: Device.modelName || undefined,
    brand: Device.brand || undefined,
    os: Device.osName || undefined,
    osVersion: Device.osVersion || undefined,
    appVersion: Application.nativeApplicationVersion || undefined,
    buildNumber: Application.nativeBuildVersion || undefined,
  };
};

/**
 * Generate ECDSA key pair for device binding
 * Uses expo-crypto for random bytes (elliptic's genKeyPair uses Node crypto which fails in RN)
 */
const generateKeyPair = async (): Promise<{ privateKey: string; publicKey: string }> => {
  try {
    console.log('[SmartOTPService] Generating ECDSA key pair (P-256)...');
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const privateKeyHex = Array.from(randomBytes)
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('');
    const key = ec.keyFromPrivate(privateKeyHex, 'hex');
    const privateKey = String(key.getPrivate('hex'));
    const publicKey = String(key.getPublic('hex'));

    await SecureStore.setItemAsync(STORAGE_KEYS.PRIVATE_KEY, privateKey);
    await SecureStore.setItemAsync(STORAGE_KEYS.PUBLIC_KEY, publicKey);

    console.log('[SmartOTPService] ECDSA key pair generated and stored successfully');
    return { privateKey, publicKey };
  } catch (error) {
    console.error('[SmartOTPService] generateKeyPair error:', error);
    throw error;
  }
};

/**
 * Sign payload for device binding verification
 */
const signPayload = async (
  otp: string,
  timestamp: number,
  actionType: string,
): Promise<string> => {
  const privateKeyHex = await SecureStore.getItemAsync(STORAGE_KEYS.PRIVATE_KEY);
  if (!privateKeyHex) {
    throw new Error('Private key not found. Please register device first.');
  }

  const payload = `${otp}:${timestamp}:${actionType}`;

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  const key = ec.keyFromPrivate(privateKeyHex, 'hex');
  const signature = key.sign(hash);
  const derSign = signature.toDER();

  return Buffer.from(derSign).toString('base64');
};

/**
 * Generate TOTP code locally
 */
const generateTOTP = async (): Promise<string> => {
  try {
    const totpSecret = await SecureStore.getItemAsync(STORAGE_KEYS.TOTP_SECRET);

    if (!totpSecret) {
      throw new Error('TOTP secret not found. Please register device first.');
    }

    // otplib v13 functional API
    const code = generateSync({ secret: totpSecret });
    return code;
  } catch (error) {
    console.error('[SmartOTPService] generateTOTP error:', error);
    throw error;
  }
};

/**
 * Get remaining seconds until OTP changes
 */
const getRemainingSeconds = (): number => {
  const epoch = Math.floor(Date.now() / 1000);
  return TOTP_CONFIG.step - (epoch % TOTP_CONFIG.step);
};

/**
 * Get current time step
 */
const getTimeStep = (): number => {
  return Math.floor(Date.now() / 1000 / TOTP_CONFIG.step);
};

/**
 * Check if device is registered
 */
const isDeviceRegistered = async (): Promise<boolean> => {
  const binding = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_BINDING);
  const secret = await SecureStore.getItemAsync(STORAGE_KEYS.TOTP_SECRET);
  return !!binding && !!secret;
};

/**
 * Get stored device binding info
 */
const getDeviceBinding = async (): Promise<DeviceBindingInfo | null> => {
  const bindingStr = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_BINDING);
  if (!bindingStr) return null;

  try {
    return JSON.parse(bindingStr);
  } catch {
    return null;
  }
};

// ==================== API Calls ====================

/**
 * Register device with server
 */
const registerDevice = async (verificationToken?: string): Promise<RegisterDeviceResponse> => {
  console.log('[SmartOTPService] Registering device...');

  // Generate key pair
  const { publicKey } = await generateKeyPair();

  // Get device info
  const deviceFingerprint = await getDeviceFingerprint();

  // Call server API
  const response = await api.post<RegisterDeviceResponse>(
    '/api/otp/register-device',
    {
      publicKey,
      deviceFingerprint,
      verificationToken,
    },
  );

  if (response.data.success) {
    const payload = response.data.data ?? response.data;
    const deviceId = String(payload.deviceId ?? '');
    const totpSecret = String(payload.totpSecret ?? '');

    if (!totpSecret) {
      throw new Error('Server không trả về TOTP secret');
    }

    await SecureStore.setItemAsync(STORAGE_KEYS.TOTP_SECRET, totpSecret);

    const binding: DeviceBindingInfo = {
      deviceId,
      deviceName: deviceFingerprint.deviceName || 'Unknown Device',
      registeredAt: new Date().toISOString(),
      fingerprint: deviceFingerprint,
    };
    await SecureStore.setItemAsync(
      STORAGE_KEYS.DEVICE_BINDING,
      JSON.stringify(binding),
    );

    console.log('[SmartOTPService] Device registered successfully');

    return response.data;
  }

  throw new Error('Failed to register device');
};

/**
 * Get registered devices from server
 */
const getRegisteredDevices = async (): Promise<DeviceBindingInfo[]> => {
  const response = await api.get<{ success: boolean; data?: { devices?: DeviceBindingInfo[] }; devices?: DeviceBindingInfo[] }>(
    '/api/otp/devices',
  );
  const payload = response.data.data ?? response.data;
  return payload.devices || [];
};

/**
 * Revoke a device
 */
const revokeDevice = async (deviceId: string): Promise<void> => {
  await api.delete(`/api/otp/revoke-device/${deviceId}`);

  // Clear local storage if revoking current device
  const currentDeviceId = await getDeviceId();
  if (deviceId === currentDeviceId) {
    await clearDeviceBinding();
  }
};

/**
 * Request OTP session for action
 */
const requestOTPSession = async (
  actionType: string,
  actionData: Record<string, any> = {},
): Promise<RequestOtpResponse> => {
  const deviceId = await getDeviceId();

  const response = await api.post<RequestOtpResponse>('/api/otp/request', {
    deviceId,
    actionType,
    actionData,
  });
  const payload = response.data.data ?? response.data;
  return payload as RequestOtpResponse;
};

/**
 * Verify OTP for transaction
 */
const verifyOTP = async (
  sessionId: string,
  otp: string,
  actionType: string,
): Promise<VerifyOtpResponse> => {
  const deviceId = await getDeviceId();
  const timestamp = Math.floor(Date.now() / 1000);

  // Sign the payload
  const signature = await signPayload(otp, timestamp, actionType);

  const response = await api.post<VerifyOtpResponse>('/api/otp/verify', {
    sessionId,
    otp,
    signature,
    timestamp,
    deviceId,
    actionType,
  });
  const payload = response.data.data ?? response.data;
  return payload as VerifyOtpResponse;
};

/**
 * Get OTP session status
 */
const getSessionStatus = async (sessionId: string) => {
  const response = await api.get(`/api/otp/session/${sessionId}`);
  return response.data;
};

/**
 * Get Smart OTP status for current user
 */
const getSmartOTPStatus = async (): Promise<SmartOtpStatus> => {
  const response = await api.get<{ success: boolean } & SmartOtpStatus>('/api/otp/status');
  return response.data;
};

/**
 * Clear device binding (logout/revoke)
 */
const clearDeviceBinding = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_BINDING);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.TOTP_SECRET);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.PRIVATE_KEY);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.PUBLIC_KEY);
  // Keep DEVICE_ID for consistency
};

// ==================== Export ====================

const SmartOTPService = {
  // Local operations
  generateKeyPair,
  generateTOTP,
  signPayload,
  getRemainingSeconds,
  getTimeStep,

  // Device info
  getDeviceId,
  getDeviceFingerprint,
  isDeviceRegistered,
  getDeviceBinding,
  clearDeviceBinding,

  // API calls
  registerDevice,
  getRegisteredDevices,
  revokeDevice,
  requestOTPSession,
  verifyOTP,
  getSessionStatus,
  getSmartOTPStatus,

  // Config
  TOTP_CONFIG,
};

export default SmartOTPService;
