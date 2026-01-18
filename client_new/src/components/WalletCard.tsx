import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

const getWalletIcon = (type: string, productName?: string): string => {
    // Check product name first for more accuracy
    const pn = (productName || '').toLowerCase();
    if (pn.includes('trả sau') || pn.includes('credit')) return '💳';
    if (pn.includes('điện tử') || pn.includes('vdt')) return '📱';

    switch (type) {
        case 'credit_wallet':
            return '💳';
        case 'e_wallet':
            return '📱';
        default:
            return '👛';
    }
};

const getWalletLabel = (type: string, productName?: string): string => {
    // Use product name from Fineract if available
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
    // Status from Fineract API can be 'Active', 'Inactive', or 'active', 'locked'
    const isActive = wallet.status?.toLowerCase() === 'active';
    const productName = wallet.productName || wallet.metadata?.productName || '';
    const accountNo = wallet.accountNo || wallet.metadata?.accountNo || wallet.fineractSavingsId;

    return (
        <View style={[styles.container, !isActive && styles.containerLocked]}>
            <View style={styles.header}>
                <Text style={styles.icon}>{getWalletIcon(wallet.type, productName)}</Text>
                <View style={styles.headerInfo}>
                    <Text style={styles.walletType}>{getWalletLabel(wallet.type, productName)}</Text>
                    <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusLocked]}>
                        <Text style={styles.statusText}>{isActive ? 'Hoạt động' : wallet.status || 'Đã khóa'}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.balanceContainer}>
                <Text style={styles.balanceLabel}>Số dư</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(wallet.balance || 0, wallet.currency)}</Text>
            </View>

            <View style={styles.details}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mã tài khoản</Text>
                    <Text style={styles.detailValue}>{accountNo}</Text>
                </View>
                {wallet.shortProductName && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Mã sản phẩm</Text>
                        <Text style={styles.detailValue}>{wallet.shortProductName}</Text>
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
