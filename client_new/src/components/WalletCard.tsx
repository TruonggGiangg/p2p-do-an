import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import type { Wallet } from '../types/auth.types';

interface WalletCardProps {
    wallet: Wallet;
    onPress?: () => void;
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
    if (pn.includes('trả sau') || pn.includes('credit')) return 'credit-card-outline';
    if (pn.includes('điện tử') || pn.includes('vdt')) return 'wallet-outline';

    switch (type) {
        case 'credit_wallet':
            return 'credit-card-outline';
        case 'e_wallet':
            return 'wallet-outline';
        default:
            return 'wallet-outline';
    }
};

export const WalletCard: React.FC<WalletCardProps> = ({ wallet, onPress }) => {
    const { theme, themeMode } = useTheme();
    const isActive = wallet.status?.toLowerCase() === 'active';
    const productName = wallet.productName || wallet.metadata?.productName || 'Digital Wallet';
    const accountNo = wallet.accountNo || wallet.metadata?.accountNo || wallet.fineractSavingsId;
    const iconName = getWalletIcon(wallet.type, productName);

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[
                styles.container,
                { backgroundColor: theme.colors.backgroundSecondary || theme.colors.surface }
            ]}
        >
            <View style={styles.content}>
                <View style={styles.leftPart}>
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.primaryGlass || 'rgba(252, 213, 53, 0.1)' }]}>
                        <MaterialCommunityIcons name={iconName} size={24} color={theme.colors.primary} />
                    </View>
                    <View style={styles.textInfo}>
                        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>{productName}</Text>
                        <Text style={[styles.cardSubtitle, { color: theme.colors.textSecondary }]}>{accountNo}</Text>
                    </View>
                </View>

                <View style={styles.rightPart}>
                    <Text style={[styles.balanceText, { color: theme.colors.textPrimary }]}>
                        {formatCurrency(wallet.balance || 0, wallet.currency)}
                    </Text>
                    {wallet.isDefault && (
                        <View style={[styles.defaultBadge, { backgroundColor: theme.colors.primary + '20', borderColor: theme.colors.primary }]}>
                            <MaterialCommunityIcons name="star" size={10} color={theme.colors.primary} />
                            <Text style={[styles.defaultText, { color: theme.colors.primary }]}>Default</Text>
                        </View>
                    )}
                    {isActive ? (
                        <View style={[styles.statusBadge, { backgroundColor: 'rgba(46, 189, 133, 0.1)' }]}>
                            <Text style={[styles.statusText, { color: '#2ebd85' }]}>Active</Text>
                        </View>
                    ) : (
                        <View style={[styles.statusBadge, { backgroundColor: 'rgba(246, 70, 93, 0.1)' }]}>
                            <Text style={[styles.statusText, { color: '#f6465d' }]}>Locked</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 18,
        padding: 18,
        marginVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(30, 61, 48, 0.15)',
    },
    content: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    leftPart: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    textInfo: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    cardSubtitle: {
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
    rightPart: {
        alignItems: 'flex-end',
    },
    balanceText: {
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    defaultBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 0.5,
        marginBottom: 4,
        gap: 2,
    },
    defaultText: {
        fontSize: 10,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
    },
});

export default WalletCard;
