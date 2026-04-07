/**
 * PinVerifyModal — bottom sheet PIN verification with native keyboard
 * Modal xác thực mã PIN 6 chữ số — dùng cho:
 *  - Gate khi vào tab BNPL / Loan (1 lần/phiên)
 *  - Xác thực trước Smart OTP khi tạo khoản vay
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
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
    Keyboard,
    KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { pinAPI } from '../../features/auth/api/pin.api';
import { PinCodeInput, PinCodeInputRef } from './PinCodeInput';
import * as LocalAuthentication from 'expo-local-authentication';

const PIN_LENGTH = 6;

interface PinVerifyModalProps {
    visible: boolean;
    onSuccess: () => void;
    onCancel?: () => void;
    onForgotPin?: () => void;
    dismissable?: boolean;
    title?: string;
    subtitle?: string;
}

export function PinVerifyModal({
    visible,
    onSuccess,
    onCancel,
    onForgotPin,
    dismissable = true,
    title = 'Nhập mã PIN xác thực',
    subtitle,
}: PinVerifyModalProps) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';

    const [pin, setPin] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');
    const [biometricLoading, setBiometricLoading] = useState(false);
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(0)).current;
    const pinInputRef = useRef<PinCodeInputRef>(null);

    const focusPinInput = useCallback(() => {
        if (!visible || verifying) return;
        pinInputRef.current?.focus();
    }, [visible, verifying]);

    // ── Biometric ──
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [biometricType, setBiometricType] = useState<'fingerprint' | 'facial'>('fingerprint');
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

    // Slide-in animation
    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 1,
                useNativeDriver: true,
                damping: 20,
                stiffness: 200,
            }).start();
            // Focus the input when modal opens
            setTimeout(() => focusPinInput(), 300);
        } else {
            slideAnim.setValue(0);
        }
    }, [visible, slideAnim, focusPinInput]);

    const handleBiometricAuth = useCallback(async () => {
        if (biometricLoading) return;
        setBiometricLoading(true);
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
        } catch {
            setBiometricAvailable(false);
        } finally {
            setBiometricLoading(false);
            setTimeout(() => focusPinInput(), 120);
        }
    }, [biometricLoading, focusPinInput]);

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
                setError('Bạn chưa thiết lập mã PIN');
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

    const handlePinChange = useCallback((text: string) => {
        if (verifying) return;
        const cleaned = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
        setPin(cleaned);
        setError('');

        if (cleaned.length === PIN_LENGTH) {
            Keyboard.dismiss();
            handleVerify(cleaned);
        }
    }, [verifying, handleVerify]);

    const handleClose = useCallback(() => {
        setPin('');
        setError('');
        Keyboard.dismiss();
        onCancel?.();
    }, [onCancel]);

    const handleForgotPin = useCallback(() => {
        setPin('');
        setError('');
        Keyboard.dismiss();
        onForgotPin?.();
    }, [onForgotPin]);

    // Colors for the modal sheet
    const sheetBg = c.backgroundSecondary;
    const accentColor = c.primary;
    const linkColor = c.tertiary;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

                {/* Tap outside to dismiss */}
                <TouchableOpacity
                    style={styles.overlayTouchable}
                    activeOpacity={1}
                    onPress={dismissable ? handleClose : undefined}
                />

                {/* Bottom Sheet */}
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: sheetBg,
                            paddingBottom: Math.max(insets.bottom, 16),
                            transform: [{
                                translateY: slideAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [600, 0],
                                }),
                            }],
                        },
                    ]}
                >
                    {/* Handle bar */}
                    <View style={styles.handleBarWrap}>
                        <View style={[styles.handleBar, { backgroundColor: isDark ? '#444' : '#D0D0D0' }]} />
                    </View>

                    {/* Header row: title + close */}
                    <View style={styles.sheetHeader}>
                        <View style={{ width: 36 }} />
                        <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>
                            {title}
                        </Text>
                        {dismissable ? (
                            <TouchableOpacity
                                onPress={handleClose}
                                style={styles.closeBtn}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <MaterialCommunityIcons
                                    name="close"
                                    size={22}
                                    color={c.textSecondary}
                                />
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 36 }} />
                        )}
                    </View>

                    {subtitle ? (
                        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{subtitle}</Text>
                    ) : null}

                    <View style={[styles.heroIconWrap, { backgroundColor: c.primaryGlass, borderColor: c.primaryBorder }]}>
                        <MaterialCommunityIcons name="shield-lock-outline" size={22} color={accentColor} />
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
                            value={pin}
                            onChange={handlePinChange}
                            length={PIN_LENGTH}
                            editable={!verifying && !biometricLoading}
                            autoFocus={visible}
                            hasError={Boolean(error)}
                            masked
                            containerStyle={styles.pinRow}
                            cellStyle={styles.pinCell}
                        />
                    </Animated.View>

                    {/* Error text */}
                    {error ? (
                        <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
                    ) : null}
                    {(verifying || biometricLoading) ? <ActivityIndicator color={accentColor} style={{ marginTop: 12 }} /> : null}

                    {/* Biometric + Forgot PIN links */}
                    <View style={styles.actionLinks}>
                        {biometricAvailable && (
                            <TouchableOpacity
                                onPress={handleBiometricAuth}
                                style={[
                                    styles.biometricBtn,
                                    { backgroundColor: c.primaryGlass, borderColor: c.primaryBorder },
                                ]}
                                activeOpacity={0.7}
                                disabled={biometricLoading}
                            >
                                <MaterialCommunityIcons
                                    name={biometricType === 'facial' ? 'face-recognition' : 'fingerprint'}
                                    size={22}
                                    color={accentColor}
                                />
                                <Text style={[styles.biometricText, { color: accentColor }]}>
                                    {biometricType === 'facial' ? 'Xác thực bằng Face ID' : 'Xác thực bằng vân tay'}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {onForgotPin && (
                            <TouchableOpacity activeOpacity={0.7} style={styles.forgotBtn} onPress={handleForgotPin}>
                                <Text style={[styles.forgotText, { color: linkColor }]}>
                                    Quên mã PIN?
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={[styles.inputHint, { color: c.textSecondary }]}>Nhấn vào ô bất kỳ để mở bàn phím số</Text>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        flex: 1,
    },
    sheet: {
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        overflow: 'hidden',
    },
    handleBarWrap: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 4,
    },
    handleBar: {
        width: 40,
        height: 5,
        borderRadius: 3,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 8,
    },
    sheetTitle: {
        fontSize: 17,
        fontWeight: '700',
        textAlign: 'center',
        flex: 1,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pinInputWrap: {
        marginBottom: 8,
    },
    pinRow: {
        gap: 10,
    },
    pinCell: {
        width: 46,
        height: 56,
        borderRadius: 16,
    },
    heroIconWrap: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 14,
    },
    subtitle: {
        fontSize: 13,
        textAlign: 'center',
        paddingHorizontal: 24,
        marginBottom: 10,
    },
    errorText: {
        color: '#EB5757',
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
        marginTop: 8,
    },
    actionLinks: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
        gap: 6,
    },
    biometricBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    biometricText: {
        fontSize: 14,
        fontWeight: '600',
    },
    forgotBtn: {
        paddingVertical: 4,
    },
    forgotText: {
        fontSize: 14,
        fontWeight: '500',
    },
    inputHint: {
        textAlign: 'center',
        fontSize: 12,
        marginBottom: 14,
    },
});

export default PinVerifyModal;
