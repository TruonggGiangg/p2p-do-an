/**
 * useTwoFactor Hook
 * React Hook quản lý 2FA state và operations
 */

import { useState, useEffect, useCallback } from 'react';
import TwoFactorService from '../../services/two-factor.service';
import type { TwoFactorSecret, TwoFactorStatus } from '../../types/otp.types';

export const useTwoFactor = () => {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<TwoFactorSecret | null>(null);

  // ==================== Initialize ====================

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const status = await TwoFactorService.getStatus();
        setIsEnabled(status?.enabled || false);
      } catch (err: any) {
        console.error('[useTwoFactor] Init error:', err);
        // Don't set error for init failure - just default to disabled
        setError(null);
        setIsEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // ==================== Get Secret ====================

  const getSecret = useCallback(async (): Promise<TwoFactorSecret | null> => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await TwoFactorService.getSecret();
      setSecret(result);
      return result;
    } catch (err: any) {
      console.error('[useTwoFactor] Get secret error:', err);
      setError(err.response?.data?.errMsg || err.response?.data?.message || err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==================== Enable 2FA ====================

  const enable2FA = useCallback(
    async (secret: string, token: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);
        const success = await TwoFactorService.enable2FA(secret, token);
        if (success) {
          setSecret(null); // Clear secret after enabling
          // Fetch fresh status from server to ensure sync
          const status = await TwoFactorService.getStatus();
          const newEnabled = status?.enabled || false;
          console.log('[useTwoFactor] Enable success, fetched status:', status, 'newEnabled:', newEnabled);
          setIsEnabled(newEnabled);
        }
        return success;
      } catch (err: any) {
        console.error('[useTwoFactor] Enable error:', err);
        setError(err.response?.data?.errMsg || err.response?.data?.message || err.message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ==================== Disable 2FA ====================

  const disable2FA = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      const success = await TwoFactorService.disable2FA();
      if (success) {
        setIsEnabled(false);
      }
      return success;
    } catch (err: any) {
      console.error('[useTwoFactor] Disable error:', err);
      setError(err.response?.data?.errMsg || err.response?.data?.message || err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==================== Verify Token ====================

  const verifyToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      return await TwoFactorService.verifyToken(token);
    } catch (err: any) {
      console.error('[useTwoFactor] Verify error:', err);
      setError(err.response?.data?.errMsg || err.response?.data?.message || err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==================== Refresh Status ====================

  const refreshStatus = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      const status = await TwoFactorService.getStatus();
      const enabled = status?.enabled || false;
      console.log('[useTwoFactor] Refresh status:', status, 'enabled:', enabled);
      setIsEnabled(enabled);
      return enabled;
    } catch (err: any) {
      console.error('[useTwoFactor] Refresh status error:', err);
      setIsEnabled(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==================== Clear Error ====================

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ==================== Return ====================

  return {
    isEnabled,
    isLoading,
    error,
    secret,
    getSecret,
    enable2FA,
    disable2FA,
    verifyToken,
    refreshStatus,
    clearError,
  };
};
