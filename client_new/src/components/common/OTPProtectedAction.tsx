/**
 * OTPProtectedAction
 * Wrapper cho action cần xác thực Smart OTP
 *
 * Usage:
 * <OTPProtectedAction
 *   actionType="LOAN_CREATE"
 *   actionData={{ capital: 1000000 }}
 *   onExecute={(data) => handleSubmit(data)}
 *   title="Xác thực giao dịch"
 * >
 *   {({ trigger, isLoading }) => (
 *     <CommonButton onPress={trigger} loading={isLoading}>Xác nhận</CommonButton>
 *   )}
 * </OTPProtectedAction>
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { OTPVerifyModal } from './OTPVerifyModal';
import { useConfirmModal } from './ConfirmModal';
import SmartOTPService from '../../services/smart-otp.service';
import type { OtpActionType } from '../../types/otp.types';

export interface OTPProtectedActionProps {
  actionType: OtpActionType;
  actionData?: Record<string, any>;
  onExecute: (data: Record<string, any> & { otpSessionId?: string }) => Promise<void>;
  title?: string;
  description?: string;
  skipOTP?: boolean;
  /** Khi true: bắt buộc OTP, không cho phép nếu chưa đăng ký Smart OTP */
  requireOTP?: boolean;
  showConfirmIfNoOTP?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  children: (props: {
    trigger: () => void;
    isLoading: boolean;
    isOTPEnabled: boolean;
    isInitialized: boolean;
  }) => React.ReactNode;
}

export const OTPProtectedAction: React.FC<OTPProtectedActionProps> = ({
  actionType,
  actionData = {},
  onExecute,
  title = 'Xác thực OTP',
  description = 'Nhập mã Smart OTP để xác nhận giao dịch',
  skipOTP = false,
  requireOTP = false,
  showConfirmIfNoOTP = false,
  confirmTitle = 'Xác nhận',
  confirmMessage = 'Bạn có chắc chắn muốn tiếp tục?',
  children,
}) => {
  const navigation = useNavigation();
  const modal = useConfirmModal();
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [isOTPEnabled, setIsOTPEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setIsLoading(false);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const init = async () => {
      try {
        const registered = await SmartOTPService.isDeviceRegistered();
        setIsOTPEnabled(registered);
      } catch {
        setIsOTPEnabled(false);
      } finally {
        setIsInitialized(true);
      }
    };
    init();
  }, []);

  const trigger = useCallback(() => {
    if (!isInitialized) return;

    if (!skipOTP && isOTPEnabled) {
      Keyboard.dismiss();
      setShowOTPModal(true);
    } else if (requireOTP && !isOTPEnabled) {
      modal.show({
        title: 'Cần đăng ký Smart OTP',
        message: 'Bạn cần đăng ký Smart OTP trong mục Profile trước khi thực hiện thao tác này.',
        variant: 'warning',
        confirmText: 'Cài đặt ngay',
        onConfirm: () => (navigation as any).navigate('Main', { 
          screen: 'Profile', 
          params: { expandSmartOTP: true } 
        })
      });
    } else if (showConfirmIfNoOTP) {
      modal.confirm({
        title: confirmTitle,
        message: confirmMessage,
        cancelText: 'Hủy',
        confirmText: 'Xác nhận',
        onConfirm: () => executeAction(null),
      });
    } else {
      executeAction(null);
    }
  }, [isInitialized, isOTPEnabled, skipOTP, requireOTP, showConfirmIfNoOTP, confirmTitle, confirmMessage]);

  const executeAction = useCallback(
    async (otpData: { sessionId: string } | null) => {
      setIsLoading(true);
      try {
        const payload = {
          ...actionData,
          ...(otpData ? { otpSessionId: otpData.sessionId, _otpVerified: true } : {}),
        };
        await onExecute(payload);
      } catch (error: any) {
        modal.error('Lỗi', error?.message || 'Không thể thực hiện thao tác');
      } finally {
        setIsLoading(false);
      }
    },
    [actionData, onExecute],
  );

  const handleOTPSuccess = useCallback(
    (otpData: { sessionId: string; actionData?: any }) => {
      setShowOTPModal(false);
      setTimeout(() => {
        executeAction({ sessionId: otpData.sessionId });
      }, 300);
    },
    [executeAction],
  );

  const handleOTPCancel = useCallback(() => {
    setShowOTPModal(false);
  }, []);

  return (
    <>
      {children({ trigger, isLoading, isOTPEnabled, isInitialized })}

      <OTPVerifyModal
        visible={showOTPModal}
        actionType={actionType}
        actionData={actionData}
        title={title}
        description={description}
        onSuccess={handleOTPSuccess}
        onCancel={handleOTPCancel}
      />
    </>
  );
};
