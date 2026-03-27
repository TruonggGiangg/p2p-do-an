/**
 * PinChangeScreen
 * Đổi mã PIN: Nhập PIN cũ → Nhập PIN mới → Xác nhận PIN mới → Smart OTP → Lưu
 */
import React, { useState, useCallback, useRef, useLayoutEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    Alert,
    Platform,
    StatusBar,
    Vibration,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { OTPVerifyModal } from '../../../components';
import { pinAPI } from '../api/pin.api';
import { OtpActionType } from '../../../types/otp.types';

const NUMPAD_KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
];

const PIN_LENGTH = 6;

type Step = 'oldPin' | 'newPin' | 'confirmPin' | 'otp' | 'success';

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

export default function PinChangeScreen() {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const c = theme.colors;

    // Cached Safe Area
    const FALLBACK_TOP = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24);
    const cachedTopInset = useRef<number>(FALLBACK_TOP);
    const [ready, setReady] = useState(false);
    useLayoutEffect(() => {
        if (insets.top > 0 && !ready) {
            cachedTopInset.current = insets.top;
            setReady(true);
        }
    }, [insets.top, ready]);
    const stableTop = cachedTopInset.current;

    const [step, setStep] = useState<Step>('oldPin');
    const [oldPin, setOldPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [otpVisible, setOtpVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [verifyingOld, setVerifyingOld] = useState(false);
    const [error, setError] = useState('');

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;
    const otpSuccessHandledRef = useRef(false);

    const currentPin =
        step === 'oldPin' ? oldPin :
            step === 'newPin' ? newPin :
                confirmPin;

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

    const handleKeyPress = useCallback(
        (key: string) => {
            if (step === 'otp' || step === 'success' || verifyingOld) return;
            setError('');

            if (key === '⌫') {
                if (step === 'oldPin') setOldPin((p) => p.slice(0, -1));
                else if (step === 'newPin') setNewPin((p) => p.slice(0, -1));
                else setConfirmPin((p) => p.slice(0, -1));
                return;
            }
            if (!key) return;

            if (step === 'oldPin') {
                if (oldPin.length >= PIN_LENGTH) return;
                const next = oldPin + key;
                setOldPin(next);
                if (next.length === PIN_LENGTH) {
                    verifyOldPin(next);
                }
            } else if (step === 'newPin') {
                if (newPin.length >= PIN_LENGTH) return;
                const next = newPin + key;
                setNewPin(next);
                if (next.length === PIN_LENGTH) {
                    setTimeout(() => setStep('confirmPin'), 200);
                }
            } else if (step === 'confirmPin') {
                if (confirmPin.length >= PIN_LENGTH) return;
                const next = confirmPin + key;
                setConfirmPin(next);
                if (next.length === PIN_LENGTH) {
                    if (next !== newPin) {
                        triggerShake();
                        setError('Mã PIN không khớp');
                        setTimeout(() => setConfirmPin(''), 300);
                    } else {
                        setTimeout(() => setOtpVisible(true), 200);
                    }
                }
            }
        },
        [step, oldPin, newPin, confirmPin, triggerShake, verifyOldPin, verifyingOld],
    );

    const handleBack = useCallback(() => {
        setError('');
        if (step === 'newPin') {
            setStep('oldPin');
            setOldPin('');
            setNewPin('');
        } else if (step === 'confirmPin') {
            setStep('newPin');
            setConfirmPin('');
        } else {
            navigation.goBack();
        }
    }, [step, navigation]);

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
                await pinAPI.changePin({ oldPin, newPin, sessionId });
                setStep('success');
                Animated.parallel([
                    Animated.spring(successScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
                    Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                ]).start();
            } catch (err: any) {
                const message = err?.response?.data?.message || err?.message || 'Đã có lỗi xảy ra';
                Alert.alert('Lỗi', message);
                setConfirmPin('');
                otpSuccessHandledRef.current = false;
            } finally {
                setSubmitting(false);
            }
        },
        [oldPin, newPin, successScale, successOpacity],
    );

    // ── Render ──
    const titleByStep: Record<Step, string> = {
        oldPin: 'Nhập mã PIN hiện tại',
        newPin: 'Tạo mã PIN mới',
        confirmPin: 'Xác nhận mã PIN mới',
        otp: 'Xác thực Smart OTP',
        success: 'Hoàn tất',
    };

    const subtitleByStep: Record<Step, string> = {
        oldPin: 'Nhập mã PIN hiện tại để xác minh',
        newPin: 'Nhập mã PIN mới 6 chữ số',
        confirmPin: 'Nhập lại mã PIN mới để xác nhận',
        otp: '',
        success: '',
    };

    const stepIndex = step === 'oldPin' ? 0 : step === 'newPin' ? 1 : 2;

    if (step === 'success') {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
                <Animated.View
                    style={[styles.successWrapper, { opacity: successOpacity, transform: [{ scale: successScale }] }]}
                >
                    <LinearGradient
                        colors={[c.success + '20', c.success + '05']}
                        style={styles.successIconBg}
                    >
                        <MaterialCommunityIcons name="shield-check" size={72} color={c.success} />
                    </LinearGradient>
                    <Text style={[styles.successTitle, { color: c.textPrimary }]}>Đổi mã PIN thành công!</Text>
                    <Text style={[styles.successSub, { color: c.textSecondary }]}>
                        Mã PIN mới của bạn đã được cập nhật. Hãy nhớ mã PIN mới để sử dụng cho các lần xác thực tiếp theo.
                    </Text>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={[styles.doneBtn, { backgroundColor: c.success }]}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.doneBtnText}>Quay lại</Text>
                    </TouchableOpacity>
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
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color={c.onPrimary} />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <MaterialCommunityIcons name="shield-lock" size={32} color={c.onPrimary} />
                    </View>
                    <View style={styles.backBtn} />
                </View>
                <Text style={[styles.headerTitle, { color: c.onPrimary }]}>{titleByStep[step]}</Text>
                <Text style={[styles.headerSub, { color: c.onPrimary + 'B0' }]}>{subtitleByStep[step]}</Text>
            </LinearGradient>

            {/* PIN dots */}
            <View style={styles.pinArea}>
                {/* Step indicator */}
                <View style={styles.stepRow}>
                    {['oldPin', 'newPin', 'confirmPin'].map((s, i) => (
                        <View
                            key={s}
                            style={[
                                styles.stepDot,
                                {
                                    backgroundColor: i <= stepIndex ? c.primary : c.border,
                                    width: step === s ? 24 : 8,
                                },
                            ]}
                        />
                    ))}
                </View>

                <View style={styles.dotsRow}>
                    {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <PinDot key={i} filled={i < currentPin.length} shake={shakeAnim} theme={theme} />
                    ))}
                </View>
                {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}
                {verifyingOld ? <ActivityIndicator color={c.primary} style={{ marginTop: 16 }} /> : null}
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
                                    disabled={isEmpty || submitting || verifyingOld}
                                    activeOpacity={0.6}
                                >
                                    {isBackspace ? (
                                        <MaterialCommunityIcons name="backspace-outline" size={22} color={c.textSecondary} />
                                    ) : (
                                        <Text style={[styles.numpadKeyText, { color: c.textPrimary }]}>{key}</Text>
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
                actionType={OtpActionType.PIN_CHANGE}
                actionData={{}}
                title="Xác thực Smart OTP"
                description="Nhập mã OTP để xác nhận đổi mã PIN"
                onSuccess={handleOtpSuccess}
                onCancel={handleOtpCancel}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
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
    headerCenter: { alignItems: 'center' },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        marginTop: 4,
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 13,
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 32,
    },
    stepDot: {
        height: 8,
        borderRadius: 4,
    },
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
    errorText: {
        marginTop: 16,
        fontSize: 14,
        fontWeight: '500',
    },
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
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
});
