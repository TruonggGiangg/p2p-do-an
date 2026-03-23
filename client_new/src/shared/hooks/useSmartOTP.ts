/**
 * useSmartOTP Hook
 * React Hook quản lý Smart OTP state và operations
 *
 * Features:
 * - Auto-refresh OTP mỗi 30 giây
 * - Device registration status
 * - OTP verification flow
 */

import { useState, useEffect, useCallback, useRef } from "react";
import SmartOTPService from "../../services/smart-otp.service";
import type {
  DeviceBindingInfo,
  SmartOtpSession,
  OtpActionType,
} from "../../types/otp.types";

/**
 * Smart OTP Hook
 */
export const useSmartOTP = () => {
  // State
  const [otp, setOtp] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceBindingInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<SmartOtpSession | null>(
    null,
  );

  // Refs for cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeStepRef = useRef<number | null>(null);

  // ==================== Initialize ====================

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if device is registered LOCALLY
        let registered = await SmartOTPService.isDeviceRegistered();

        // If locally registered, verify with SERVER if online
        if (registered) {
          try {
            const deviceId = await SmartOTPService.getDeviceId();
            const serverDevices = await SmartOTPService.getRegisteredDevices();

            // Check if this device exists on server
            const isDeviceOnServer = serverDevices.some(
              (d) => d.deviceId === deviceId,
            );

            if (!isDeviceOnServer) {
              console.warn(
                "[useSmartOTP] Device registered locally but NOT on server. Clearing local binding.",
              );
              await SmartOTPService.clearDeviceBinding();
              registered = false;
            } else {
              setDevices(serverDevices);
            }
          } catch (serverErr: any) {
            // Network error or server error - keep local state but log warning
            console.warn(
              "[useSmartOTP] Could not verify device with server:",
              serverErr.message,
            );
          }
        }

        setIsRegistered(registered);

        if (registered) {
          // Generate initial OTP
          try {
            const initialOtp = await SmartOTPService.generateTOTP();
            setOtp(initialOtp);
            setTimeRemaining(SmartOTPService.getRemainingSeconds());
          } catch (genErr) {
            console.error(
              "[useSmartOTP] Failed to generate initial OTP:",
              genErr,
            );
            setIsRegistered(false); // Fallback to unregistered if secret missing
          }
        }
      } catch (err: any) {
        console.error("[useSmartOTP] Init error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // ==================== OTP Timer ====================

  useEffect(() => {
    if (!isRegistered) return;

    const updateOTP = async () => {
      const remaining = SmartOTPService.getRemainingSeconds();
      setTimeRemaining(remaining);

      // Check if time step changed (new OTP needed)
      const currentTimeStep = SmartOTPService.getTimeStep();
      if (lastTimeStepRef.current !== currentTimeStep) {
        lastTimeStepRef.current = currentTimeStep;
        try {
          const newOtp = await SmartOTPService.generateTOTP();
          setOtp(newOtp);
        } catch (err) {
          console.error("[useSmartOTP] Generate OTP error in loop:", err);
          setIsRegistered(false); // Fallback if secret somehow disappears
        }
      }
    };

    // Initial update
    updateOTP();

    // Update every second
    timerRef.current = setInterval(updateOTP, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRegistered]);

  // ==================== Device Registration ====================

  const registerDevice = useCallback(
    async (verificationToken?: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await SmartOTPService.registerDevice(verificationToken);

        if (result.success) {
          setIsRegistered(true);

          // Generate initial OTP
          const initialOtp = await SmartOTPService.generateTOTP();
          setOtp(initialOtp);
          setTimeRemaining(SmartOTPService.getRemainingSeconds());

          // Refresh devices list
          await fetchDevices();

          return true;
        }

        return false;
      } catch (err: any) {
        console.error("[useSmartOTP] Register error:", err);
        setError(err.response?.data?.message || err.message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ==================== Get Devices ====================

  const fetchDevices = useCallback(async (): Promise<DeviceBindingInfo[]> => {
    try {
      const deviceList = await SmartOTPService.getRegisteredDevices();
      setDevices(deviceList);
      return deviceList;
    } catch (err: any) {
      console.error("[useSmartOTP] Fetch devices error:", err);
      return [];
    }
  }, []);

  // ==================== Revoke Device ====================

  const revokeDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        await SmartOTPService.revokeDevice(deviceId);

        // Refresh devices list
        await fetchDevices();

        // Check if current device was revoked
        const registered = await SmartOTPService.isDeviceRegistered();
        setIsRegistered(registered);

        if (!registered) {
          setOtp("");
        }

        return true;
      } catch (err: any) {
        console.error("[useSmartOTP] Revoke error:", err);
        setError(err.response?.data?.message || err.message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchDevices],
  );

  // ==================== OTP Session (for transactions) ====================

  const requestOTPSession = useCallback(
    async (
      actionType: OtpActionType,
      actionData: Record<string, any> = {},
    ): Promise<SmartOtpSession | null> => {
      if (!isRegistered) {
        setError("Device not registered");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const session = await SmartOTPService.requestOTPSession(
          actionType,
          actionData,
        );

        const mappedSession: SmartOtpSession = {
          sessionId: session.sessionId,
          actionType,
          expiresAt: session.expiresAt,
          expiresIn: session.expiresIn,
        };

        setCurrentSession(mappedSession);
        return mappedSession;
      } catch (err: any) {
        console.error("[useSmartOTP] Request session error:", err);
        setError(err.response?.data?.message || err.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isRegistered],
  );

  // ==================== Verify OTP ====================

  const verifyOTP = useCallback(
    async (
      sessionId: string,
      otpCode: string,
      actionType: OtpActionType,
    ): Promise<{ valid: boolean; message: string; actionData?: any }> => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await SmartOTPService.verifyOTP(
          sessionId,
          otpCode,
          actionType,
        );

        if (result.verified || result.success) {
          setCurrentSession(null);
          return {
            valid: true,
            message: result.message,
            actionData: result.actionData,
          };
        }

        return {
          valid: false,
          message: result.message || "Verification failed",
        };
      } catch (err: any) {
        console.error("[useSmartOTP] Verify error:", err);
        const message = err.response?.data?.message || err.message;
        setError(message);
        return { valid: false, message };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ==================== Verify Transaction (Combined flow) ====================

  /**
   * Complete verification flow for a transaction
   */
  const verifyTransaction = useCallback(
    async (
      otpCode: string,
      actionType: OtpActionType,
      actionData: Record<string, any> = {},
    ): Promise<{ valid: boolean; message: string; actionData?: any }> => {
      try {
        // 1. Request session if not exists
        let session = currentSession;
        if (!session || session.actionType !== actionType) {
          session = await requestOTPSession(actionType, actionData);
          if (!session) {
            return {
              valid: false,
              message: error || "Failed to create OTP session",
            };
          }
        }

        // 2. Verify OTP
        const result = await verifyOTP(session.sessionId, otpCode, actionType);
        return result;
      } catch (err: any) {
        console.error("[useSmartOTP] Verify transaction error:", err);
        return {
          valid: false,
          message: err.message,
        };
      }
    },
    [currentSession, requestOTPSession, verifyOTP, error],
  );

  // ==================== Get Smart OTP Status ====================

  const getStatus = useCallback(async () => {
    try {
      return await SmartOTPService.getSmartOTPStatus();
    } catch (err: any) {
      console.error("[useSmartOTP] Get status error:", err);
      return null;
    }
  }, []);

  // ==================== Clear Error ====================

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ==================== Return ====================

  return {
    // OTP State
    otp, // Current 6-digit OTP
    timeRemaining, // Seconds until OTP changes (0-29)

    // Registration State
    isRegistered, // Is current device registered?
    devices, // List of registered devices

    // Session State
    currentSession, // Current OTP session for transaction

    // Loading & Error
    isLoading,
    error,
    clearError,

    // Device Operations
    registerDevice, // Register current device
    revokeDevice, // Revoke a device
    fetchDevices, // Fetch device list

    // OTP Operations
    requestOTPSession, // Create OTP session for action
    verifyOTP, // Verify OTP for session
    verifyTransaction, // Combined verify flow

    // Status
    getStatus, // Get Smart OTP status from server
  };
};
