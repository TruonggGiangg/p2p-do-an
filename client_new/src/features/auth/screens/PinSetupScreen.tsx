/**
 * PIN Setup Screen
 * Thiết lập mã PIN 6 chữ số cho người dùng lần đầu đăng nhập
 *
 * Flow:
 *  Step 1 → Nhập PIN (6 chữ số)
 *  Step 2 → Nhập lại PIN xác nhận
 *  Step 3 → Xác thực Smart OTP → Gọi API lưu PIN
 *  Done   → Thông báo thành công + điều hướng
 */
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Platform,
    StatusBar,
    Vibration,
    ActivityIndicator,
    TextInput,
    Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { OTPVerifyModal, useConfirmModal } from '../../../components';
import { pinAPI } from '../api/pin.api';
import TwoFactorService from '../../../services/two-factor.service';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSmartOTP } from '../../../shared/hooks';
import { OtpActionType } from '../../../types/otp.types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

type PinSetupNav = NativeStackNavigationProp<RootStackParamList, 'PinSetup'>;

// ── Numpad Layout ──────────────────────────────────────────────────────────────
const NUMPAD_KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
];

const PIN_LENGTH = 6;

type Step = 'enter' | 'confirm' | 'otp' | 'success';

// ── PIN Dot component ──────────────────────────────────────────────────────────
function PinDot({ filled, shake, theme }: { filled: boolean; shake: Animated.Value; theme: any }) {
    return (
        <Animated.View
            style={[
                styles.dot,
                {
                    borderColor: filled ? theme.colors.primary : theme.colors.border,
                    backgroundColor: filled ? theme.colors.primary : 'transparent',
                    transform: [{ translateX: shake }],
                },
            ]}
        />
    );
}

