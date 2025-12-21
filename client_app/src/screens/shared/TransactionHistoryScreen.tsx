/**
 * TransactionHistoryScreen - Display transaction history for both lenders and borrowers
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    TouchableOpacity,
    StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { walletApi } from '../../services';
import type { WalletTransaction } from '../../services/wallet/wallet.api';
import { DarkColors, DarkStyling } from '../../theme';

// Transaction type configurations
const TRANSACTION_TYPES: Record<string, { icon: string; color: string; label: string }> = {
    deposit: { icon: 'arrow-down-bold', color: DarkColors.success, label: 'Nạp tiền' },
    withdrawal: { icon: 'arrow-up-bold', color: DarkColors.error, label: 'Rút tiền' },
    payment: { icon: 'cash-minus', color: DarkColors.warning, label: 'Thanh toán' },
    receipt: { icon: 'cash-plus', color: DarkColors.success, label: 'Thu tiền' },
    transfer_out: { icon: 'bank-transfer-out', color: DarkColors.error, label: 'Chuyển đi' },
    transfer_in: { icon: 'bank-transfer-in', color: DarkColors.success, label: 'Nhận tiền' },
    repayment: { icon: 'hand-coin', color: DarkColors.primary, label: 'Trả nợ' },
    investment: { icon: 'chart-line', color: DarkColors.secondary, label: 'Đầu tư' },
};

// Format currency
const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('vi-VN').format(value);
};

// Format date
const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `Hôm nay, ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `Hôm qua, ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
        return `${diffDays} ngày trước`;
    } else {
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
};

export default function TransactionHistoryScreen() {
    const navigation = useNavigation();
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 20;

    const loadTransactions = useCallback(async (pageNum: number = 0, refresh: boolean = false) => {
        try {
            if (refresh) {
                setRefreshing(true);
            } else if (pageNum > 0) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const response = await walletApi.getTransactions(PAGE_SIZE, pageNum * PAGE_SIZE);

            if (refresh || pageNum === 0) {
                setTransactions(response.transactions);
            } else {
                setTransactions(prev => [...prev, ...response.transactions]);
            }

            setHasMore(response.transactions.length === PAGE_SIZE);
            setPage(pageNum);
        } catch (error: any) {
            console.error('Error loading transactions:', error);
            // Silent fail for now - transactions might not be available yet
            if (pageNum === 0) {
                setTransactions([]);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        loadTransactions(0);
    }, []);

    const handleRefresh = () => {
        loadTransactions(0, true);
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            loadTransactions(page + 1);
        }
    };

    const getTransactionConfig = (type: string) => {
        return TRANSACTION_TYPES[type] || TRANSACTION_TYPES.transfer_in;
    };

    const renderTransaction = ({ item }: { item: WalletTransaction }) => {
        const config = getTransactionConfig(item.type);
        const isCredit = ['deposit', 'receipt', 'transfer_in', 'repayment'].includes(item.type);

        return (
            <TouchableOpacity style={styles.transactionCard} activeOpacity={0.7}>
                <View style={[styles.iconContainer, { backgroundColor: `${config.color}20` }]}>
                    <MaterialCommunityIcons name={config.icon} size={24} color={config.color} />
                </View>

                <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>{config.label}</Text>
                    <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
                    {item.description && (
                        <Text style={styles.transactionDesc} numberOfLines={1}>
                            {item.description}
                        </Text>
                    )}
                </View>

                <View style={styles.amountContainer}>
                    <Text style={[styles.amount, { color: isCredit ? DarkColors.success : DarkColors.error }]}>
                        {isCredit ? '+' : '-'}{formatCurrency(Math.abs(item.amount))}₫
                    </Text>
                    {item.balance !== undefined && (
                        <Text style={styles.balance}>Số dư: {formatCurrency(item.balance)}₫</Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="history" size={64} color={DarkColors.textMuted} />
            <Text style={styles.emptyText}>Chưa có giao dịch</Text>
            <Text style={styles.emptySubtext}>
                Lịch sử giao dịch của bạn sẽ hiển thị ở đây
            </Text>
        </View>
    );

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={DarkColors.primary} />
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DarkColors.primary} />
                <Text style={styles.loadingText}>Đang tải giao dịch...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />

            {/* Header */}
            <LinearGradient
                colors={['#1a1a2e', '#16213e'] as const}
                style={styles.header}
            >
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <MaterialCommunityIcons name="arrow-left" size={24} color={DarkColors.text} />
                </TouchableOpacity>

                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>Lịch sử giao dịch</Text>
                    <Text style={styles.headerSubtitle}>
                        {transactions.length} giao dịch
                    </Text>
                </View>

                <TouchableOpacity style={styles.filterButton}>
                    <MaterialCommunityIcons name="filter-variant" size={24} color={DarkColors.textSecondary} />
                </TouchableOpacity>
            </LinearGradient>

            {/* Transaction List */}
            <FlatList
                data={transactions}
                renderItem={renderTransaction}
                keyExtractor={(item, index) => `${item.id || index}`}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={renderEmpty}
                ListFooterComponent={renderFooter}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={DarkColors.primary}
                        colors={[DarkColors.primary]}
                    />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: DarkColors.background,
    },
    loadingText: {
        marginTop: 12,
        color: DarkColors.textSecondary,
        fontSize: 14,
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: DarkColors.border,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: DarkColors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerContent: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: DarkColors.text,
        marginBottom: 2,
    },
    headerSubtitle: {
        fontSize: 12,
        color: DarkColors.textSecondary,
    },
    filterButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: DarkColors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // List
    listContent: {
        padding: 16,
        paddingBottom: 100,
    },
    // Transaction Card
    transactionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.md,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    transactionInfo: {
        flex: 1,
    },
    transactionType: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 2,
    },
    transactionDate: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginBottom: 2,
    },
    transactionDesc: {
        fontSize: 11,
        color: DarkColors.textMuted,
        fontStyle: 'italic',
    },
    amountContainer: {
        alignItems: 'flex-end',
    },
    amount: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    balance: {
        fontSize: 11,
        color: DarkColors.textSecondary,
    },
    // Empty State
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: DarkColors.text,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        textAlign: 'center',
    },
    // Footer
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});
