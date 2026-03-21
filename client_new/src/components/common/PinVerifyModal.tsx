/**
 * PinVerifyModal
 * Modal xác thực mã PIN 6 chữ số — dùng cho:
 *  - Gate khi vào tab BNPL / Loan (1 lần/phiên)
 *  - Xác thực trước Smart OTP khi tạo khoản vay
 */
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Animated,
    Platform,
    StatusBar,
    Vibration,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { pinAPI } from '../../features/auth/api/pin.api';
import * as LocalAuthentication from 'expo-local-authentication';

const NUMPAD_KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
];

const PIN_LENGTH = 6;

interface PinVerifyModalProps {
    visible: boolean;
    /** Gọi khi xác thực thành công */
    onSuccess: () => void;
    /** Gọi khi huỷ (nếu cho phép huỷ) */
    onCancel?: () => void;
    /** Cho phép nút đóng? (false cho gate bắt buộc) */
    dismissable?: boolean;
    title?: string;
    subtitle?: string;
}

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

export function PinVerifyModal({
    visible,
    onSuccess,
    onCancel,
    dismissable = true,
    title = 'Nhập mã PIN',
    subtitle = 'Nhập mã PIN 6 chữ số để tiếp tục',
}: PinVerifyModalProps) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const c = theme.colors;

    const [pin, setPin] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');
    const shakeAnim = useRef(new Animated.Value(0)).current;

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

    // ── Biometric ──
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [biometricType, setBiometricType] = useState<'fingerprint' | 'facial'>('fingerprint');
    const biometricPrompted = useRef(false);
    const onSuccessRef = useRef(onSuccess);
    onSuccessRef.current = onSuccess;

    useEffect(() => {
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
    }, []);

    const handleBiometricAuth = useCallback(async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Xác thực để tiếp tục',
                cancelLabel: 'Huỷ',
                disableDeviceFallback: true,
            });
            if (result.success) {
                setPin('');
                setError('');
                onSuccessRef.current();
            }
            // Nếu người dùng huỷ hoặc lỗi → im lặng và để người dùng nhập PIN
        } catch {
            // Bỏ qua lỗi thiếu quyền (thường xảy ra trên Expo Go)
            // Khi build native (EAS/expo run:ios) với app.json đúng thì sẽ hoạt động
            setBiometricAvailable(false);
        }
    }, []);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (visible && biometricAvailable && !biometricPrompted.current) {
            biometricPrompted.current = true;
            // On iOS, we want it to be immediate but after the modal slide animation starts to feel native
            timeout = setTimeout(() => {
                handleBiometricAuth();
            }, Platform.OS === 'ios' ? 250 : 500);
        }
        if (!visible) {
            biometricPrompted.current = false;
        }
        return () => timeout && clearTimeout(timeout);
    }, [visible, biometricAvailable, handleBiometricAuth]);

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

    const handleVerify = useCallback(async (fullPin: string) => {
        setVerifying(true);
        setError('');
        try {
            const status = await pinAPI.getStatus();
            if (!status.hasPin) {
                triggerShake();
                setError('Bạn chưa thiết lập mã PIN. Vui lòng thiết lập mã PIN trước.');
                setTimeout(() => setPin(''), 300);
                return;
            }

            const res = await pinAPI.verifyPin(fullPin);
            if (res.success) {
                setPin('');
                onSuccess();
            } else {
                triggerShake();
                setError('Mã PIN không đúng');
                setTimeout(() => setPin(''), 300);
            }
        } catch {
            triggerShake();
            setError('Mã PIN không đúng');
            setTimeout(() => setPin(''), 300);
        } finally {
            setVerifying(false);
        }
    }, [onSuccess, triggerShake]);

    const handleKeyPress = useCallback(
        (key: string) => {
            if (verifying) return;

            if (key === '⌫') {
                setPin((prev) => prev.slice(0, -1));
                setError('');
                return;
            }
            if (!key) return;
            if (pin.length >= PIN_LENGTH) return;

            const next = pin + key;
            setPin(next);
            setError('');

            if (next.length === PIN_LENGTH) {
                handleVerify(next);
            }
        },
        [pin, verifying, handleVerify],
    );

    const handleClose = useCallback(() => {
        setPin('');
        setError('');
        onCancel?.();
    }, [onCancel]);

    return (
        <Modal visible={visible} animationType="slide" statusBarTranslucent transparent={false}>
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

                {/* Header */}
                <LinearGradient
                    colors={[c.primary, c.primaryDark ?? c.primary]}
                    style={[styles.header, { paddingTop: stableTop + 10 }]}
                >
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <View style={styles.headerCenter}>
                            <MaterialCommunityIcons name="shield-lock" size={32} color="#FFF" />
                        </View>
                        <View style={styles.backBtn} />
                    </View>
                    <Text style={styles.headerTitle}>{title}</Text>
                    <Text style={styles.headerSub}>{subtitle}</Text>
                </LinearGradient>

                {/* PIN dots */}
                <View style={styles.pinArea}>
                    <View style={styles.dotsRow}>
                        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                            <PinDot key={i} filled={i < pin.length} shake={shakeAnim} theme={theme} />
                        ))}
                    </View>
                    {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}
                    {verifying ? <ActivityIndicator color={c.primary} style={{ marginTop: 16 }} /> : null}
                    {biometricAvailable && (
                        <TouchableOpacity onPress={handleBiometricAuth} style={styles.biometricBtn} activeOpacity={0.7}>
                            <MaterialCommunityIcons
                                name={biometricType === 'facial' ? 'face-recognition' : 'fingerprint'}
                                size={36}
                                color={c.primary}
                            />
                            <Text style={[styles.biometricText, { color: c.primary }]}>
                                {biometricType === 'facial' ? 'Xác thực bằng Face ID' : 'Xác thực bằng vân tay'}
                            </Text>
                        </TouchableOpacity>
                    )}
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
                                        disabled={isEmpty || verifying}
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
            </View>
        </Modal>
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
        color: '#FFF',
        marginTop: 4,
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 16,
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
    biometricBtn: {
        alignItems: 'center',
        marginTop: 28,
        paddingVertical: 8,
    },
    biometricText: {
        fontSize: 14,
        fontWeight: '500',
        marginTop: 8,
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
});

export default PinVerifyModal;
