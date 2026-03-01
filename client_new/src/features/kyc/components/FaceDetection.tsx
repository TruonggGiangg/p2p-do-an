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
} from 'react-native';
import { Camera, CameraView, CameraType, PermissionStatus } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

// Import theme directly or use from shared if available
// Assuming Theme is available at shared/theme or core/theme
// For now, defining local constants if shared is not easily found
const COLORS = {
    primary: '#FF9A56',
    white: '#FFFFFF',
    black: '#000000',
    error: '#F44336',
    success: '#4CAF50',
    grayLight: '#CCCCCC',
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const FRAME_SIZE = screenWidth * 0.7;
const TOTAL_FRAMES = 5;
const FRAME_INTERVAL = 400;
const COUNTDOWN_SECONDS = 3;

type KycParams = {
    onVerify?: (result: { images: { uri: string }[] }) => Promise<any>;
    onComplete?: (result: any) => void;
    onSave?: () => void;
};

const FaceDetection: React.FC = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<{ params: KycParams }, 'params'>>();
    const cameraRef = useRef<any>(null);

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [status, setStatus] = useState<
        'waiting' | 'countdown' | 'capturing' | 'processing' | 'completed'
    >('waiting');
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [capturedFrames, setCapturedFrames] = useState<{ uri: string }[]>([]);
    const [instruction, setInstruction] = useState('Đưa khuôn mặt vào khung tròn');
    const [captureProgress, setCaptureProgress] = useState(0);
    const [resultStatus, setResultStatus] = useState<'success' | 'failed' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    // Pulse animation for frame
    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [pulseAnim]);

    // Check permissions
    useEffect(() => {
        (async () => {
            const { status } = await Camera.getCameraPermissionsAsync();
            setHasPermission(status === PermissionStatus.GRANTED);
        })();
    }, []);

    const requestPermission = async () => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === PermissionStatus.GRANTED);
    };

    const startCountdown = () => {
        if (status !== 'waiting') return;

        setStatus('countdown');
        setCountdown(COUNTDOWN_SECONDS);
        setInstruction('Giữ yên và nhìn thẳng...');

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setStatus('capturing');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // Trigger capture when status changes to 'capturing'
    useEffect(() => {
        if (status === 'capturing') {
            startCapturing();
        }
    }, [status]);

    const startCapturing = async () => {
        setInstruction('Đang quét khuôn mặt...');
        const frames: { uri: string }[] = [];

        for (let i = 0; i < TOTAL_FRAMES; i++) {
            try {
                if (cameraRef.current) {
                    const photo = await cameraRef.current.takePictureAsync({
                        quality: 0.8,
                        skipProcessing: true,
                    });
                    frames.push({ uri: photo.uri });
                    const progress = ((i + 1) / TOTAL_FRAMES) * 100;
                    setCaptureProgress(progress);
                    setCapturedFrames([...frames]);

                    Animated.timing(progressAnim, {
                        toValue: progress / 100,
                        duration: 200,
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
        setInstruction('Đang xử lý...');

        const onVerify = route.params?.onVerify;
        if (onVerify) {
            setInstruction('Đang xác thực thông tin...');
            try {
                const result = await onVerify({ images: frames });
                if (result.success) {
                    setStatus('completed');
                    setResultStatus('success');
                    setInstruction('Xác thực thành công!');

                    setTimeout(() => {
                        Alert.alert('Thành công!', 'Xác thực khuôn mặt thành công', [
                            {
                                text: 'OK',
                                onPress: () => {
                                    if (route.params?.onSave) route.params.onSave();
                                    navigation.goBack();
                                },
                            },
                        ]);
                    }, 500);
                } else {
                    setStatus('completed');
                    setResultStatus('failed');
                    setInstruction(result.error || 'Xác thực thất bại');

                    setTimeout(() => {
                        Alert.alert('Không khớp', result.error || 'Khuôn mặt không khớp với CCCD. Vui lòng thử lại.', [
                            { text: 'Thử lại', onPress: handleRetry },
                            { text: 'Quay lại', onPress: () => navigation.goBack(), style: 'cancel' },
                        ]);
                    }, 500);
                }
            } catch (err) {
                console.error('onVerify error:', err);
                setStatus('completed');
                setResultStatus('failed');
                setInstruction('Lỗi kết nối');
            }
        } else {
            // Fallback
            if (route.params?.onComplete) {
                route.params.onComplete({
                    success: true,
                    images: frames,
                    mode: 'hybrid_liveness',
                });
            }
            setStatus('completed');
            setResultStatus('success');
            setInstruction('Hoàn tất!');
        }
        setIsProcessing(false);
    };

    const handleRetry = () => {
        setCapturedFrames([]);
        setStatus('waiting');
        setCountdown(COUNTDOWN_SECONDS);
        setCaptureProgress(0);
        setResultStatus(null);
        setInstruction('Đưa khuôn mặt vào khung tròn');
        progressAnim.setValue(0);
    };

    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionContainer}>
                    <Ionicons name="camera" size={48} color={COLORS.primary} />
                    <Text style={styles.permissionTitle}>Quyền Truy Cập Camera</Text>
                    <Text style={styles.permissionDesc}>
                        Ứng dụng cần quyền sử dụng camera để thực hiện xác thực khuôn mặt.
                    </Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>Cho phép truy cập</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (hasPermission === false) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionContainer}>
                    <Ionicons name={"camera-off" as any} size={64} color={COLORS.error} />
                    <Text style={styles.permissionTitle}>Quyền bị từ chối</Text>
                    <Text style={styles.permissionDesc}>
                        Vui lòng cho phép truy cập camera trong cài đặt điện thoại.
                    </Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.permissionButtonText}>Quay lại</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const borderColor = status === 'completed' && resultStatus === 'success' ? '#4CAF50' : COLORS.primary;

    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />

            <View style={styles.overlay}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={28} color={COLORS.white} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Xác thực khuôn mặt</Text>
                    <View style={{ width: 28 }} />
                </View>

                <View style={styles.instructionContainer}>
                    <Text style={styles.instructionText}>{instruction}</Text>
                    {status === 'capturing' && <Text style={styles.progressText}>{Math.round(captureProgress)}%</Text>}
                </View>

                <Animated.View style={[styles.faceFrame, { borderColor, transform: [{ scale: pulseAnim }] }]}>
                    {status === 'countdown' && countdown > 0 && <Text style={styles.countdownText}>{countdown}</Text>}
                    {status === 'processing' && <ActivityIndicator size="large" color={COLORS.white} />}
                    {status === 'completed' && resultStatus === 'success' && <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />}
                    {status === 'completed' && resultStatus === 'failed' && <Ionicons name="close-circle" size={80} color={COLORS.error} />}
                </Animated.View>

                <View style={styles.progressLineContainer}>
                    <View style={styles.progressLineBg}>
                        <Animated.View
                            style={[
                                styles.progressLineFill,
                                {
                                    width: progressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0%', '100%']
                                    })
                                }
                            ]}
                        />
                    </View>
                </View>

                <View style={styles.bottomActions}>
                    {status === 'waiting' && (
                        <TouchableOpacity style={styles.startButton} onPress={startCountdown}>
                            <Ionicons name="play" size={24} color={COLORS.white} />
                            <Text style={styles.buttonText}>Bắt đầu</Text>
                        </TouchableOpacity>
                    )}
                    {status === 'completed' && (
                        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                            <Ionicons name="refresh" size={24} color={COLORS.white} />
                            <Text style={styles.buttonText}>Thử lại</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.black,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 40,
    },
    header: {
        flexDirection: 'row',
        width: '100%',
        paddingHorizontal: 20,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
    instructionContainer: {
        alignItems: 'center',
    },
    instructionText: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    progressText: {
        color: '#4CAF50',
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 10,
    },
    faceFrame: {
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        borderRadius: FRAME_SIZE / 2,
        borderWidth: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countdownText: {
        color: COLORS.white,
        fontSize: 72,
        fontWeight: 'bold',
    },
    progressLineContainer: {
        width: '80%',
    },
    progressLineBg: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressLineFill: {
        height: '100%',
        backgroundColor: '#4CAF50',
    },
    bottomActions: {
        width: '100%',
        alignItems: 'center',
    },
    startButton: {
        flexDirection: 'row',
        backgroundColor: COLORS.primary,
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 25,
        alignItems: 'center',
        gap: 10,
    },
    retryButton: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 25,
        alignItems: 'center',
        gap: 10,
    },
    buttonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: 'bold',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    permissionTitle: {
        color: COLORS.white,
        fontSize: 22,
        fontWeight: 'bold',
        marginTop: 20,
    },
    permissionDesc: {
        color: COLORS.grayLight,
        textAlign: 'center',
        fontSize: 16,
        marginTop: 10,
        marginBottom: 30,
    },
    permissionButton: {
        backgroundColor: COLORS.primary,
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 25,
    },
    permissionButtonText: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default FaceDetection;
