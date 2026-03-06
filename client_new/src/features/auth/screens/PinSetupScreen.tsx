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
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Alert,
    Platform,
    StatusBar,
    Vibration,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { OTPVerifyModal } from '../../../components';
import { pinAPI } from '../api/pin.api';
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
    const c = theme.colors;

    const [step, setStep] = useState<Step>('enter');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [otpVisible, setOtpVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Shake animation khi nhập sai
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;

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
                            Alert.alert(
                                'Mã PIN không khớp',
                                'Mã PIN xác nhận không đúng. Vui lòng nhập lại.',
                                [{ text: 'Thử lại' }],
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
    }, []);

    const handleOtpSuccess = useCallback(
        async ({ sessionId }: { sessionId: string }) => {
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
                Alert.alert('Lỗi', message);
                setConfirmPin('');
            } finally {
                setSubmitting(false);
            }
        },
        [pin, refreshUser, successScale, successOpacity],
    );

    const handleSuccessDone = useCallback(() => {
        navigation.replace('Main');
    }, [navigation]);

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
                style={styles.header}
            >
                {/* Back button - only on confirm step */}
                <View style={styles.headerRow}>
                    {step === 'confirm' ? (
                        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <MaterialCommunityIcons name="arrow-left" size={24} color="#000" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backBtn} />
                    )}
                    <View style={styles.headerCenter}>
                        <MaterialCommunityIcons name="shield-lock" size={32} color="#000" />
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
        paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 10,
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
        color: '#000',
        marginTop: 4,
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 13,
        color: 'rgba(0,0,0,0.65)',
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
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
});
