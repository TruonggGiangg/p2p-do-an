import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    Animated,
    Easing,
    Dimensions
} from 'react-native';
import { CameraView, Camera, useCameraPermissions } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useConfirmModal } from './common/ConfirmModal';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import VentoUltimateLoading from './common/VentoSVGLoading';

const { width, height } = Dimensions.get('window');
const SCAN_SIZE = width * 0.65;

interface QRScannerProps {
    visible: boolean;
    onClose: () => void;
    onScan: (data: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ visible, onClose, onScan }) => {
    const { theme } = useTheme();
    const modal = useConfirmModal();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [torch, setTorch] = useState(false);
    const laserAnim = useRef(new Animated.Value(0)).current;
    const cornerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setScanned(false);
            startAnimations();
        }
    }, [visible]);

    const startAnimations = () => {
        // Laser animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(laserAnim, {
                    toValue: 1,
                    duration: 2500,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(laserAnim, {
                    toValue: 0,
                    duration: 2500,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        ).start();

        // Corner pulse animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(cornerAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(cornerAnim, {
                    toValue: 0,
                    duration: 1000,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        let scannedValue: string | null = null;
        try {
            const parsed = JSON.parse(data);
            scannedValue = parsed.accountNo || parsed.phoneNumber || parsed.phone || parsed.recipientPhone;
            if (!scannedValue && parsed.type === 'transfer' && (parsed.accountNo || parsed.phone)) {
                scannedValue = parsed.accountNo || parsed.phone;
            }
        } catch {
            scannedValue = data.trim();
        }

        if (scannedValue) {
            onScan(scannedValue);
            onClose();
        } else {
            modal.error('Lỗi', 'Mã QR không hợp lệ.', () => setScanned(false));
        }
    };

    if (!visible) return null;

    if (!permission) {
        return (
            <Modal visible={visible} transparent animationType="fade">
                <View style={styles.loadingContainer}>
                    <VentoUltimateLoading size={110} strokeWidth={9} staggerScale={0.4} showLabel={false} primaryColor={theme.colors.primary} glowColor={theme.colors.primaryLight} />
                </View>
            </Modal>
        );
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
                <BlurView intensity={80} tint="dark" style={styles.permissionContainer}>
                    <View style={styles.permissionContent}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="camera" size={40} color="#CDEA2D" />
                        </View>
                        <Text style={styles.permissionTitle}>Quyền Truy Cập Camera</Text>
                        <Text style={styles.permissionDesc}>
                            Chúng tôi cần camera để nhận diện mã QR giao dịch một cách nhanh chóng và chính xác.
                        </Text>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={requestPermission}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.buttonText}>Cho Phép Truy Cập</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.textButton} onPress={onClose}>
                            <Text style={styles.textButtonLabel}>Hủy bỏ</Text>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </Modal>
        );
    }

    const translateY = laserAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SCAN_SIZE],
    });

    const scale = cornerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.05],
    });

    return (
        <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" transparent>
            <View style={styles.container}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    enableTorch={torch}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                />

                {/* Overlay with Cutout */}
                <View style={styles.fullOverlay}>
                    <View style={styles.overlayTop} />
                    <View style={styles.overlayMiddle}>
                        <View style={styles.overlaySide} />
                        <View style={styles.scanRoot}>
                            <Animated.View style={[styles.scanFrame, { transform: [{ scale }] }]}>
                                {/* Animated Laser */}
                                <Animated.View style={[styles.laser, { transform: [{ translateY }] }]} />

                                {/* Corners */}
                                <View style={[styles.corner, styles.topLeft]} />
                                <View style={[styles.corner, styles.topRight]} />
                                <View style={[styles.corner, styles.bottomLeft]} />
                                <View style={[styles.corner, styles.bottomRight]} />
                            </Animated.View>
                        </View>
                        <View style={styles.overlaySide} />
                    </View>
                    <View style={styles.overlayBottom}>
                        <Text style={styles.hintText}>Đưa mã QR vào giữa khung hình</Text>
                    </View>
                </View>

                {/* Controls */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={onClose} style={styles.ctrlBtn}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.barTitle}>Quét mã QR</Text>
                    <TouchableOpacity onPress={() => setTorch(!torch)} style={styles.ctrlBtn}>
                        <MaterialCommunityIcons
                            name={torch ? "flashlight" : "flashlight-off"}
                            size={24}
                            color={torch ? "#CDEA2D" : "#fff"}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    topBar: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    barTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.5,
    },
    ctrlBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    fullOverlay: {
        flex: 1,
    },
    overlayTop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    overlayMiddle: {
        flexDirection: 'row',
        height: SCAN_SIZE,
    },
    overlaySide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        paddingTop: 40,
    },
    scanRoot: {
        width: SCAN_SIZE,
        height: SCAN_SIZE,
        backgroundColor: 'transparent',
    },
    scanFrame: {
        width: '100%',
        height: '100%',
        position: 'relative',
    },
    laser: {
        width: '100%',
        height: 3,
        backgroundColor: '#CDEA2D',
        shadowColor: '#CDEA2D',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 10,
        position: 'absolute',
    },
    corner: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderColor: '#CDEA2D',
        borderWidth: 4,
    },
    topLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
    },
    topRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
    },
    hintText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
        opacity: 0.9,
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        padding: 30,
    },
    permissionContent: {
        backgroundColor: 'rgba(30, 32, 38, 0.95)',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(252, 213, 53, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    permissionTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },
    permissionDesc: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    primaryButton: {
        backgroundColor: '#CDEA2D',
        width: '100%',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginBottom: 16,
    },
    buttonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
    textButton: {
        paddingVertical: 8,
    },
    textButtonLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default QRScanner;
