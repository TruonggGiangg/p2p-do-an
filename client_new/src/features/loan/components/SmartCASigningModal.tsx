/**
 * SmartCASigningModal.tsx
 *
 * Modal cho phien ky so VNPT SmartCA.
 *
 * Ho tro 2 luong:
 *  Tab 1 (v2 - Uu tien): User nhap mat khau SmartCA + OTP TOTP -> ky truc tiep
 *  Tab 2 (v1): Gui yeu cau ky -> User xac nhan tren app VNPT SmartCA -> Poll trang thai
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  loanService,
  SmartCaSigningSession,
} from '../services/loan.service';

const { width } = Dimensions.get('window');

interface SmartCASigningModalProps {
  visible: boolean;
  contractId: string;
  onClose: () => void;
  onSigningComplete: (status: 'signed' | 'failed' | 'rejected') => void;
}

type SigningPhase =
  | 'input'         // v2: User dang nhap password + OTP
  | 'signing'       // v2: Dang ky ...
  | 'preparing'     // v1: Dang khoi tao phien ky
  | 'waiting_user'  // v1: Cho user xac nhan tren app SmartCA
  | 'success'       // Ky thanh cong
  | 'error';        // Loi

type FlowTab = 'v2' | 'v1';

export default function SmartCASigningModal({
  visible,
  contractId,
  onClose,
  onSigningComplete,
}: SmartCASigningModalProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [activeTab, setActiveTab] = useState<FlowTab>('v2');
  const [phase, setPhase] = useState<SigningPhase>('input');
  const [error, setError] = useState('');

  // v2 inputs
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // v1 state
  const [session, setSession] = useState<SmartCaSigningSession | null>(null);
  const [countdown, setCountdown] = useState(0);

  const insets = useSafeAreaInsets();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const maxCountdownRef = useRef<number>(300);

  // ========= v2: Sign with password + OTP ==========
  const handleSignV2 = useCallback(async () => {
    if (!password.trim()) {
      setError('Vui lòng nhập mật khẩu SmartCA');
      return;
    }
    if (!otp.trim()) {
      setError('Vui lòng nhập mã OTP');
      return;
    }

    setPhase('signing');
    setError('');

    try {
      const result = await loanService.signWithPasswordOTP(contractId, password, otp);

      if (result.status === 'signed') {
        setPhase('success');
        Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
        setTimeout(() => onSigningComplete('signed'), 1500);
      } else {
        setError(result.error || 'Ký số không thành công');
        setPhase('error');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Ký số thất bại. Vui lòng kiểm tra mật khẩu và OTP.';
      setError(msg);
      setPhase('error');
    }
  }, [contractId, password, otp]);

  // ========= v1: Initiate signing session ==========
  const initiateV1Signing = useCallback(async () => {
    setPhase('preparing');
    setError('');

    try {
      const signingSession = await loanService.initiateSmartCaSigning(contractId);
      setSession(signingSession);
      setPhase('waiting_user');

      const expiresMs = new Date(signingSession.expiresAt).getTime() - Date.now();
      const initialCountdown = Math.max(1, Math.floor(expiresMs / 1000));
      maxCountdownRef.current = initialCountdown;
      setCountdown(initialCountdown);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể khởi tạo phiên ký số. Vui lòng thử lại.';
      setError(msg);
      setPhase('error');
    }
  }, [contractId]);

  // ========= v1: Poll Status ==========
  useEffect(() => {
    if (phase !== 'waiting_user' || !session) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await loanService.checkSigningStatus(session.signatureId);
        if (result.status === 'signed') {
          clearInterval(pollIntervalRef.current!);
          setPhase('success');
          Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
          setTimeout(() => onSigningComplete('signed'), 1500);
        } else if (['failed', 'rejected', 'expired', 'cancelled'].includes(result.status)) {
          clearInterval(pollIntervalRef.current!);
          setError(
            result.status === 'rejected'
              ? 'Bạn đã từ chối ký số'
              : 'Phiên ký đã kết thúc với trạng thái: ' + result.status,
          );
          setPhase('error');
          onSigningComplete(result.status === 'rejected' ? 'rejected' : 'failed');
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [phase, session]);

  // ========= v1: Countdown ==========
  useEffect(() => {
    if (phase !== 'waiting_user' || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('error');
          setError('Phiên ký đã hết thời gian');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, countdown]);

  // ========= v1: Pulse animation while waiting ==========
  useEffect(() => {
    if (phase !== 'waiting_user') {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 950, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 950, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [phase]);

  // ========= Reset on visibility change ==========
  useEffect(() => {
    if (visible) {
      setPhase('input');
      setError('');
      setPassword('');
      setOtp('');
      setSession(null);
      successAnim.setValue(0);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
  }, [visible]);

  // ========= Tab switch handler ==========
  const handleTabSwitch = (tab: FlowTab) => {
    if (phase === 'signing' || phase === 'success') return;
    setActiveTab(tab);
    setPhase('input');
    setError('');
  };

  // ========= Retry ==========
  const handleRetry = () => {
    setError('');
    if (activeTab === 'v2') {
      setPhase('input');
    } else {
      initiateV1Signing();
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ========= RENDER ==========
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 8) }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Ký số VNPT SmartCA
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          {/* Tab Switcher */}
          {(phase === 'input' || phase === 'error') && (
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'v2' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => handleTabSwitch('v2')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'v2' ? colors.primary : colors.textDim }]}>
                  Mật khẩu + OTP
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'v1' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => handleTabSwitch('v1')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'v1' ? colors.primary : colors.textDim }]}>
                  Xác nhận trên App
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* ======== v2: Password + OTP Input ======== */}
            {activeTab === 'v2' && phase === 'input' && (
              <View style={styles.phaseContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialCommunityIcons name="key-variant" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.phaseTitle, { color: colors.textPrimary }]}>
                  Nhập mật khẩu TOTP
                </Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Nhập mật khẩu ứng dụng VNPT SmartCA và mã OTP (TOTP) gắn với chứng thư số.
                </Text>

                {/* Password Input */}
                <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Mật khẩu SmartCA</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.textInput, { color: colors.textPrimary, flex: 1 }]}
                      placeholder="Nhập mật khẩu..."
                      placeholderTextColor={colors.textDim}
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textDim} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* OTP Input */}
                <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Ma OTP (TOTP)</Text>
                  <TextInput
                    style={[styles.textInput, { color: colors.textPrimary }]}
                    placeholder="Nhập 6 số OTP..."
                    placeholderTextColor={colors.textDim}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                  />
                </View>

                {error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  style={[styles.signButton, { backgroundColor: colors.primary }]}
                  onPress={handleSignV2}
                  disabled={!password.trim() || !otp.trim()}
                >
                  <MaterialCommunityIcons name="draw-pen" size={20} color="white" />
                  <Text style={styles.signButtonText}>Ký hợp đồng</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ======== v1: Initiate button ======== */}
            {activeTab === 'v1' && phase === 'input' && (
              <View style={styles.phaseContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialCommunityIcons name="cellphone-check" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.phaseTitle, { color: colors.textPrimary }]}>
                  Xác nhận trên App SmartCA
                </Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Hệ thống sẽ gửi yêu cầu ký đến ứng dụng VNPT SmartCA trên điện thoại của bạn. Bạn cần mở app để xác nhận.
                </Text>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.signButton, { backgroundColor: colors.primary }]}
                  onPress={initiateV1Signing}
                >
                  <Ionicons name="send" size={18} color="white" />
                  <Text style={styles.signButtonText}>Gửi yêu cầu ký</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ======== Signing in progress (v2) ======== */}
            {phase === 'signing' && (
              <View style={styles.phaseContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
                  Đang ký số... Vui lòng đợi.
                </Text>
              </View>
            )}

            {/* ======== Preparing (v1) ======== */}
            {phase === 'preparing' && (
              <View style={styles.phaseContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
                  Đang khởi tạo phiên ký số...
                </Text>
              </View>
            )}

            {/* ======== Waiting for user (v1) ======== */}
            {phase === 'waiting_user' && (
              <View style={styles.phaseContainer}>
                {/* Pulsing icon */}
                <View style={styles.pulseWrapper}>
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      { borderColor: colors.primary + '35', transform: [{ scale: pulseAnim }] },
                    ]}
                  />
                  <View style={[styles.iconCircleWaiting, { backgroundColor: colors.primary + '18' }]}>
                    <MaterialCommunityIcons name="cellphone-check" size={38} color={colors.primary} />
                  </View>
                </View>

                <Text style={[styles.phaseTitle, { color: colors.textPrimary }]}>
                  Đang chờ xác nhận...
                </Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Mở ứng dụng VNPT SmartCA trên điện thoại và xác nhận ký bằng PIN hoặc vân tay.
                </Text>

                {/* Spinner + countdown */}
                <View style={[styles.waitingRow, { backgroundColor: colors.background }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.waitingCountdown, { color: colors.textPrimary }]}>
                    {formatCountdown(countdown)}
                  </Text>
                </View>

                {/* Progress bar */}
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${Math.max(2, (countdown / maxCountdownRef.current) * 100)}%`,
                      },
                    ]}
                  />
                </View>

                <TouchableOpacity onPress={onClose} style={styles.cancelLink}>
                  <Text style={[styles.cancelLinkText, { color: colors.textDim }]}>Hủy yêu cầu</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ======== Success ======== */}
            {phase === 'success' && (
              <View style={styles.phaseContainer}>
                <Animated.View
                  style={[
                    styles.successCircle,
                    { backgroundColor: '#10B981', transform: [{ scale: successAnim }] },
                  ]}
                >
                  <Ionicons name="checkmark" size={48} color="white" />
                </Animated.View>
                <Text style={[styles.phaseTitle, { color: '#10B981' }]}>Ký số thành công!</Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Hợp đồng đã được ký số bằng chứng thư VNPT SmartCA.
                </Text>
              </View>
            )}

            {/* ======== Error ======== */}
            {phase === 'error' && (
              <View style={styles.phaseContainer}>
                <View style={[styles.iconCircle, { backgroundColor: '#EF444415' }]}>
                  <MaterialCommunityIcons name="alert-circle" size={48} color="#EF4444" />
                </View>
                <Text style={[styles.phaseTitle, { color: '#EF4444' }]}>Không thể ký</Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>{error}</Text>

                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: colors.primary }]}
                  onPress={handleRetry}
                >
                  <Ionicons name="refresh" size={18} color="white" />
                  <Text style={styles.retryButtonText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 480,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  phaseContainer: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    width: '100%',
  },
  phaseText: {
    fontSize: 15,
    marginTop: 12,
  },
  phaseTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  phaseDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputGroup: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    fontSize: 16,
    paddingVertical: 4,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  signButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  countdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600',
  },
  txInfo: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  // Waiting phase
  pulseWrapper: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
  },
  iconCircleWaiting: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 4,
  },
  waitingCountdown: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  cancelLink: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelLinkText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
