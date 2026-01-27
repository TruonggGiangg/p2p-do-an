/**
 * Two Factor Authentication Service
 * Xử lý 2FA TOTP (Google Authenticator style) phía client
 */

import api from '../core/api/api.client';
import type { TwoFactorSecret, TwoFactorStatus } from '../types/otp.types';

/**
 * Get 2FA secret và QR code
 */
const getSecret = async (): Promise<TwoFactorSecret> => {
  if (!api || typeof api.get !== 'function') {
    throw new Error('API instance is not properly initialized');
  }
  const response = await api.get<{ success: boolean; data: TwoFactorSecret }>(
    '/api/2fa/secret',
  );
  return response.data.data;
};

/**
 * Enable 2FA với secret và token
 */
const enable2FA = async (secret: string, token: string): Promise<boolean> => {
  const response = await api.post<{ success: boolean; message: string }>(
    '/api/2fa/enable',
    { secret, token },
  );
  return response.data.success;
};

/**
 * Verify 2FA token
 */
const verifyToken = async (token: string): Promise<boolean> => {
  const response = await api.post<{ 
    success: boolean; 
    statusCode: number;
    message: string;
    data: {
      success: boolean;
      message: string;
    };
    timestamp: string;
  }>(
    '/api/2fa/verify',
    { token },
  );
  // TransformInterceptor wraps response, so we need response.data.data.success
  const isValid = response.data?.data?.success || false;
  console.log('[TwoFactorService] verifyToken - response:', JSON.stringify(response.data, null, 2));
  console.log('[TwoFactorService] verifyToken - isValid:', isValid);
  return isValid;
};

/**
 * Disable 2FA
 */
const disable2FA = async (): Promise<boolean> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    '/api/2fa/disable',
  );
  return response.data.success;
};

/**
 * Get 2FA status
 */
const getStatus = async (): Promise<TwoFactorStatus> => {
  try {
    if (!api || typeof api.get !== 'function') {
      console.warn('[TwoFactorService] API instance not available, returning default status');
      return { enabled: false };
    }
    const response = await api.get<{ 
      success: boolean; 
      statusCode: number;
      message: string;
      data: {
        success: boolean;
        enabled: boolean;
      };
      timestamp: string;
    }>(
      '/api/2fa/status',
    );
    // Server wraps response in a data field, so we need response.data.data.enabled
    const enabled = response.data?.data?.enabled || false;
    console.log('[TwoFactorService] getStatus - enabled:', enabled);
    return { enabled };
  } catch (error: any) {
    console.error('[TwoFactorService] getStatus error:', error);
    console.error('[TwoFactorService] getStatus error response:', error.response?.data);
    // Return default status if API fails
    return { enabled: false };
  }
};

const TwoFactorService = {
  getSecret,
  enable2FA,
  verifyToken,
  disable2FA,
  getStatus,
};

export default TwoFactorService;
