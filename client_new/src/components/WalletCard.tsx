import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import type { Wallet } from '../types/auth.types';

interface WalletCardProps {
    wallet: Wallet & {
        productName?: string;
        shortProductName?: string;
        accountNo?: string;
    };
}

const formatCurrency = (amount: number, currency: string = 'VND'): string => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
    }).format(amount);
};

const getWalletIcon = (type: string, productName?: string): keyof typeof MaterialCommunityIcons.glyphMap => {
    const pn = (productName || '').toLowerCase();
    if (pn.includes('trả sau') || pn.includes('credit')) return 'credit-card';
    if (pn.includes('điện tử') || pn.includes('vdt')) return 'wallet';
    
    switch (type) {
        case 'credit_wallet':
            return 'credit-card';
        case 'e_wallet':
            return 'wallet';
        default:
            return 'wallet-outline';
    }
};

const getWalletLabel = (type: string, productName?: string): string => {
    if (productName) return productName;
    
    switch (type) {
        case 'credit_wallet':
            return 'Ví Trả Sau';
        case 'e_wallet':
            return 'Ví điện tử';
        default:
            return 'Ví';
    }
};

export const WalletCard: React.FC<WalletCardProps> = ({ wallet }) => {
    const { theme } = useTheme();
    const isActive = wallet.status?.toLowerCase() === 'active';
    const productName = wallet.productName || wallet.metadata?.productName || '';
    const accountNo = wallet.accountNo || wallet.metadata?.accountNo || wallet.fineractSavingsId;
    const iconName = getWalletIcon(wallet.type, productName);

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: isActive ? theme.colors.primaryBorder : theme.colors.border,
                },
                !isActive && styles.containerLocked,
                theme.shadows.card,
            ]}
        >
            <View style={styles.header}>
                <View
                    style={[
                        styles.iconContainer,
                        {
                            backgroundColor: theme.colors.primaryGlass,
                            borderRadius: theme.radius.md,
                        },
                    ]}
                >
                    <MaterialCommunityIcons
                        name={iconName}
                        size={24}
                        color={theme.colors.primary}
                    />
                </View>
                <View style={styles.headerInfo}>
                    <Text style={[styles.walletType, { color: theme.colors.textPrimary }]}>
                        {getWalletLabel(wallet.type, productName)}
                    </Text>
                    <View
                        style={[
                            styles.statusBadge,
                            {
                                backgroundColor: isActive ? theme.colors.successGlass : theme.colors.textDim,
                                borderRadius: theme.radius.sm,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.statusText,
                                {
                                    color: isActive ? theme.colors.success : theme.colors.textMuted,
                                },
                            ]}
                        >
                            {isActive ? 'Hoạt động' : wallet.status || 'Đã khóa'}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.balanceContainer}>
                <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>Số dư</Text>
                <Text style={[styles.balanceAmount, { color: theme.colors.success }]}>
                    {formatCurrency(wallet.balance || 0, wallet.currency)}
                </Text>
            </View>

            <View style={[styles.details, { borderTopColor: theme.colors.border }]}>
                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Mã tài khoản</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.textSecondary }]}>{accountNo}</Text>
                </View>
                {wallet.shortProductName && (
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Mã sản phẩm</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.textSecondary }]}>
                            {wallet.shortProductName}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    containerLocked: {
        opacity: 0.6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    iconContainer: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerInfo: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    walletType: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 1,
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    statusText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    balanceContainer: {
        marginBottom: 20,
    },
    balanceLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 6,
    },
    balanceAmount: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        fontWeight: '700',
        flexWrap: 'wrap',
    },
    details: {
        borderTopWidth: 1,
        paddingTop: 16,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    detailLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    detailValue: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
});

export default WalletCard;
