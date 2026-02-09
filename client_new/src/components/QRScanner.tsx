import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { CameraView, Camera, useCameraPermissions } from 'expo-camera';
import { View as SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonCard } from './common/CommonCard';
import { useTheme } from '../contexts/ThemeContext';

interface QRScannerProps {
    visible: boolean;
    onClose: () => void;
    onScan: (data: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ visible, onClose, onScan }) => {
    const { theme } = useTheme();
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

        if (__DEV__) {
            console.log('[QRScanner] Scanned data:', data);
        }

        // Parse QR data - expect format: account number, phone number or JSON with data
        let scannedValue: string | null = null;

        try {
            // Try to parse as JSON first
            const parsed = JSON.parse(data);
            scannedValue = parsed.accountNo || parsed.phoneNumber || parsed.phone || parsed.recipientPhone;

            if (!scannedValue && parsed.type === 'transfer' && (parsed.accountNo || parsed.phone)) {
                scannedValue = parsed.accountNo || parsed.phone;
            }
        } catch {
            // Not JSON, treat as plain string (clean digits)
            scannedValue = data.trim();
        }

        // Validate scanned value
        if (scannedValue) {
            if (__DEV__) {
                console.log('[QRScanner] Valid data scanned:', scannedValue);
            }
            onScan(scannedValue);
            onClose();
        } else {
            Alert.alert('Lỗi', 'QR code không hợp lệ. Vui lòng quét mã QR chứa số tài khoản hoặc số điện thoại.');
            setScanned(false);
        }
    };

    // Don't render if not visible
    if (!visible) {
        return null;
    }

    if (!permission) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
                <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                    <SafeAreaView style={styles.container}>
                        <View style={styles.permissionContainer}>
                            <ActivityIndicator size="large" color={theme.colors.primary} />
                            <Text style={styles.permissionText}>Đang kiểm tra quyền camera...</Text>
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        );
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
                <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                    <SafeAreaView style={styles.container}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Quét QR</Text>
                            <View style={{ width: 40 }} />
                        </View>

                        <View style={styles.permissionContainer}>
                            <Ionicons name="camera-outline" size={64} color={theme.colors.textMuted} />
                            <Text style={[styles.permissionTitle, { color: theme.colors.textPrimary }]}>Cần quyền truy cập camera</Text>
                            <Text style={[styles.permissionText, { color: theme.colors.textSecondary }]}>
                                Ứng dụng cần quyền truy cập camera để quét mã QR chuyển tiền
                            </Text>
                            <TouchableOpacity
                                style={[styles.permissionButton, { backgroundColor: theme.colors.primary }]}
                                onPress={requestPermission}
                            >
                                <Text style={styles.permissionButtonText}>Cấp quyền</Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Quét mã QR</Text>
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
                                <CommonCard style={styles.hintCard}>
                                    <Text style={[styles.hintText, { color: theme.colors.textPrimary }]}>
                                        Đưa mã QR vào khung để quét
                                    </Text>
                                    <Text style={[styles.hintSubtext, { color: theme.colors.textSecondary }]}>
                                        Mã QR chứa số tài khoản hoặc số điện thoại người nhận
                                    </Text>
                                </CommonCard>
                            </View>
                        </CameraView>
                    </View>
                </SafeAreaView>
            </View>
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
        padding: 16,
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
        margin: 16,
        borderRadius: 16,
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
        borderColor: '#8b5cf6',
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
        marginTop: 32,
        padding: 16,
    },
    hintText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 4,
    },
    hintSubtext: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 12,
        textAlign: 'center',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    permissionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginTop: 24,
        marginBottom: 16,
    },
    permissionText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginBottom: 32,
    },
    permissionButton: {
        backgroundColor: '#8b5cf6',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 12,
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default QRScanner;
