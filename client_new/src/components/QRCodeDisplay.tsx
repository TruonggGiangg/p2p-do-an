import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface QRCodeDisplayProps {
    phone: string;
    name?: string;
    accountNo?: string;
    walletName?: string;
    onClose?: () => void;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ phone, name, accountNo, walletName, onClose }) => {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = theme.mode === 'dark';
    const c = theme.colors;

    // Generate QR data as JSON for better parsing
    const qrData = phone ? JSON.stringify({
        phone: phone,
        accountNo: accountNo,
        walletName: walletName,
        type: 'transfer',
    }) : '';

    const renderInfoRow = (icon: any, label: string, value: string) => (
        <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                <MaterialCommunityIcons name={icon} size={18} color={c.textSecondary} />
            </View>
            <View style={styles.infoText}>
                <Text style={[styles.infoLabel, { color: c.textDim }]}>{label}</Text>
                <Text style={[styles.infoValue, { color: c.textPrimary }]} numberOfLines={1}>{value}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Mã QR của tôi</Text>
                <Text style={[styles.cardSubtitle, { color: c.textDim }]}>Quét mã này để chuyển tiền nhanh</Text>
            </View>

            <View style={styles.qrWrapper}>
                <View style={styles.qrInner}>
                    {qrData ? (
                        <QRCode
                            value={qrData}
                            size={SCREEN_WIDTH * 0.55}
                            backgroundColor="white"
                            color="black"
                            quietZone={10}
                        />
                    ) : (
                        <View style={styles.qrError}>
                            <MaterialCommunityIcons name="qrcode-remove" size={48} color={c.error} />
                            <Text style={[styles.errorText, { color: c.error }]}>Không thể tạo mã</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.infoSection}>
                {renderInfoRow('account-outline', 'Chủ tài khoản', name || 'Người dùng')}
                {accountNo && renderInfoRow('wallet-outline', 'Số tài khoản', accountNo)}
                {walletName && renderInfoRow('bank-outline', 'Ví nhận tiền', walletName)}
                <View style={[styles.divider, { backgroundColor: c.border, opacity: 0.5 }]} />
                <View style={styles.footerNote}>
                    <MaterialCommunityIcons name="shield-check-outline" size={14} color={c.primary} />
                    <Text style={[styles.footerText, { color: c.textDim }]}>Giao dịch p2p an toàn & bảo mật</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    cardHeader: {
        alignItems: 'center',
        marginBottom: 32,
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 6,
    },
    cardSubtitle: {
        fontSize: 13,
        fontWeight: '500',
    },
    qrWrapper: {
        padding: 12,
        backgroundColor: '#fff',
        borderRadius: 24,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.05,
                shadowRadius: 10,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    qrInner: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    qrError: {
        width: SCREEN_WIDTH * 0.55,
        height: SCREEN_WIDTH * 0.55,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontSize: 12,
        fontWeight: '700',
        marginTop: 8,
    },
    infoSection: {
        width: '100%',
        marginTop: 32,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    infoIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    infoText: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 15,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        width: '100%',
        marginVertical: 16,
    },
    footerNote: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    footerText: {
        fontSize: 11,
        fontWeight: '500',
    },
});

export default QRCodeDisplay;