export default function PinSetupScreen() {
    const navigation = useNavigation<PinSetupNav>();
    const { theme } = useTheme();
    const { refreshUser } = useAuth();
    const modal = useConfirmModal();
    const insets = useSafeAreaInsets();
    const c = theme.colors;

    // Cached safe area top — tránh header giựt khi insets thay đổi
    const FALLBACK_TOP = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24);
    const cachedTopInset = useRef<number>(FALLBACK_TOP);
    const [ready, setReady] = useState(false);
    useLayoutEffect(() => {
        if (insets.top > 0 && !ready) {
            cachedTopInset.current = insets.top;
            setReady(true);
        }
    }, [insets.top, ready]);
    const { isRegistered, registerDevice, isLoading: isOtpLoading } = useSmartOTP();
    const stableTop = cachedTopInset.current;

    const [step, setStep] = useState<Step>('enter');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [otpVisible, setOtpVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [show2FAModal, setShow2FAModal] = useState(false);
    const [twoFactorToken, setTwoFactorToken] = useState('');

    // Shake animation khi nhập sai
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;
    const otpSuccessHandledRef = useRef(false);

    useEffect(() => {
        const check2FA = async () => {
            try {
                const status = await TwoFactorService.getStatus();
                setIs2FAEnabled(status.enabled);
            } catch (err) {
                console.error('[PinSetupScreen] Check 2FA error:', err);
            }
        };
        check2FA();
    }, []);

    const currentPin = step === 'enter' ? pin : confirmPin;

    const triggerShake = useCallback(() => {
        Vibration.vibrate(400);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    }, [shakeAnim]);

    const handleKeyPress = useCallback(
        (key: string) => {
            if (step === 'otp' || step === 'success') return;

            if (key === '⌫') {
                if (step === 'enter') {
                    setPin((prev) => prev.slice(0, -1));
                } else {
                    setConfirmPin((prev) => prev.slice(0, -1));
                }
                return;
            }

            if (!key) return;

            if (step === 'enter') {
                if (pin.length >= PIN_LENGTH) return;
                const next = pin + key;
                setPin(next);

                if (next.length === PIN_LENGTH) {
                    // Auto advance to confirm step after brief delay
                    setTimeout(() => setStep('confirm'), 200);
                }
            } else {
                if (confirmPin.length >= PIN_LENGTH) return;
                const next = confirmPin + key;
                setConfirmPin(next);

                if (next.length === PIN_LENGTH) {
                    // Validate match
                    if (next !== pin) {
                        triggerShake();
                        setTimeout(() => {
                            setConfirmPin('');
                            modal.error(
                                'Mã PIN không khớp',
                                'Mã PIN xác nhận không đúng. Vui lòng nhập lại.',
                            );
                        }, 300);
                    } else {
                        // Open Smart OTP modal
                        setTimeout(() => setOtpVisible(true), 200);
                    }
                }
            }
        },
        [step, pin, confirmPin, triggerShake],
    );

    const handleBack = useCallback(() => {
        if (step === 'confirm') {
            setStep('enter');
            setConfirmPin('');
        }
    }, [step]);

    const handleOtpCancel = useCallback(() => {
        setOtpVisible(false);
        setConfirmPin('');
        otpSuccessHandledRef.current = false;
    }, []);

    const handleOtpSuccess = useCallback(
        async ({ sessionId }: { sessionId: string }) => {
            if (otpSuccessHandledRef.current) {
                return;
            }
            otpSuccessHandledRef.current = true;
            setOtpVisible(false);
            setSubmitting(true);
            try {
                await pinAPI.setupPin({ pin, sessionId });

                // Refresh user để cập nhật hasPin = true
                await refreshUser();
                setStep('success');
                // Animate success
                Animated.parallel([
                    Animated.spring(successScale, {
                        toValue: 1,
                        tension: 50,
                        friction: 7,
                        useNativeDriver: true,
                    }),
                    Animated.timing(successOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                ]).start();
            } catch (err: any) {
                const message = err?.response?.data?.message || err?.message || 'Đã có lỗi xảy ra';
                modal.error('Lỗi', message);
                setConfirmPin('');
                otpSuccessHandledRef.current = false;
            } finally {
                setSubmitting(false);
            }
        },
        [pin, refreshUser, successScale, successOpacity],
    );

    const handleSuccessDone = useCallback(() => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
        });
    }, [navigation]);

    const [biometricSupported, setBiometricSupported] = useState(false);
    useEffect(() => {
        if (step === 'success') {
            LocalAuthentication.hasHardwareAsync().then(hasHardware => {
                LocalAuthentication.isEnrolledAsync().then(hasEnrolled => {
                    setBiometricSupported(hasHardware && hasEnrolled);
                });
            });
        }
    }, [step]);

    const handleEnableBiometric = async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Xác thực để kích hoạt FaceID/Vân tay',
                disableDeviceFallback: true,
            });
            if (result.success) {
                modal.success('Thành công', 'Đã kích hoạt xác thực sinh trắc học.', handleSuccessDone);
            }
            // Trường hợp người dùng huỷ hoặc lỗi → im lặng
        } catch {
            modal.show({
                title: 'Không thể kích hoạt FaceID',
                message: 'Tính năng này cần build native (không phải Expo Go). Bạn có thể bỏ qua và vẫn dùng mã PIN bình thường.',
                variant: 'warning',
                confirmText: 'Tiếp tục',
                onConfirm: handleSuccessDone,
            });
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const titleByStep: Record<Step, string> = {
        enter: 'Tạo mã PIN',
        confirm: 'Xác nhận mã PIN',
        otp: 'Xác thực Smart OTP',
        success: 'Hoàn tất',
    };

    const subtitleByStep: Record<Step, string> = {
        enter: 'Nhập mã PIN 6 chữ số để bảo vệ tài khoản',
        confirm: 'Nhập lại mã PIN vừa tạo để xác nhận',
        otp: '',
        success: '',
    };

    if (!isRegistered && step !== 'success') {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
                <LinearGradient
                    colors={[c.primary, c.primaryDark ?? c.primary]}
                    style={[styles.header, { paddingTop: stableTop + 10 }]}
                >
                    <View style={styles.headerRow}>
                        <View style={styles.backBtn} />
                        <View style={styles.headerCenter}>
                            <MaterialCommunityIcons name="shield-alert" size={32} color="#FFFFFF" />
                        </View>
                        <View style={styles.backBtn} />
                    </View>
                    <Text style={styles.headerTitle}>Kích hoạt Smart OTP</Text>
                    <Text style={styles.headerSub}>
                        Bạn cần kích hoạt Smart OTP trên thiết bị này trước khi thiết lập mã PIN để bảo vệ tài khoản.
                    </Text>
                </LinearGradient>

                <View style={styles.activateContainer}>
                    <View style={[styles.activateIconBg, { backgroundColor: c.primary + '15' }]}>
                        <MaterialCommunityIcons name="cellphone-key" size={80} color={c.primary} />
                    </View>

                    <View style={styles.featureList}>
                        <View style={styles.featureItem}>
                            <MaterialCommunityIcons name="check-circle" size={20} color={c.success} />
                            <Text style={[styles.featureText, { color: c.textSecondary }]}>Xác thực giao dịch an toàn</Text>
                        </View>
                        <View style={styles.featureItem}>
                            <MaterialCommunityIcons name="check-circle" size={20} color={c.success} />
                            <Text style={[styles.featureText, { color: c.textSecondary }]}>Không cần chờ tin nhắn SMS</Text>
                        </View>
                        <View style={styles.featureItem}>
                            <MaterialCommunityIcons name="check-circle" size={20} color={c.success} />
                            <Text style={[styles.featureText, { color: c.textSecondary }]}>Bảo mật đa tầng bằng thiết bị</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={async () => {
                            if (is2FAEnabled) {
                                if (Platform.OS === 'ios') {
                                    Alert.prompt(
                                        'Xác thực 2FA',
                                        'Tài khoản của bạn đã bật 2FA. Vui lòng nhập mã từ Google Authenticator để kích hoạt Smart OTP.',
                                        [
                                            { text: 'Hủy', style: 'cancel' },
                                            {
                                                text: 'Xác nhận',
                                                onPress: (token?: string) => registerDevice(token),
                                            },
                                        ],
                                        'plain-text',
                                    );
                                } else {
                                    // Android fallback using a state for modal
                                    setShow2FAModal(true);
                                }
                            } else {
                                registerDevice();
                            }
                        }}
                        style={[styles.activateBtn, { backgroundColor: c.primary }]}
                        disabled={isOtpLoading}
                        activeOpacity={0.85}
                    >
                        {isOtpLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.activateBtnText}>Kích hoạt ngay</Text>
                        )}
                    </TouchableOpacity>

                    {/* Simple 2FA Modal for Android/Web */}
                    {show2FAModal && (
                        <Modal
                            visible={show2FAModal}
                            transparent={true}
                            animationType="fade"
                            onRequestClose={() => setShow2FAModal(false)}
                        >
                            <View style={styles.modalOverlay}>
                                <View style={[styles.modalContent, { backgroundColor: c.surface }]}>
                                    <View style={styles.modalHeader}>
                                        <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Xác thực 2FA</Text>
                                        <TouchableOpacity onPress={() => setShow2FAModal(false)}>
                                            <MaterialCommunityIcons name="close" size={24} color={c.textDim} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={[styles.modalSub, { color: c.textSecondary }]}>
                                        Nhập mã 2FA từ ứng dụng Authenticator để kích hoạt Smart OTP.
                                    </Text>
                                    <View style={[styles.inputContainer, { borderColor: twoFactorToken.length === 6 ? c.primary : c.border }]}>
                                        <TextInput
                                            style={[styles.textInput, { color: c.textPrimary }]}
                                            value={twoFactorToken}
                                            onChangeText={setTwoFactorToken}
                                            placeholder="000000"
                                            placeholderTextColor={c.textDim}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            autoFocus
                                        />
                                    </View>
                                    <View style={styles.modalActions}>
                                        <TouchableOpacity
                                            style={[styles.modalBtn, { backgroundColor: c.border + '20' }]}
                                            onPress={() => {
                                                setShow2FAModal(false);
                                                setTwoFactorToken('');
                                            }}
                                        >
                                            <Text style={[styles.modalBtnText, { color: c.textPrimary }]}>Hủy</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.modalBtn, { backgroundColor: c.primary }]}
                                            disabled={twoFactorToken.length !== 6 || isOtpLoading}
                                            onPress={async () => {
                                                const success = await registerDevice(twoFactorToken);
                                                if (success) {
                                                    setShow2FAModal(false);
                                                    setTwoFactorToken('');
                                                }
                                            }}
                                        >
                                            {isOtpLoading ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Xác nhận</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>
                    )}

                    <Text style={[styles.activateNote, { color: c.textDim }]}>
                        Thiết bị của bạn sẽ được định danh để xác thực các giao dịch sau này.
                    </Text>
                </View>
            </View>
        );
    }

    if (step === 'success') {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
                <Animated.View
                    style={[
                        styles.successWrapper,
                        { opacity: successOpacity, transform: [{ scale: successScale }] },
                    ]}
                >
                    <LinearGradient
                        colors={[c.success + '20', c.success + '05']}
                        style={styles.successIconBg}
                    >
                        <MaterialCommunityIcons name="shield-check" size={72} color={c.success} />
                    </LinearGradient>
                    <Text style={[styles.successTitle, { color: c.textPrimary }]}>
                        Thiết lập thành công!
                    </Text>
                    <Text style={[styles.successSub, { color: c.textSecondary }]}>
                        Mã PIN của bạn đã được thiết lập. Bạn có thể sử dụng mã PIN để xác thực nhanh các
                        giao dịch.
                    </Text>
                    <TouchableOpacity
                        onPress={handleSuccessDone}
                        style={[styles.doneBtn, { backgroundColor: c.success }]}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.doneBtnText}>Bắt đầu sử dụng</Text>
                    </TouchableOpacity>

                    {biometricSupported && (
                        <TouchableOpacity
                            onPress={handleEnableBiometric}
                            style={[styles.biometricSetupBtn, { marginTop: 16 }]}
                        >
                            <MaterialCommunityIcons name="face-recognition" size={20} color={c.primary} />
                            <Text style={[styles.biometricSetupText, { color: c.primary }]}>Sử dụng FaceID/Vân tay lần sau</Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

            {/* Header */}
            <LinearGradient
                colors={[c.primary, c.primaryDark ?? c.primary]}
                style={[styles.header, { paddingTop: stableTop + 10 }]}
            >
                {/* Back button - only on confirm step */}
                <View style={styles.headerRow}>
                    {step === 'confirm' ? (
                        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backBtn} />
                    )}
                    <View style={styles.headerCenter}>
                        <MaterialCommunityIcons name="shield-lock" size={32} color="#FFFFFF" />
                    </View>
                    <View style={styles.backBtn} />
                </View>
                <Text style={styles.headerTitle}>{titleByStep[step]}</Text>
                <Text style={styles.headerSub}>{subtitleByStep[step]}</Text>

                {/* Step indicator */}
                <View style={styles.stepRow}>
                    {['enter', 'confirm'].map((s, i) => (
                        <View
                            key={s}
                            style={[
                                styles.stepDot,
                                {
                                    backgroundColor:
                                        step === s || (step === 'confirm' && i === 0)
                                            ? '#000'
                                            : 'rgba(0,0,0,0.3)',
                                    width: step === s ? 24 : 8,
                                },
                            ]}
                        />
                    ))}
                </View>
            </LinearGradient>

            {/* PIN dots display */}
            <View style={styles.pinArea}>
                <View style={styles.dotsRow}>
                    {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <PinDot
                            key={i}
                            filled={i < currentPin.length}
                            shake={shakeAnim}
                            theme={theme}
                        />
                    ))}
                </View>
            </View>

            {/* Numpad */}
            <View style={[styles.numpad, { backgroundColor: c.backgroundSecondary }]}>
                {NUMPAD_KEYS.map((row, rowIdx) => (
                    <View key={rowIdx} style={styles.numpadRow}>
                        {row.map((key, colIdx) => {
                            const isBackspace = key === '⌫';
                            const isEmpty = key === '';
                            return (
                                <TouchableOpacity
                                    key={colIdx}
                                    style={[
                                        styles.numpadKey,
                                        {
                                            backgroundColor: isEmpty
                                                ? 'transparent'
                                                : isBackspace
                                                    ? c.backgroundTertiary
                                                    : c.surface,
                                            borderColor: isEmpty ? 'transparent' : c.border,
                                        },
                                    ]}
                                    onPress={() => handleKeyPress(key)}
                                    disabled={isEmpty || submitting}
                                    activeOpacity={0.6}
                                >
                                    {isBackspace ? (
                                        <MaterialCommunityIcons
                                            name="backspace-outline"
                                            size={22}
                                            color={c.textSecondary}
                                        />
                                    ) : (
                                        <Text style={[styles.numpadKeyText, { color: c.textPrimary }]}>
                                            {key}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>

            {/* Smart OTP Modal */}
            <OTPVerifyModal
                visible={otpVisible}
                actionType={OtpActionType.PIN_SETUP}
                actionData={{}}
                title="Xác thực Smart OTP"
                description="Nhập mã OTP để xác nhận tạo mã PIN"
                onSuccess={handleOtpSuccess}
                onCancel={handleOtpCancel}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // ── Header ─────────────────────────────────────────────────────────────
    header: {
        paddingBottom: 24,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 12,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        marginTop: 4,
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 16,
    },
    stepDot: {
        height: 8,
        borderRadius: 4,
    },
    // ── PIN dots ────────────────────────────────────────────────────────────
    pinArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 16,
    },
    dot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
    },
    // ── Numpad ──────────────────────────────────────────────────────────────
    numpad: {
        paddingBottom: Platform.OS === 'ios' ? 36 : 20,
        paddingTop: 16,
        paddingHorizontal: 16,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    numpadRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 12,
    },
    numpadKey: {
        flex: 1,
        aspectRatio: 1.6,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        maxHeight: 60,
    },
    numpadKeyText: {
        fontSize: 22,
        fontWeight: '600',
    },
    // ── Success ─────────────────────────────────────────────────────────────
    successWrapper: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    successIconBg: {
        width: 130,
        height: 130,
        borderRadius: 65,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 28,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 12,
    },
    successSub: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 40,
    },
    doneBtn: {
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 14,
    },
    doneBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    // ── Activate UI ──────────────────────────────────────────────────────────
    activateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    activateIconBg: {
        width: 140,
        height: 140,
        borderRadius: 70,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    featureList: {
        width: '100%',
        marginBottom: 40,
        gap: 12,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    featureText: {
        fontSize: 15,
    },
    activateBtn: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    activateBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    activateNote: {
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    biometricSetupBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
    },
    biometricSetupText: {
        fontSize: 14,
        fontWeight: '500',
    },
    // ── 2FA Modal styles ──────────────────────────────────────────────────
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        zIndex: 1000,
    },
    modalContent: {
        width: '100%',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    modalSub: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
    inputContainer: {
        width: '100%',
        height: 56,
        borderWidth: 1.5,
        borderRadius: 12,
        justifyContent: 'center',
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    textInput: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 8,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    modalBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBtnText: {
        fontWeight: '700',
        fontSize: 15,
    },
});
