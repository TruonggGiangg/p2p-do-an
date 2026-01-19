import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { GlassCard } from './GlassCard';
import { GlassTokens } from '../theme';
import { Ionicons } from '@expo/vector-icons';

interface QRCodeDisplayProps {
    phone: string;
    name?: string;
    onClose?: () => void;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ phone, name, onClose }) => {
    // Generate QR data as JSON for better parsing
    const qrData = phone ? JSON.stringify({
        phone: phone,
        type: 'transfer',
    }) : '';

    if (!phone) {
        return (
            <SafeAreaView style={styles.container}>
                <GlassCard style={styles.card}>
                    <Text style={styles.title}>Lỗi</Text>
                    <Text style={styles.subtitle}>Không có số điện thoại để tạo QR code</Text>
                    {onClose && (
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>Đóng</Text>
                        </TouchableOpacity>
                    )}
                </GlassCard>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {onClose && (
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
            )}

            <GlassCard style={styles.card}>
                <Text style={styles.title}>Mã QR của tôi</Text>
                <Text style={styles.subtitle}>Quét mã này để nhận tiền</Text>

                <View style={styles.qrContainer}>
                    {qrData ? (
                        <QRCode value={qrData} size={200} backgroundColor="white" color="black" />
                    ) : (
                        <Text style={styles.errorText}>Không thể tạo QR code</Text>
                    )}
                </View>

                <View style={styles.infoContainer}>
                    <View style={styles.infoRow}>
                        <Ionicons name="person-outline" size={16} color={GlassTokens.colors.textSecondary} />
                        <Text style={styles.infoLabel}>Tên:</Text>
                        <Text style={styles.infoValue}>{name || 'Người dùng'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={16} color={GlassTokens.colors.textSecondary} />
                        <Text style={styles.infoLabel}>SĐT:</Text>
                        <Text style={styles.infoValue}>{phone}</Text>
                    </View>
                </View>
            </GlassCard>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: GlassTokens.spacing.lg,
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
        marginTop: GlassTokens.spacing.lg,
        paddingVertical: GlassTokens.spacing.md,
        paddingHorizontal: GlassTokens.spacing.xl,
        backgroundColor: GlassTokens.colors.primary,
        borderRadius: GlassTokens.radius.md,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    errorText: {
        color: GlassTokens.colors.error,
        fontSize: 14,
        textAlign: 'center',
    },
    card: {
        alignItems: 'center',
        padding: GlassTokens.spacing.xl,
        width: '100%',
        maxWidth: 350,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginBottom: GlassTokens.spacing.xs,
    },
    subtitle: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        marginBottom: GlassTokens.spacing.xl,
    },
    qrContainer: {
        backgroundColor: 'white',
        padding: GlassTokens.spacing.md,
        borderRadius: GlassTokens.radius.md,
        marginBottom: GlassTokens.spacing.xl,
    },
    infoContainer: {
        width: '100%',
        gap: GlassTokens.spacing.md,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: GlassTokens.spacing.sm,
    },
    infoLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        flex: 1,
    },
});

export default QRCodeDisplay;
