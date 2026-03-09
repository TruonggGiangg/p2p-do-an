/**
 * SmartCASigningModal.tsx
 *
 * Modal component cho phiên ký số VNPT SmartCA embedded trong app.
 *
 * Flow:
 * 1. Parent gọi initiateSmartCaSigning() → lấy signingSessionId
 * 2. Mở modal → hiển thị trạng thái + hướng dẫn
 * 3. (Expo limitation) Không dùng native SDK → dùng WebView redirect đến VNPT SmartCA signing page
 * 4. WebView nhận kết quả → gọi confirmSmartCaSigning()
 * 5. Trả kết quả cho parent
 *
 * Khi chuyển sang dev-client / bare workflow → thay WebView bằng @aspect-vn/react-native-smartca-vnpt SDK
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import {
    loanService,
    SmartCaSigningSession,
    SmartCaSignResult,
} from '../services/loan.service';

const { width } = Dimensions.get('window');

interface SmartCASigningModalProps {
    visible: boolean;
    contractId: string;
    onClose: () => void;
    onSigningComplete: (status: 'signed' | 'failed' | 'rejected') => void;
}

type SigningPhase = 'preparing' | 'waiting_user' | 'confirming' | 'success' | 'error';

export default function SmartCASigningModal({
    visible,
    contractId,
    onClose,
    onSigningComplete,
}: SmartCASigningModalProps) {
    const { theme } = useTheme();
    const colors = theme.colors;

    const [phase, setPhase] = useState<SigningPhase>('preparing');
    const [session, setSession] = useState<SmartCaSigningSession | null>(null);
    const [error, setError] = useState<string>('');
    const [countdown, setCountdown] = useState(0);

    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const successAnim = useRef(new Animated.Value(0)).current;

    // ========= Initiate ==========
    const initiateSigning = useCallback(async () => {
        setPhase('preparing');
        setError('');

        try {
            const signingSession = await loanService.initiateSmartCaSigning(contractId);
            setSession(signingSession);
            setPhase('waiting_user');

            // Tính countdown
            const expiresMs = new Date(signingSession.expiresAt).getTime() - Date.now();
            setCountdown(Math.max(0, Math.floor(expiresMs / 1000)));
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể khởi tạo phiên ký số';
            setError(msg);
            setPhase('error');
        }
    }, [contractId]);

    // ========= Poll Status ==========
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
                    setError(result.status === 'rejected' ? 'Bạn đã từ chối ký hợp đồng' : 'Phiên ký đã hết hạn hoặc thất bại');
                    setPhase('error');
                    onSigningComplete(result.status === 'rejected' ? 'rejected' : 'failed');
                }
            } catch {
                // Non-fatal — keep polling
            }
        }, 3000);

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [phase, session]);

    // ========= Countdown Timer ==========
    useEffect(() => {
        if (phase !== 'waiting_user' || countdown <= 0) return;

        const timer = setInterval(() => {
            setCountdown(prev => {
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

    // ========= Init on visible ==========
    useEffect(() => {
        if (visible) {
            initiateSigning();
        } else {
            setPhase('preparing');
            setSession(null);
            setError('');
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
    }, [visible]);

    // ========= Simulate signing for dev (VNPT SDK not available in Expo Go) ==========
    const handleSimulateSign = async () => {
        if (!session) return;
        setPhase('confirming');

        try {
            // Simulate SDK returning SUCCESS
            const simulatedResult: SmartCaSignResult = {
                status: 'SUCCESS',
                signatureValue: 'SIMULATED_BASE64_PKCS7_SIGNATURE',
                signerInfo: {
                    commonName: 'Nguyễn Văn A',
                    serialNumber: '001234567890',
                    organization: 'VNPT-CA',
                },
            };

            const confirmResult = await loanService.confirmSmartCaSigning(
                session.signatureId,
                simulatedResult,
            );

            if (confirmResult.status === 'signed') {
                setPhase('success');
                Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
                setTimeout(() => onSigningComplete('signed'), 1500);
            } else {
                setError('Ký không thành công: ' + confirmResult.status);
                setPhase('error');
            }
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Xác nhận ký thất bại');
            setPhase('error');
        }
    };

    // ========= Retry ==========
    const handleRetry = async () => {
        if (!session) {
            initiateSigning();
            return;
        }
        try {
            const newSession = await loanService.retrySmartCaSigning(session.signatureId);
            setSession(newSession);
            setPhase('waiting_user');
            const expiresMs = new Date(newSession.expiresAt).getTime() - Date.now();
            setCountdown(Math.max(0, Math.floor(expiresMs / 1000)));
            setError('');
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không thể tạo phiên ký mới');
            setPhase('error');
        }
    };

    const formatCountdown = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // ========= Render ==========
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.modal, { backgroundColor: colors.surface }]}>
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

                    {/* Content */}
                    <View style={styles.content}>
                        {phase === 'preparing' && (
                            <View style={styles.phaseContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
                                    Đang khởi tạo phiên ký số...
                                </Text>
                            </View>
                        )}

                        {phase === 'waiting_user' && (
                            <View style={styles.phaseContainer}>
                                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                                    <MaterialCommunityIcons name="draw-pen" size={48} color={colors.primary} />
                                </View>
                                <Text style={[styles.phaseTitle, { color: colors.textPrimary }]}>
                                    Chờ xác nhận ký
                                </Text>
                                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                                    Vui lòng mở ứng dụng VNPT SmartCA và xác nhận ký bằng PIN hoặc vân tay.
                                </Text>

                                {/* Countdown */}
                                <View style={[styles.countdownBox, { backgroundColor: colors.background }]}>
                                    <Ionicons name="time-outline" size={16} color={colors.textDim} />
                                    <Text style={[styles.countdownText, { color: colors.textDim }]}>
                                        Thời gian còn lại: {formatCountdown(countdown)}
                                    </Text>
                                </View>

                                {/* Transaction Info (for debug) */}
                                {session && (
                                    <Text style={[styles.txInfo, { color: colors.textDim }]}>
                                        Mã giao dịch: {session.transactionId}
                                    </Text>
                                )}

                                {/* Dev mode: Simulate signing */}
                                {__DEV__ && (
                                    <TouchableOpacity
                                        style={[styles.devButton, { backgroundColor: '#FF6B6B' }]}
                                        onPress={handleSimulateSign}
                                    >
                                        <Text style={styles.devButtonText}>
                                            [DEV] Giả lập ký thành công
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {phase === 'confirming' && (
                            <View style={styles.phaseContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
                                    Đang xác nhận chữ ký số...
                                </Text>
                            </View>
                        )}

                        {phase === 'success' && (
                            <View style={styles.phaseContainer}>
                                <Animated.View
                                    style={[
                                        styles.successCircle,
                                        {
                                            backgroundColor: '#10B981',
                                            transform: [{ scale: successAnim }],
                                        },
                                    ]}
                                >
                                    <Ionicons name="checkmark" size={48} color="white" />
                                </Animated.View>
                                <Text style={[styles.phaseTitle, { color: '#10B981' }]}>
                                    Ký số thành công!
                                </Text>
                                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                                    Hợp đồng đã được ký số bằng chứng thư VNPT SmartCA.
                                </Text>
                            </View>
                        )}

                        {phase === 'error' && (
                            <View style={styles.phaseContainer}>
                                <View style={[styles.iconCircle, { backgroundColor: '#EF444415' }]}>
                                    <MaterialCommunityIcons name="alert-circle" size={48} color="#EF4444" />
                                </View>
                                <Text style={[styles.phaseTitle, { color: '#EF4444' }]}>
                                    Không thể ký
                                </Text>
                                <Text style={[styles.phaseDescription, { color: colors.textSecondary }]}>
                                    {error}
                                </Text>

                                <TouchableOpacity
                                    style={[styles.retryButton, { backgroundColor: colors.primary }]}
                                    onPress={handleRetry}
                                >
                                    <Ionicons name="refresh" size={18} color="white" />
                                    <Text style={styles.retryButtonText}>Thử lại</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
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
        minHeight: 420,
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
    content: {
        padding: 24,
        alignItems: 'center',
    },
    phaseContainer: {
        alignItems: 'center',
        gap: 14,
        paddingVertical: 20,
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
        paddingHorizontal: 16,
    },
    iconCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    successCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
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
    devButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 16,
    },
    devButtonText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
    },
});
