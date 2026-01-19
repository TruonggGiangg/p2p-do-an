import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { CameraView, Camera, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GradientBackground } from './GradientBackground';
import { GlassCard } from './GlassCard';
import { GlassTokens } from '../theme';

interface QRScannerProps {
    visible: boolean;
    onClose: () => void;
    onScan: (data: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ visible, onClose, onScan }) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const cameraRef = useRef<CameraView>(null);

    useEffect(() => {
        if (visible) {
            setScanned(false);
        }
    }, [visible]);

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);

        console.log('[QRScanner] Scanned data:', data);

        // Parse QR data - expect format: phone number or JSON with phone
        let phoneNumber: string | null = null;

        try {
            // Try to parse as JSON first
            const parsed = JSON.parse(data);
            if (parsed.phone || parsed.recipientPhone) {
                phoneNumber = parsed.phone || parsed.recipientPhone;
            } else if (parsed.type === 'transfer' && parsed.phone) {
                phoneNumber = parsed.phone;
            }
        } catch {
            // Not JSON, treat as plain phone number
            const cleanPhone = data.replace(/\D/g, '');
            if (cleanPhone.length === 10) {
                phoneNumber = cleanPhone;
            }
        }

        // Validate phone number format (10 digits)
        if (phoneNumber) {
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            const phoneRegex = /^[0-9]{10}$/;

            if (phoneRegex.test(cleanPhone)) {
                console.log('[QRScanner] Valid phone number:', cleanPhone);
                onScan(cleanPhone);
                onClose();
            } else {
                Alert.alert('Lỗi', 'QR code không hợp lệ. Số điện thoại phải có 10 chữ số.');
                setScanned(false);
            }
        } else {
            // Try to extract phone from plain text
            const cleanPhone = data.replace(/\D/g, '');
            if (cleanPhone.length === 10) {
                console.log('[QRScanner] Extracted phone from text:', cleanPhone);
                onScan(cleanPhone);
                onClose();
            } else {
                Alert.alert('Lỗi', 'QR code không hợp lệ. Vui lòng quét lại mã QR chứa số điện thoại (10 chữ số).');
                setScanned(false);
            }
        }
    };

    // Don't render if not visible
    if (!visible) {
        return null;
    }

    if (!permission) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
                <GradientBackground>
                    <SafeAreaView style={styles.container}>
                        <View style={styles.permissionContainer}>
                            <ActivityIndicator size="large" color={GlassTokens.colors.primary} />
                            <Text style={styles.permissionText}>Đang kiểm tra quyền camera...</Text>
                        </View>
                    </SafeAreaView>
                </GradientBackground>
            </Modal>
        );
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
                <GradientBackground>
                    <SafeAreaView style={styles.container}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>Quét QR</Text>
                            <View style={{ width: 40 }} />
                        </View>

                        <View style={styles.permissionContainer}>
                            <Ionicons name="camera-outline" size={64} color={GlassTokens.colors.textMuted} />
                            <Text style={styles.permissionTitle}>Cần quyền truy cập camera</Text>
                            <Text style={styles.permissionText}>
                                Ứng dụng cần quyền truy cập camera để quét mã QR chuyển tiền
                            </Text>
                            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                                <Text style={styles.permissionButtonText}>Cấp quyền</Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </GradientBackground>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <GradientBackground>
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Quét mã QR</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={styles.cameraContainer}>
                        <CameraView
                            ref={cameraRef}
                            style={styles.camera}
                            facing="back"
                            barcodeScannerSettings={{
                                barcodeTypes: ['qr'],
                            }}
                            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                        >
                            <View style={styles.overlay}>
                                <View style={styles.scanArea}>
                                    <View style={styles.corner} />
                                    <View style={[styles.corner, styles.topRight]} />
                                    <View style={[styles.corner, styles.bottomLeft]} />
                                    <View style={[styles.corner, styles.bottomRight]} />
                                </View>
                                <GlassCard style={styles.hintCard}>
                                    <Text style={styles.hintText}>
                                        Đưa mã QR vào khung để quét
                                    </Text>
                                    <Text style={styles.hintSubtext}>
                                        Mã QR chứa số điện thoại người nhận
                                    </Text>
                                </GlassCard>
                            </View>
                        </CameraView>
                    </View>
                </SafeAreaView>
            </GradientBackground>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: GlassTokens.spacing.md,
        paddingTop: 10,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },
    cameraContainer: {
        flex: 1,
        margin: GlassTokens.spacing.md,
        borderRadius: GlassTokens.radius.lg,
        overflow: 'hidden',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    scanArea: {
        width: 250,
        height: 250,
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: GlassTokens.colors.primary,
        borderWidth: 3,
        borderRightWidth: 0,
        borderBottomWidth: 0,
    },
    topRight: {
        top: 0,
        right: 0,
        borderRightWidth: 3,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderTopWidth: 0,
        borderRightWidth: 0,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderTopWidth: 0,
        borderLeftWidth: 0,
        borderRightWidth: 3,
    },
    hintCard: {
        marginTop: GlassTokens.spacing.xl,
        padding: GlassTokens.spacing.md,
    },
    hintText: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 4,
    },
    hintSubtext: {
        color: GlassTokens.colors.textMuted,
        fontSize: 12,
        textAlign: 'center',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: GlassTokens.spacing.xl,
    },
    permissionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginTop: GlassTokens.spacing.lg,
        marginBottom: GlassTokens.spacing.md,
    },
    permissionText: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        textAlign: 'center',
        marginBottom: GlassTokens.spacing.xl,
    },
    permissionButton: {
        backgroundColor: GlassTokens.colors.primary,
        paddingHorizontal: GlassTokens.spacing.xl,
        paddingVertical: GlassTokens.spacing.md,
        borderRadius: GlassTokens.radius.md,
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default QRScanner;
