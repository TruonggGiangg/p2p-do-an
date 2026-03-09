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

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  // ========= v2: Sign with password + OTP ==========
  const handleSignV2 = useCallback(async () => {
    if (!password.trim()) {
      setError('Vui long nhap mat khau SmartCA');
      return;
    }
    if (!otp.trim()) {
      setError('Vui long nhap ma OTP');
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
        setError(result.error || 'Ky so khong thanh cong');
        setPhase('error');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Ky so that bai. Vui long kiem tra mat khau va OTP.';
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
      setCountdown(Math.max(0, Math.floor(expiresMs / 1000)));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Khong the khoi tao phien ky so';
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
              ? 'Ban da tu choi ky hop dong'
              : 'Phien ky da het han hoac that bai',
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
          setError('Phien ky da het thoi gian');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, countdown]);

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
        <View style={[styles.modal, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Ky so VNPT SmartCA
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
                  Mat khau + OTP
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'v1' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => handleTabSwitch('v1')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'v1' ? colors.primary : colors.textDim }]}>
                  Xac nhan tren App
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
                  Nhap thong tin ky so
                </Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Nhap mat khau ung dung VNPT SmartCA va ma OTP (TOTP) gan voi chung thu so.
                </Text>

                {/* Password Input */}
                <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Mat khau SmartCA</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.textInput, { color: colors.textPrimary, flex: 1 }]}
                      placeholder="Nhap mat khau..."
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
                    placeholder="Nhap 6 so OTP..."
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
                  <Text style={styles.signButtonText}>Ky hop dong</Text>
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
                  Xac nhan tren App SmartCA
                </Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  He thong se gui yeu cau ky den ung dung VNPT SmartCA tren dien thoai cua ban. Ban can mo app de xac nhan.
                </Text>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.signButton, { backgroundColor: colors.primary }]}
                  onPress={initiateV1Signing}
                >
                  <Ionicons name="send" size={18} color="white" />
                  <Text style={styles.signButtonText}>Gui yeu cau ky</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ======== Signing in progress (v2) ======== */}
            {phase === 'signing' && (
              <View style={styles.phaseContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
                  Dang ky so... Vui long doi.
                </Text>
              </View>
            )}

            {/* ======== Preparing (v1) ======== */}
            {phase === 'preparing' && (
              <View style={styles.phaseContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
                  Dang khoi tao phien ky so...
                </Text>
              </View>
            )}

            {/* ======== Waiting for user (v1) ======== */}
            {phase === 'waiting_user' && (
              <View style={styles.phaseContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialCommunityIcons name="draw-pen" size={48} color={colors.primary} />
                </View>
                <Text style={[styles.phaseTitle, { color: colors.textPrimary }]}>
                  Cho xac nhan ky
                </Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Vui long mo ung dung VNPT SmartCA va xac nhan ky bang PIN hoac van tay.
                </Text>

                <View style={[styles.countdownBox, { backgroundColor: colors.background }]}>
                  <Ionicons name="time-outline" size={16} color={colors.textDim} />
                  <Text style={[styles.countdownText, { color: colors.textDim }]}>
                    Thoi gian con lai: {formatCountdown(countdown)}
                  </Text>
                </View>

                {session && (
                  <Text style={[styles.txInfo, { color: colors.textDim }]}>
                    Ma giao dich: {session.transactionId}
                  </Text>
                )}
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
                <Text style={[styles.phaseTitle, { color: '#10B981' }]}>Ky so thanh cong!</Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                  Hop dong da duoc ky so bang chung thu VNPT SmartCA.
                </Text>
              </View>
            )}

            {/* ======== Error ======== */}
            {phase === 'error' && (
              <View style={styles.phaseContainer}>
                <View style={[styles.iconCircle, { backgroundColor: '#EF444415' }]}>
                  <MaterialCommunityIcons name="alert-circle" size={48} color="#EF4444" />
                </View>
                <Text style={[styles.phaseTitle, { color: '#EF4444' }]}>Khong the ky</Text>
                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>{error}</Text>

                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: colors.primary }]}
                  onPress={handleRetry}
                >
                  <Ionicons name="refresh" size={18} color="white" />
                  <Text style={styles.retryButtonText}>Thu lai</Text>
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
});
