/**
 * PinChangeScreen — native keyboard
 * 2 modes:
 *   - change (default): Xác thực danh tính (PIN cũ HOẶC vân tay) → PIN mới → Xác nhận → OTP → Lưu
 *   - reset  (route param resetMode=true): Bỏ qua xác thực cũ → PIN mới → Xác nhận → OTP → Lưu (dùng resetPin API)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    Platform,
    StatusBar,
    Vibration,
    KeyboardAvoidingView,
    Keyboard,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../../../contexts/ThemeContext';
import { OTPVerifyModal, useToast } from '../../../components';
import { PinCodeInput, PinCodeInputRef } from '../../../components/common/PinCodeInput';
import { pinAPI } from '../api/pin.api';
import { OtpActionType } from '../../../types/otp.types';

const PIN_LENGTH = 6;

type Step = 'auth' | 'newPin' | 'confirmPin' | 'otp' | 'success';

export default function PinChangeScreen() {
    const navigation = useNavigation();
    const route = useRoute<RouteProp<{ PinChange: { resetMode?: boolean } }, 'PinChange'>>();
    const resetMode = route.params?.resetMode === true;
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const toast = useToast();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';

    // In resetMode, skip the auth step entirely — go to newPin
    const [step, setStep] = useState<Step>(resetMode ? 'newPin' : 'auth');
    const [oldPin, setOldPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [otpVisible, setOtpVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [verifyingOld, setVerifyingOld] = useState(false);
    const [error, setError] = useState('');

    // Biometric state
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [biometricType, setBiometricType] = useState<'fingerprint' | 'facial'>('fingerprint');
    const [authByBiometric, setAuthByBiometric] = useState(false);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;
    const otpSuccessHandledRef = useRef(false);
    const pinInputRef = useRef<PinCodeInputRef>(null);

    const currentPin =
        step === 'auth' ? oldPin :
            step === 'newPin' ? newPin :
                confirmPin;

    const setCurrentPin =
        step === 'auth' ? setOldPin :
            step === 'newPin' ? setNewPin :
                setConfirmPin;

    const isInputStep = step === 'auth' || step === 'newPin' || step === 'confirmPin';

    const focusPinInput = useCallback(() => {
        if (!isInputStep || verifyingOld || submitting) return;
        pinInputRef.current?.focus();
    }, [isInputStep, verifyingOld, submitting]);

    // Check biometric availability
    useEffect(() => {
        if (resetMode) return; // no biometric needed for reset — OTP is the auth
        (async () => {
            try {
                const compatible = await LocalAuthentication.hasHardwareAsync();
                const enrolled = await LocalAuthentication.isEnrolledAsync();
                if (compatible && enrolled) {
                    setBiometricAvailable(true);
                    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
                    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                        setBiometricType('facial');
                    }
                }
            } catch { }
        })();
    }, [resetMode]);

    // Auto-focus the hidden input when step changes
    useEffect(() => {
        if (isInputStep) {
            setTimeout(() => focusPinInput(), 150);
        }
    }, [isInputStep, focusPinInput]);

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

    const handleBiometricAuth = useCallback(async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Xác thực để đổi mã PIN',
                cancelLabel: 'Huỷ',
                disableDeviceFallback: true,
            });
            if (result.success) {
                setAuthByBiometric(true);
                setError('');
                setStep('newPin');
            }
        } catch { }
        finally {
            setTimeout(() => focusPinInput(), 120);
        }
    }, [focusPinInput]);

    const verifyOldPin = useCallback(async (pin: string) => {
        setVerifyingOld(true);
        setError('');
        try {
            const res = await pinAPI.verifyPin(pin);
            if (res.success) {
                setError('');
                setTimeout(() => setStep('newPin'), 200);
            } else {
                triggerShake();
                setError('Mã PIN không đúng');
                setTimeout(() => setOldPin(''), 300);
            }
        } catch {
            triggerShake();
            setError('Mã PIN không đúng');
            setTimeout(() => setOldPin(''), 300);
        } finally {
            setVerifyingOld(false);
        }
    }, [triggerShake]);

    const handlePinChange = useCallback((text: string) => {
        // Only allow digits, max PIN_LENGTH
        const cleaned = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
        setError('');
        setCurrentPin(cleaned);

        if (cleaned.length === PIN_LENGTH) {
            Keyboard.dismiss();
            if (step === 'auth') {
                verifyOldPin(cleaned);
            } else if (step === 'newPin') {
                setTimeout(() => {
                    setStep('confirmPin');
                }, 200);
            } else if (step === 'confirmPin') {
                if (cleaned !== newPin) {
                    triggerShake();
                    setError('Mã PIN không khớp');
                    setTimeout(() => setConfirmPin(''), 300);
                } else {
                    setTimeout(() => setOtpVisible(true), 200);
                }
            }
        }
    }, [step, newPin, verifyOldPin, triggerShake, setCurrentPin]);

    const handleBack = useCallback(() => {
        setError('');
        if (step === 'newPin' && !resetMode) {
            setStep('auth');
            setOldPin('');
            setNewPin('');
            setAuthByBiometric(false);
        } else if (step === 'confirmPin') {
            setStep('newPin');
            setNewPin('');
            setConfirmPin('');
        } else {
            navigation.goBack();
        }
    }, [step, navigation, resetMode]);

    const handleOtpCancel = useCallback(() => {
        setOtpVisible(false);
        setConfirmPin('');
        otpSuccessHandledRef.current = false;
    }, []);

    const handleOtpSuccess = useCallback(
        async ({ sessionId }: { sessionId: string }) => {
            if (otpSuccessHandledRef.current) return;
            otpSuccessHandledRef.current = true;
            setOtpVisible(false);
            setSubmitting(true);
            try {
                if (resetMode || authByBiometric) {
                    // Reset flow — no old PIN, use resetPin API
                    await pinAPI.resetPin({ newPin, sessionId });
                } else {
                    // Normal change flow — verify old PIN server-side too
                    await pinAPI.changePin({ oldPin, newPin, sessionId });
                }
                setStep('success');
                Animated.parallel([
                    Animated.spring(successScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
                    Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                ]).start();
            } catch (err: any) {
                const message = err?.response?.data?.message || err?.message || 'Đã có lỗi xảy ra';
                toast.show({ type: 'error', title: 'Lỗi', message });
                setConfirmPin('');
                otpSuccessHandledRef.current = false;
            } finally {
                setSubmitting(false);
            }
        },
        [oldPin, newPin, successScale, successOpacity, resetMode, authByBiometric, toast],
    );

    // Step config (always render 3 visual steps to keep layout stable)
    const steps: ReadonlyArray<'auth' | 'newPin' | 'confirmPin' | 'otp'> = resetMode
        ? ['newPin', 'confirmPin', 'otp']
        : ['auth', 'newPin', 'confirmPin'];
    const stepIndex = resetMode
        ? (otpVisible || submitting ? 2 : step === 'confirmPin' ? 1 : 0)
        : Math.max(0, steps.indexOf(step as 'auth' | 'newPin' | 'confirmPin'));

    const titleByStep: Record<Step, string> = {
        auth: 'Xác thực danh tính',
        newPin: 'Tạo mã PIN mới',
        confirmPin: 'Xác nhận mã PIN mới',
        otp: 'Xác thực Smart OTP',
        success: 'Hoàn tất',
    };

    const subtitleByStep: Record<Step, string> = {
        auth: biometricAvailable ? 'Nhập mã PIN hiện tại hoặc dùng sinh trắc học' : 'Nhập mã PIN hiện tại để xác minh',
        newPin: 'Nhập mã PIN mới 6 chữ số',
        confirmPin: 'Nhập lại mã PIN mới để xác nhận',
        otp: '',
        success: '',
    };

    // Colors
    const bgColor = c.background;
    const accentColor = c.primary;

    if (step === 'success') {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                <Animated.View
                    style={[styles.successWrapper, { opacity: successOpacity, transform: [{ scale: successScale }] }]}
                >
                    <LinearGradient
                        colors={[c.success + '20', c.success + '05']}
                        style={styles.successIconBg}
                    >
                        <MaterialCommunityIcons name="shield-check" size={72} color={c.success} />
                    </LinearGradient>
                    <Text style={[styles.successTitle, { color: c.textPrimary }]}>
                        {resetMode ? 'Đặt lại mã PIN thành công!' : 'Đổi mã PIN thành công!'}
                    </Text>
                    <Text style={[styles.successSub, { color: c.textSecondary }]}>
                        Mã PIN mới đã được cập nhật. Hãy nhớ mã PIN mới cho lần xác thực tiếp theo.
                    </Text>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={[styles.doneBtn, { backgroundColor: c.success }]}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.doneBtnText, { color: c.onPrimary }]}>Quay lại</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        );
    }

    const otpActionType = (resetMode || authByBiometric) ? OtpActionType.PIN_RESET : OtpActionType.PIN_CHANGE;
    const modeColor = resetMode ? c.warning : c.primary;
    const modeBorderColor = resetMode ? c.warningBorder : c.primaryBorder;
    const modeBgColor = resetMode ? c.warningGlass : c.primaryGlass;

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: bgColor }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            <View style={[styles.mainWrap, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                {/* Header */}
                <View style={[styles.header, { paddingTop: Math.max(insets.top, 44) }]}>
                    <View style={styles.headerRow}>
                        <TouchableOpacity
                            onPress={handleBack}
                            style={styles.backBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <MaterialCommunityIcons name="arrow-left" size={24} color={c.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
                            {resetMode ? 'Đặt lại mã PIN' : 'Đổi mã PIN'}
                        </Text>
                        <View style={{ width: 40 }} />
                    </View>
                </View>

                <View
                    style={[
                        styles.modeBadge,
                        { borderColor: modeBorderColor, backgroundColor: modeBgColor },
                    ]}
                >
                    <MaterialCommunityIcons
                        name={resetMode ? 'lock-reset' : 'shield-edit-outline'}
                        size={15}
                        color={modeColor}
                    />
                    <Text style={[styles.modeBadgeText, { color: modeColor }]}>
                        {resetMode ? 'Quên mã PIN' : 'Bảo mật tài khoản'}
                    </Text>
                </View>

                <View style={[styles.card, { backgroundColor: c.backgroundSecondary, borderColor: c.border }]}>
                    {/* Step indicator */}
                    <View style={styles.stepRow}>
                        {steps.map((s, i) => (
                            <View key={`${s}-${i}`} style={styles.stepItemRow}>
                                <View
                                    style={[
                                        styles.stepCircle,
                                        {
                                            backgroundColor: i <= stepIndex ? accentColor : c.backgroundTertiary,
                                        },
                                    ]}
                                >
                                    {i < stepIndex ? (
                                        <MaterialCommunityIcons name="check" size={12} color={c.onPrimary} />
                                    ) : (
                                        <Text style={[styles.stepCircleText, { color: i <= stepIndex ? c.onPrimary : c.textSecondary }]}>{i + 1}</Text>
                                    )}
                                </View>
                                {i < steps.length - 1 && (
                                    <View
                                        style={[
                                            styles.stepLine,
                                            { backgroundColor: i < stepIndex ? accentColor : c.backgroundTertiary },
                                        ]}
                                    />
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Title */}
                    <View style={styles.titleArea}>
                        <Text style={[styles.stepTitle, { color: c.textPrimary }]}>{titleByStep[step]}</Text>
                        <Text style={[styles.stepSubtitle, { color: c.textSecondary }]}>{subtitleByStep[step]}</Text>
                    </View>

                    {/* PIN input */}
                    <Animated.View
                        style={[
                            styles.pinInputWrap,
                            { transform: [{ translateX: shakeAnim }] },
                        ]}
                    >
                        <PinCodeInput
                            ref={pinInputRef}
                            value={currentPin}
                            onChange={handlePinChange}
                            length={PIN_LENGTH}
                            editable={!verifyingOld && !submitting && isInputStep}
                            autoFocus
                            hasError={Boolean(error)}
                            masked
                            containerStyle={styles.pinRow}
                            cellStyle={styles.pinCell}
                        />
                    </Animated.View>

                    {/* Error / Loading */}
                    {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}
                    {verifyingOld ? <ActivityIndicator color={accentColor} style={{ marginTop: 12 }} /> : null}

                    {/* Biometric button — only shown on auth step when biometric available */}
                    {step === 'auth' && biometricAvailable && (
                        <TouchableOpacity
                            onPress={handleBiometricAuth}
                            style={[
                                styles.biometricBtn,
                                { borderColor: c.primaryBorder, backgroundColor: c.primaryGlass },
                            ]}
                            activeOpacity={0.7}
                        >
                            <MaterialCommunityIcons
                                name={biometricType === 'facial' ? 'face-recognition' : 'fingerprint'}
                                size={24}
                                color={accentColor}
                            />
                            <Text style={[styles.biometricText, { color: accentColor }]}>
                                {biometricType === 'facial' ? 'Dùng Face ID' : 'Dùng vân tay'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <Text style={[styles.hintText, { color: c.textSecondary }]}>
                        Nhấn trực tiếp vào từng ô để mở bàn phím số và nhập mã PIN.
                    </Text>
                </View>
            </View>

            {/* Smart OTP Modal */}
            <OTPVerifyModal
                visible={otpVisible}
                actionType={otpActionType}
                actionData={{}}
                title="Xác thực Smart OTP"
                description={resetMode ? 'Nhập mã OTP để đặt lại mã PIN' : 'Nhập mã OTP để xác nhận đổi mã PIN'}
                onSuccess={handleOtpSuccess}
                onCancel={handleOtpCancel}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    mainWrap: {
        flex: 1,
        paddingHorizontal: 16,
    },
    header: {
        paddingHorizontal: 0,
        paddingBottom: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    modeBadge: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginTop: 6,
        marginBottom: 14,
    },
    modeBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    card: {
        borderRadius: 24,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 18,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        textAlign: 'center',
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 12,
        paddingBottom: 16,
        paddingHorizontal: 4,
    },
    stepItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    stepCircle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepCircleText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '700',
    },
    stepLine: {
        width: 46,
        height: 2,
        marginHorizontal: 8,
        borderRadius: 1,
    },
    titleArea: {
        alignItems: 'center',
        paddingHorizontal: 14,
        marginBottom: 18,
    },
    stepTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
    },
    stepSubtitle: {
        fontSize: 13,
        textAlign: 'center',
    },
    pinInputWrap: {
        marginBottom: 8,
        alignItems: 'center',
    },
    pinRow: {
        gap: 10,
    },
    pinCell: {
        width: 46,
        height: 56,
        borderRadius: 16,
    },
    errorText: {
        color: '#EB5757',
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
        marginTop: 8,
    },
    biometricBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 20,
        marginTop: 20,
        borderRadius: 12,
        borderWidth: 1,
    },
    hintText: {
        marginTop: 12,
        textAlign: 'center',
        fontSize: 12,
    },
    biometricText: {
        fontSize: 15,
        fontWeight: '600',
    },
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
        fontSize: 16,
        fontWeight: '700',
    },
});

