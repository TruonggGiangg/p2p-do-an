import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CommonCard } from './common/CommonCard';
import { useTheme } from '../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface QRCodeDisplayProps {
    phone: string;
    name?: string;
    onClose?: () => void;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ phone, name, onClose }) => {
    const { theme } = useTheme();
    // Generate QR data as JSON for better parsing
    const qrData = phone ? JSON.stringify({
        phone: phone,
        type: 'transfer',
    }) : '';

    if (!phone) {
        return (
            <View style={styles.container}>
                <CommonCard style={styles.card}>
                    <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Lỗi</Text>
                    <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Không có số điện thoại để tạo QR code</Text>
                    {onClose && (
                        <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}>
                            <Text style={styles.closeButtonText}>Đóng</Text>
                        </TouchableOpacity>
                    )}
                </CommonCard>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {onClose && (
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
            )}

            <CommonCard style={styles.card}>
                <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Mã QR của tôi</Text>
                <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Quét mã này để nhận tiền</Text>

                <View style={styles.qrContainer}>
                    {qrData ? (
                        <QRCode value={qrData} size={200} backgroundColor="white" color="black" />
                    ) : (
                        <Text style={styles.errorText}>Không thể tạo QR code</Text>
                    )}
                </View>

                <View style={styles.infoContainer}>
                    <View style={styles.infoRow}>
                        <Ionicons name="person-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.infoLabel}>Tên:</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{name || 'Người dùng'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.infoLabel}>SĐT:</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{phone}</Text>
                    </View>
                </View>
            </CommonCard>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    closeBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    closeButton: {
        marginTop: 24,
        paddingVertical: 16,
        paddingHorizontal: 32,
        backgroundColor: '#8b5cf6',
        borderRadius: 12,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 14,
        textAlign: 'center',
    },
    card: {
        alignItems: 'center',
        padding: 32,
        width: '100%',
        maxWidth: 350,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 32,
    },
    qrContainer: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 12,
        marginBottom: 32,
    },
    infoContainer: {
        width: '100%',
        gap: 16,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    infoLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        flex: 1,
    },
});

export default QRCodeDisplay;
