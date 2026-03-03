import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    Dimensions,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    ScrollView,
    Linking,
    Platform,
    Vibration,
} from 'react-native';
import { Camera, CameraView, CameraType, PermissionStatus } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const FRAME_SIZE = screenWidth * 0.75;
const TOTAL_FRAMES = 5;
const FRAME_INTERVAL = 450;
const COUNTDOWN_SECONDS = 3;

type KycParams = {
    onVerify?: (result: { images: { uri: string }[] }) => Promise<any>;
    onComplete?: (result: any) => void;
    onSave?: () => void;
};

const FaceDetection: React.FC = () => {
    const { theme, themeMode } = useTheme();
    const isDark = themeMode === 'dark';
    const c = theme.colors;

    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<{ params: KycParams }, 'params'>>();
    const cameraRef = useRef<any>(null);

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [status, setStatus] = useState<
        'waiting' | 'countdown' | 'capturing' | 'processing' | 'completed'
    >('waiting');
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [capturedFrames, setCapturedFrames] = useState<{ uri: string }[]>([]);
    const [instruction, setInstruction] = useState('Đưa khuôn mặt vào trung tâm khung quét');
    const [captureProgress, setCaptureProgress] = useState(0);
    const [resultStatus, setResultStatus] = useState<'success' | 'failed' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Pulse animation for frame
    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.03,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
        return () => animation.stop();
    }, []);

    // Check permissions — tự động hỏi quyền nếu chưa có
    useEffect(() => {
        (async () => {
            const { status } = await Camera.getCameraPermissionsAsync();
            if (status === PermissionStatus.GRANTED) {
                setHasPermission(true);
            } else {
                // Chưa có quyền → tự động yêu cầu
                const req = await Camera.requestCameraPermissionsAsync();
                setHasPermission(req.status === PermissionStatus.GRANTED);
            }
        })();
    }, []);

    const requestPermission = async () => {
        const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
        if (status === PermissionStatus.GRANTED) {
            setHasPermission(true);
        } else if (!canAskAgain) {
            // Đã bị từ chối vĩnh viễn → mở Settings
            Linking.openSettings();
        }
    };

    const startCountdown = () => {
        if (status !== 'waiting') return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setStatus('countdown');
        setCountdown(COUNTDOWN_SECONDS);
        setInstruction('Giữ yên và nhìn thẳng vào camera...');

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setStatus('capturing');
                    return 0;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                return prev - 1;
            });
        }, 1000);
    };

    useEffect(() => {
        if (status === 'capturing') {
            startCapturing();
        }
    }, [status]);

    const startCapturing = async () => {
        setInstruction('Đang phân tích sinh trắc học...');
        const frames: { uri: string }[] = [];

        for (let i = 0; i < TOTAL_FRAMES; i++) {
            try {
                if (cameraRef.current) {
                    const photo = await cameraRef.current.takePictureAsync({
                        quality: 0.7,
                        skipProcessing: true,
                    });
                    frames.push({ uri: photo.uri });
                    const progress = ((i + 1) / TOTAL_FRAMES) * 100;
                    setCaptureProgress(progress);

                    if (Platform.OS === 'android') {
                        Vibration.vibrate(10);
                    } else {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }

                    Animated.timing(progressAnim, {
                        toValue: progress / 100,
                        duration: 300,
                        useNativeDriver: false,
                    }).start();
                }
            } catch (err) {
                console.error('Capture error:', err);
            }
            await new Promise(resolve => setTimeout(resolve, FRAME_INTERVAL));
        }

        processLiveness(frames);
    };

    const processLiveness = async (frames: { uri: string }[]) => {
        setStatus('processing');
        setIsProcessing(true);
        setInstruction('Đang đối soát dữ liệu...');

        const onVerify = route.params?.onVerify;
        if (onVerify) {
            try {
                const result = await onVerify({ images: frames });
                if (result.success) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setStatus('completed');
                    setResultStatus('success');
                    setInstruction('Xác thực sinh trắc thành công');

                    setTimeout(() => {
                        if (route.params?.onSave) route.params.onSave();
                        navigation.goBack();
                    }, 1200);
                } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    setStatus('completed');
                    setResultStatus('failed');
                    setInstruction(result.error || 'Xác thực không thành công');
                }
            } catch (err) {
                console.error('onVerify error:', err);
                setStatus('completed');
                setResultStatus('failed');
                setInstruction('Lỗi kết nối hệ thống');
            }
        }
        setIsProcessing(false);
    };

    const handleRetry = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCapturedFrames([]);
        setStatus('waiting');
        setCountdown(COUNTDOWN_SECONDS);
        setCaptureProgress(0);
        setResultStatus(null);
        setInstruction('Đưa khuôn mặt vào trung tâm khung quét');
        progressAnim.setValue(0);
    };

    if (hasPermission === null) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <ActivityIndicator size="large" color={c.primary} />
            </View>
        );
    }

    if (hasPermission === false) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <ScrollView contentContainerStyle={styles.permissionScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.permissionContainer}>
                        <View style={[styles.iconCircle, { backgroundColor: c.errorGlass }]}>
                            <Ionicons name="camera-outline" size={48} color={c.primary} />
                        </View>
                        <Text style={[styles.permissionTitle, { color: c.textPrimary }]}>Cần quyền Camera</Text>
                        <Text style={[styles.permissionDesc, { color: c.textSecondary }]}>
                            Ứng dụng cần quyền sử dụng camera để thực hiện xác thực khuôn mặt, bảo đảm an toàn cho tài khoản của bạn.
                        </Text>
                        <TouchableOpacity
                            style={[styles.primaryButton, { backgroundColor: c.primary }]}
                            onPress={requestPermission}
                        >
                            <Text style={[styles.buttonText, { color: '#000' }]}>Cấp quyền Camera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.secondaryButton, { borderColor: c.border }]}
                            onPress={() => Linking.openSettings()}
                        >
                            <Text style={[styles.secondaryButtonText, { color: c.textPrimary }]}>Mở cài đặt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.secondaryButton, { borderColor: c.border, marginTop: 8 }]}
                            onPress={() => navigation.goBack()}
                        >
                            <Text style={[styles.secondaryButtonText, { color: c.textSecondary }]}>Quay lại</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>
        );
    }

    const borderColor = status === 'completed' && resultStatus === 'success'
        ? c.success
        : resultStatus === 'failed' ? c.error : c.primary;

    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />

            <View style={styles.overlay}>
                {/* Glassmorphism Header */}
                <BlurView intensity={Platform.OS === 'ios' ? 20 : 100} tint={isDark ? 'dark' : 'light'} style={styles.headerGlass}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <Ionicons name="chevron-back" size={28} color={isDark ? '#fff' : '#000'} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#000' }]}>Xác thực khuôn mặt</Text>
                        <View style={{ width: 44 }} />
                    </View>
                </BlurView>

                <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
                    <View style={styles.instructionWrap}>
                        <Text style={[styles.instructionText, { color: '#fff' }]}>{instruction}</Text>
                        {status === 'capturing' && (
                            <View style={styles.progressLabelWrap}>
                                <Text style={styles.progressText}>{Math.round(captureProgress)}%</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.frameContainer}>
                        <Animated.View style={[
                            styles.faceFrame,
                            {
                                borderColor: borderColor,
                                shadowColor: borderColor,
                                transform: [{ scale: pulseAnim }]
                            }
                        ]}>
                            {status === 'countdown' && countdown > 0 && (
                                <Text style={styles.countdownText}>{countdown}</Text>
                            )}
                            {status === 'processing' && (
                                <ActivityIndicator size="large" color={c.primary} />
                            )}
                            {status === 'completed' && resultStatus === 'success' && (
                                <MaterialCommunityIcons name="check-decagram" size={100} color={c.success} />
                            )}
                            {status === 'completed' && resultStatus === 'failed' && (
                                <MaterialCommunityIcons name="alert-decagram" size={100} color={c.error} />
                            )}
                        </Animated.View>

                        {/* Outer Glow Ring */}
                        <View style={[styles.outerRing, { borderColor: borderColor + '40' }]} />
                    </View>

                    <View style={styles.bottomSection}>
                        <View style={styles.progressBarWrap}>
                            <View style={[styles.progressBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <Animated.View
                                    style={[
                                        styles.progressFill,
                                        {
                                            backgroundColor: borderColor,
                                            width: progressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0%', '100%']
                                            })
                                        }
                                    ]}
                                />
                            </View>
                        </View>

                        <View style={styles.actionContainer}>
                            {status === 'waiting' && (
                                <TouchableOpacity style={[styles.startButton, { backgroundColor: c.primary }]} onPress={startCountdown}>
                                    <Text style={styles.startButtonText}>Bắt đầu quét</Text>
                                    <Ionicons name="scan-outline" size={22} color="#000" />
                                </TouchableOpacity>
                            )}
                            {status === 'completed' && resultStatus === 'failed' && (
                                <TouchableOpacity style={[styles.retryButton, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={handleRetry}>
                                    <Ionicons name="refresh" size={20} color="#fff" />
                                    <Text style={styles.retryButtonText}>Thử lại ngay</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </Animated.View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    headerGlass: {
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        height: 56,
    },
    backBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
        textAlign: 'center',
        fontFamily: 'Poppins_700Bold',
    },
    mainContent: {
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 40,
    },
    instructionWrap: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    instructionText: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 26,
        fontFamily: 'Poppins_600SemiBold',
    },
    progressLabelWrap: {
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 4,
        borderRadius: 20,
    },
    progressText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    frameContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    faceFrame: {
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        borderRadius: FRAME_SIZE / 2,
        borderWidth: 4,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        zIndex: 2,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    },
    outerRing: {
        position: 'absolute',
        width: FRAME_SIZE + 40,
        height: FRAME_SIZE + 40,
        borderRadius: (FRAME_SIZE + 40) / 2,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        opacity: 0.4,
    },
    countdownText: {
        color: '#fff',
        fontSize: 84,
        fontWeight: '800',
        fontFamily: 'Poppins_800ExtraBold',
    },
    bottomSection: {
        width: '100%',
        alignItems: 'center',
        gap: 24,
    },
    progressBarWrap: {
        width: '70%',
    },
    progressBg: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
    },
    actionContainer: {
        width: '100%',
        alignItems: 'center',
    },
    startButton: {
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 40,
        borderRadius: 32,
        alignItems: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    startButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
    },
    retryButton: {
        flexDirection: 'row',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 28,
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    permissionScroll: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    permissionContainer: {
        alignItems: 'center',
        padding: 32,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    permissionTitle: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 12,
        textAlign: 'center',
        fontFamily: 'Poppins_700Bold',
    },
    permissionDesc: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
        fontFamily: 'Poppins_400Regular',
    },
    primaryButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    secondaryButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
    },
});

export default FaceDetection;

