import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Wallet } from '../types/auth.types';

interface WalletCardProps {
    wallet: Wallet;
}

const formatCurrency = (amount: number, currency: string = 'VND'): string => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
    }).format(amount);
};

const getWalletIcon = (type: string): string => {
    switch (type) {
        case 'credit_wallet':
            return '💳';
        case 'e_wallet':
            return '📱';
        default:
            return '👛';
    }
};

const getWalletLabel = (type: string): string => {
    switch (type) {
        case 'credit_wallet':
            return 'Ví tín dụng';
        case 'e_wallet':
            return 'Ví điện tử';
        default:
            return 'Ví';
    }
};

export const WalletCard: React.FC<WalletCardProps> = ({ wallet }) => {
    const isActive = wallet.status === 'active';

    return (
        <View style={[styles.container, !isActive && styles.containerLocked]}>
            <View style={styles.header}>
                <Text style={styles.icon}>{getWalletIcon(wallet.type)}</Text>
                <View style={styles.headerInfo}>
                    <Text style={styles.walletType}>{getWalletLabel(wallet.type)}</Text>
                    <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusLocked]}>
                        <Text style={styles.statusText}>{isActive ? 'Hoạt động' : 'Đã khóa'}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.balanceContainer}>
                <Text style={styles.balanceLabel}>Số dư</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(wallet.balance, wallet.currency)}</Text>
            </View>

            <View style={styles.details}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mã tài khoản</Text>
                    <Text style={styles.detailValue}>{wallet.metadata?.accountNo || wallet.fineractSavingsId}</Text>
                </View>
                {wallet.metadata?.productName && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Sản phẩm</Text>
                        <Text style={styles.detailValue}>{wallet.metadata.productName}</Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1e2746',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    containerLocked: {
        borderColor: '#6b7280',
        opacity: 0.7,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    icon: {
        fontSize: 32,
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
        fontWeight: '600',
        color: '#fff',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusActive: {
        backgroundColor: '#10b981',
    },
    statusLocked: {
        backgroundColor: '#6b7280',
    },
    statusText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    balanceContainer: {
        marginBottom: 16,
    },
    balanceLabel: {
        fontSize: 12,
        color: '#9ca3af',
        marginBottom: 4,
    },
    balanceAmount: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#10b981',
    },
    details: {
        borderTopWidth: 1,
        borderTopColor: '#374151',
        paddingTop: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 13,
        color: '#9ca3af',
    },
    detailValue: {
        fontSize: 13,
        color: '#fff',
        fontWeight: '500',
    },
});

export default WalletCard;
