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

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import * as Application from "expo-application";
import { ec as EC } from "elliptic";
import { Buffer } from "buffer";
import { generateSync } from "otplib";
import api from "../core/api";
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
} from "../types/otp.types";

// TOTP Configuration (must match server)
const TOTP_CONFIG = {
  digits: 6,
  step: 30, // 30 seconds
};

// SecureStore keys
const STORAGE_KEYS = {
  DEVICE_BINDING: "smart_otp_device_binding",
  TOTP_SECRET: "smart_otp_totp_secret",
  PRIVATE_KEY: "smart_otp_private_key",
  PUBLIC_KEY: "smart_otp_public_key",
  DEVICE_ID: "smart_otp_device_id",
};

const ec = new EC("p256");

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

/**
 * Get unique device identifier
 */
const getDeviceId = async (): Promise<string> => {
  // Try to get stored device ID first
  let deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    // Generate new device ID based on device info
    const deviceInfo = [
      Device.deviceName || "",
      Device.modelName || "",
      Device.osName || "",
      Device.osVersion || "",
      Application.applicationId || "",
      Date.now().toString(),
    ].join("|");

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
    deviceName: Device.deviceName || "Unknown Device",
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
const generateKeyPair = async (): Promise<{
  privateKey: string;
  publicKey: string;
}> => {
  try {
    console.log("[SmartOTPService] Generating ECDSA key pair (P-256)...");
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const privateKeyHex = Array.from(randomBytes)
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("");
    const key = ec.keyFromPrivate(privateKeyHex, "hex");
    const privateKey = String(key.getPrivate("hex"));
    const publicKey = String(key.getPublic("hex"));

    await SecureStore.setItemAsync(STORAGE_KEYS.PRIVATE_KEY, privateKey);
    await SecureStore.setItemAsync(STORAGE_KEYS.PUBLIC_KEY, publicKey);

    console.log(
      "[SmartOTPService] ECDSA key pair generated and stored successfully",
    );
    return { privateKey, publicKey };
  } catch (error) {
    console.error("[SmartOTPService] generateKeyPair error:", error);
    throw error;
  }
};

/**
 * Sign payload for device binding verification
 * Uses same flow as server: SHA256(payload) → elliptic sign → DER → base64
 */
const signPayload = async (
  otp: string,
  timestamp: number,
  actionType: string,
): Promise<string> => {
  const privateKeyHex = await SecureStore.getItemAsync(
    STORAGE_KEYS.PRIVATE_KEY,
  );
  if (!privateKeyHex) {
    throw new Error("Private key not found. Please register device first.");
  }

  // Verify key integrity: derive public key and compare with stored
  const storedPublicKey = await SecureStore.getItemAsync(
    STORAGE_KEYS.PUBLIC_KEY,
  );
  const key = ec.keyFromPrivate(privateKeyHex, "hex");
  const derivedPublicKey = String(key.getPublic("hex"));
  if (storedPublicKey && derivedPublicKey !== storedPublicKey) {
    console.warn(
      "[SmartOTPService] Key integrity mismatch! Stored public key differs from derived. Clearing binding.",
    );
    await clearDeviceBinding();
    throw new Error(
      "Khóa bảo mật không hợp lệ. Vui lòng đăng ký lại Smart OTP.",
    );
  }

  const payload = `${otp}:${timestamp}:${actionType}`;

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  console.log(
    `[SmartOTPService] signPayload | payload=${payload} | hashPrefix=${hash.substring(0, 16)}...`,
  );

  const signature = key.sign(hash);
  const derSign = signature.toDER();

  return Buffer.from(derSign).toString("base64");
};

/**
 * Generate TOTP code locally
 */
const generateTOTP = async (): Promise<string> => {
  try {
    const totpSecret = await SecureStore.getItemAsync(STORAGE_KEYS.TOTP_SECRET);

    if (!totpSecret) {
      throw new Error("TOTP secret not found. Please register device first.");
    }

    // otplib v13 functional API
    const code = generateSync({ secret: totpSecret });

    const remaining = getRemainingSeconds();
    const step = getTimeStep();
    console.log("========== [CLIENT] SMART OTP GENERATED ==========");
    console.log(`OTP Code: ${code}`);
    console.log(`Remaining: ${remaining}s`);
    console.log(`Time Step: ${step}`);
    console.log(`Local Time: ${new Date().toISOString()}`);
    console.log("==================================================");

    return code;
  } catch (error) {
    console.error("[SmartOTPService] generateTOTP error:", error);
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
  const bindingStr = await SecureStore.getItemAsync(
    STORAGE_KEYS.DEVICE_BINDING,
  );
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
const registerDevice = async (
  verificationToken?: string,
): Promise<RegisterDeviceResponse> => {
  console.log("[SmartOTPService] Registering device...");

  // Generate key pair
  const { publicKey } = await generateKeyPair();

  // Get device info
  const deviceFingerprint = await getDeviceFingerprint();

  // Call server API
  const response = await api.post<RegisterDeviceResponse>(
    "/api/otp/register-device",
    {
      publicKey,
      deviceFingerprint,
      verificationToken,
    },
  );

  const rawData = response.data as any;
  console.log(
    "[SmartOTPService] Register response rawData keys:",
    Object.keys(rawData || {}),
  );

  // Unwrap: response.data can be { success, data: {...} } or { success, deviceId, totpSecret }
  const payload = rawData?.data ?? rawData;
  const isSuccess = Boolean(rawData?.success ?? payload?.success);

  if (isSuccess || payload?.deviceId) {
    const deviceId = String(payload.deviceId ?? "");
    const totpSecret = String(payload.totpSecret ?? "");

    if (!totpSecret) {
      throw new Error("Server không trả về TOTP secret");
    }

    await SecureStore.setItemAsync(STORAGE_KEYS.TOTP_SECRET, totpSecret);

    const binding: DeviceBindingInfo = {
      deviceId,
      deviceName: deviceFingerprint.deviceName || "Unknown Device",
      registeredAt: new Date().toISOString(),
      fingerprint: deviceFingerprint,
    };
    await SecureStore.setItemAsync(
      STORAGE_KEYS.DEVICE_BINDING,
      JSON.stringify(binding),
    );

    console.log("[SmartOTPService] Device registered successfully");

    return { success: true, deviceId, totpSecret } as any;
  }

  console.error(
    "[SmartOTPService] Register failed - payload:",
    JSON.stringify(payload),
  );
  throw new Error("Failed to register device");
};

/**
 * Get registered devices from server
 */
const getRegisteredDevices = async (): Promise<DeviceBindingInfo[]> => {
  const response = await api.get<{
    success: boolean;
    data?: { devices?: DeviceBindingInfo[] };
    devices?: DeviceBindingInfo[];
  }>("/api/otp/devices");
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

  const response = await api.post<RequestOtpResponse>("/api/otp/request", {
    deviceId,
    actionType,
    actionData,
  });
  const envelope = response.data as
    | RequestOtpResponse
    | ApiEnvelope<RequestOtpResponse>;
  const payload = ((envelope as ApiEnvelope<RequestOtpResponse>).data ??
    envelope) as RequestOtpResponse;
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

  console.log("========== [CLIENT] VERIFYING OTP ==========");
  console.log(`Session ID: ${sessionId}`);
  console.log(`Action Type: ${actionType}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Signing Timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
  console.log(`Device ID: ${deviceId}`);

  // Sign the payload
  const signature = await signPayload(otp, timestamp, actionType);
  console.log(`Signature Base64: ${signature.substring(0, 20)}...`);

  const response = await api.post<VerifyOtpResponse>("/api/otp/verify", {
    sessionId,
    otp,
    signature,
    timestamp,
    deviceId,
    actionType,
  });
  console.log("Server Response:", JSON.stringify(response.data));
  console.log("============================================");

  const envelope: any = response.data;
  const payload: any = envelope?.data ?? envelope;

  const verified = Boolean(payload?.verified ?? payload?.data?.verified);
  const message =
    payload?.message ??
    envelope?.message ??
    (verified ? "Xác thực OTP thành công" : "Xác thực OTP thất bại");

  return {
    success: Boolean(envelope?.success ?? verified),
    message,
    verified,
    actionData: payload?.actionData ?? payload?.data?.actionData,
  };
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
  const response = await api.get<{ success: boolean } & SmartOtpStatus>(
    "/api/otp/status",
  );
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
