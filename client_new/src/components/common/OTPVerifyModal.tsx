/**
 * OTP Verify Modal
 * Modal xác thực Smart OTP khi thực hiện giao dịch
 *
 * Features:
 * - Tự động điền Smart OTP
 * - Countdown timer visual
 * - Theme-aware UI
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Animated,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfirmModal } from './ConfirmModal';
import { useSmartOTP } from '../../shared/hooks';
import type { OtpActionType } from '../../types/otp.types';

const ACTION_TITLES: Record<string, string> = {
  LOAN_CREATE: 'Tạo khoản vay',
  INVESTMENT: 'Đầu tư',
  TRANSFER: 'Chuyển tiền',
  WITHDRAWAL: 'Rút tiền',
  PASSWORD_CHANGE: 'Đổi mật khẩu',
  REPAYMENT: 'Trả nợ',
  PREPAY: 'Tất toán',
  PIN_SETUP: 'Thiết lập mã PIN',
  PIN_CHANGE: 'Đổi mã PIN',
};

export interface OTPVerifyModalProps {
  visible: boolean;
  actionType: OtpActionType;
  actionData?: Record<string, any>;
  title?: string;
  description?: string;
  onSuccess: (data: { sessionId: string; actionData?: any }) => void;
  onCancel: () => void;
}

export const OTPVerifyModal: React.FC<OTPVerifyModalProps> = ({
  visible,
  actionType,
  actionData = {},
  title = 'Xác thực OTP',
  description = 'Nhập mã Smart OTP để xác nhận giao dịch',
  onSuccess,
  onCancel,
}) => {
  const { theme } = useTheme();
  const modal = useConfirmModal();
  const {
    otp: generatedOTP,
    timeRemaining,
    isRegistered,
    isLoading,
    error,
    requestOTPSession,
    verifyOTP,
    clearError,
  } = useSmartOTP();

  const [otpInput, setOtpInput] = useState<string[]>(['', '', '', '', '', '']);
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [localError, setLocalError] = useState('');

  const progressAnim = useRef(new Animated.Value(1)).current;
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const prevOTPRef = useRef<string | null>(null);
  const verifyLockRef = useRef(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setOtpInput(['', '', '', '', '', '']);
      setSession(null);
      setLocalError('');
      setAttempts(0);
      verifyLockRef.current = false;
      verifiedRef.current = false;
      prevOTPRef.current = null;
      initSession();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && timeRemaining !== undefined) {
      Animated.timing(progressAnim, {
        toValue: timeRemaining / 30,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }
  }, [timeRemaining, visible]);

  useEffect(() => {
    const isEmpty = !otpInput.some((d) => d !== '');
    const hasRotated = prevOTPRef.current !== generatedOTP;

    if (visible && isRegistered && generatedOTP) {
      if (isEmpty || hasRotated) {
        setOtpInput(generatedOTP.split(''));
        prevOTPRef.current = generatedOTP;
      }
    }
  }, [visible, isRegistered, generatedOTP, otpInput]);

  const initSession = async () => {
    if (!isRegistered) {
      setLocalError('Vui lòng kích hoạt Smart OTP trước');
      return;
    }
    setSessionLoading(true);
    try {
      const newSession = await requestOTPSession(actionType, actionData);
      if (newSession) {
        setSession({ sessionId: newSession.sessionId });
      } else if (error) {
        setLocalError(error);
      }
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otpInput];
    newOtp[index] = value;
    setOtpInput(newOtp);
    setLocalError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otpInput[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    if (verifyLockRef.current || verifying || verifiedRef.current) {
      return;
    }

    if (!session) {
      setLocalError('Session không tồn tại. Đang thử lại...');
      await initSession();
      return;
    }

    if (sessionLoading) {
      setLocalError('Đang khởi tạo phiên xác thực, vui lòng thử lại sau vài giây.');
      return;
    }

    Keyboard.dismiss();
    verifyLockRef.current = true;
    setVerifying(true);
    setLocalError('');

    try {
      const result = await verifyOTP(session.sessionId, code, actionType);

      if (result.valid) {
        verifiedRef.current = true;
        setSession(null);
        onSuccess({
          sessionId: session.sessionId,
          actionData: result.actionData,
        });
      } else {
        setAttempts((p) => p + 1);
        setLocalError(result.message);
        setOtpInput(['', '', '', '', '', '']);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);

        if (result.message.includes('khóa')) {
          modal.error('Tài khoản bị khóa', result.message, () => onCancel());
        }
      }
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setVerifying(false);
      if (!verifiedRef.current) {
        verifyLockRef.current = false;
      }
    }
  };

  const handleCancel = () => {
    clearError();
    onCancel();
  };

  const actionTitle = ACTION_TITLES[actionType] || actionType;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => Keyboard.dismiss()}
            style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
          >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <MaterialCommunityIcons name="shield-check" size={28} color="#fff" />
              </View>
              <View style={styles.headerTextContainer}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.description}>{description}</Text>
              </View>
              <View style={[styles.timerCircle, { backgroundColor: '#fff' }]}>
                <Text
                  style={[
                    styles.timerText,
                    { color: theme.colors.primary },
                    timeRemaining <= 5 && styles.timerWarning,
                  ]}
                >
                  {timeRemaining}
                </Text>
              </View>
            </View>

            <View style={[styles.body, { backgroundColor: theme.colors.surface }]}>
              {generatedOTP ? (
                <View style={[styles.autoFillBadge, { backgroundColor: theme.colors.primary + '15' }]}>
                  <MaterialCommunityIcons name="flash" size={12} color={theme.colors.primary} />
                  <Text style={[styles.autoFillText, { color: theme.colors.primary }]}>
                    Đã tự động điền mã OTP
                  </Text>
                </View>
              ) : isRegistered ? (
                <View style={[styles.autoFillBadge, { backgroundColor: theme.colors.warning + '15' }]}>
                  <ActivityIndicator size="small" color={theme.colors.warning} style={{ marginRight: 6 }} />
                  <Text style={[styles.autoFillText, { color: theme.colors.warning }]}>
                    Đang tạo mã OTP...
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.actionLabel, { color: theme.colors.textMuted }]}>
                Xác nhận {actionTitle}
              </Text>

              {sessionLoading ? (
                <View style={[styles.autoFillBadge, { backgroundColor: theme.colors.warning + '15' }]}>
                  <ActivityIndicator size="small" color={theme.colors.warning} style={{ marginRight: 6 }} />
                  <Text style={[styles.autoFillText, { color: theme.colors.warning }]}>
                    Đang tạo phiên xác thực...
                  </Text>
                </View>
              ) : null}

              <View style={styles.otpContainer}>
                {otpInput.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(r) => { inputRefs.current[index] = r; }}
                    style={[
                      styles.otpInput,
                      { borderColor: theme.colors.border, color: theme.colors.textPrimary },
                      digit && { borderColor: theme.colors.primary },
                      localError && { borderColor: theme.colors.error },
                    ]}
                    value={digit}
                    onChangeText={(v) => handleInputChange(index, v)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={1}
                    autoFocus={index === 0}
                    editable={!verifying}
                    selectTextOnFocus
                  />
                ))}
              </View>

              <View style={styles.timerContainer}>
                <View style={[styles.timerLineBg, { backgroundColor: theme.colors.border }]}>
                  <Animated.View
                    style={[
                      styles.timerLineFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.timerLabel, { color: theme.colors.textMuted }]}>
                  Mã đổi sau {timeRemaining}s
                </Text>
              </View>

              {localError ? (
                <View style={[styles.errorContainer, { backgroundColor: theme.colors.error + '15' }]}>
                  <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.error} />
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>{localError}</Text>
                </View>
              ) : null}

              {attempts > 0 && (
                <Text style={[styles.attemptsText, { color: theme.colors.warning }]}>
                  Còn {3 - attempts} lần thử
                </Text>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.cancelButton, { backgroundColor: theme.colors.border }]}
                  onPress={handleCancel}
                  disabled={verifying}
                >
                  <Text style={[styles.cancelButtonText, { color: theme.colors.textPrimary }]}>
                    Hủy
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    { backgroundColor: theme.colors.primary },
                    (!otpInput.every((d) => d) || verifying || sessionLoading || !session) && styles.verifyButtonDisabled,
                  ]}
                  onPress={() => handleVerify(otpInput.join(''))}
                  disabled={!otpInput.every((d) => d) || verifying || sessionLoading || !session}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.verifyButtonText}>Xác nhận</Text>
                  )}
                </TouchableOpacity>
              </View>

              {!isRegistered && (
                <View style={styles.warningBox}>
                  <Text style={[styles.warningText, { color: theme.colors.error, marginBottom: 12 }]}>
                    Bạn chưa kích hoạt Smart OTP trên thiết bị này
                  </Text>
                  <TouchableOpacity
                    style={[styles.registerNowBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => requestOTPSession(actionType, actionData)} // or just re-init
                    disabled={isLoading}
                  >
                    <Text style={styles.registerNowText}>Kích hoạt ngay</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  description: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
    marginTop: 4,
  },
  timerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  timerWarning: {
    color: '#EF4444',
  },
  body: {
    padding: 20,
  },
  autoFillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 16,
    gap: 6,
  },
  autoFillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionLabel: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  otpInput: {
    width: 48,
    height: 52,
    borderWidth: 1.5,
    borderRadius: 8,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 0,
  },
  timerContainer: {
    marginBottom: 20,
  },
  timerLineBg: {
    height: 6,
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden',
  },
  timerLineFill: {
    height: '100%',
    borderRadius: 3,
  },
  timerLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
  },
  attemptsText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  verifyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  warningBox: {
    marginTop: 16,
    alignItems: 'center',
  },
  warningText: {
    fontSize: 12,
    textAlign: 'center',
  },
  registerNowBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  registerNowText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
});
