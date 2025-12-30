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
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { walletApi } from '../../services';
import type { WalletTransaction } from '../../services/wallet/wallet.api';
import { GradientBackground, GlassCard, GlassTokens, PageHeader } from '../../components/glass';

// Transaction type configurations
const TRANSACTION_TYPES: Record<string, { icon: string; color: string; label: string }> = {
    deposit: { icon: 'arrow-down-bold', color: GlassTokens.colors.success, label: 'Nạp tiền' },
    withdrawal: { icon: 'arrow-up-bold', color: GlassTokens.colors.error, label: 'Rút tiền' },
    payment: { icon: 'cash-minus', color: GlassTokens.colors.warning, label: 'Thanh toán' },
    receipt: { icon: 'cash-plus', color: GlassTokens.colors.success, label: 'Thu tiền' },
    transfer_out: { icon: 'bank-transfer-out', color: GlassTokens.colors.error, label: 'Chuyển đi' },
    transfer_in: { icon: 'bank-transfer-in', color: GlassTokens.colors.success, label: 'Nhận tiền' },
    repayment: { icon: 'hand-coin', color: GlassTokens.colors.primary, label: 'Trả nợ' },
    investment: { icon: 'chart-line', color: GlassTokens.colors.info, label: 'Đầu tư' },
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
    const [walletNotLinked, setWalletNotLinked] = useState(false);
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
            setWalletNotLinked(false); // Clear error if successful
        } catch (error: any) {
            console.error('Error loading transactions:', error);
            // Check if wallet is not linked
            if (error.message && error.message.includes('Wallet not linked')) {
                setWalletNotLinked(true);
            }
            // Silent fail - transactions might not be available yet
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
    }, [loadTransactions]);

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
            <TouchableOpacity activeOpacity={0.7} onPress={() => { }}>
                <GlassCard style={styles.transactionCard} blur={GlassTokens.blur.light}>
                    <View style={styles.transactionRow}>
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
                            <Text style={[styles.amount, { color: isCredit ? GlassTokens.colors.success : GlassTokens.colors.error }]}>
                                {isCredit ? '+' : '-'}{formatCurrency(Math.abs(item.amount))}₫
                            </Text>
                            {item.balance !== undefined && (
                                <Text style={styles.balance}>Số dư: {formatCurrency(item.balance)}₫</Text>
                            )}
                        </View>
                    </View>
                </GlassCard>
            </TouchableOpacity>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
                name={walletNotLinked ? "wallet-plus" : "history"}
                size={64}
                color={GlassTokens.colors.textMuted}
            />
            <Text style={styles.emptyText}>
                {walletNotLinked ? 'Chưa liên kết ví' : 'Chưa có giao dịch'}
            </Text>
            <Text style={styles.emptySubtext}>
                {walletNotLinked
                    ? 'Bạn cần liên kết ví Fineract để xem lịch sử giao dịch'
                    : 'Lịch sử giao dịch của bạn sẽ hiển thị ở đây'
                }
            </Text>
        </View>
    );

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={GlassTokens.colors.primary} />
            </View>
        );
    };

    if (loading) {
        return (
            <GradientBackground>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={GlassTokens.colors.primary} />
                    <Text style={styles.loadingText}>Đang tải giao dịch...</Text>
                </View>
            </GradientBackground>
        );
    }

    return (
        <GradientBackground>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <MaterialCommunityIcons name="arrow-left" size={24} color={GlassTokens.colors.textPrimary} />
                </TouchableOpacity>

                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>Lịch sử giao dịch</Text>
                    <Text style={styles.headerSubtitle}>
                        {transactions.length} giao dịch
                    </Text>
                </View>

                <TouchableOpacity style={styles.filterButton}>
                    <MaterialCommunityIcons name="filter-variant" size={24} color={GlassTokens.colors.textSecondary} />
                </TouchableOpacity>
            </View>

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
                        tintColor={GlassTokens.colors.primary}
                        colors={[GlassTokens.colors.primary]}
                    />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
            />
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: GlassTokens.spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
        color: GlassTokens.colors.textPrimary,
        marginBottom: 2,
        fontFamily: 'Poppins_700Bold',
    },
    headerSubtitle: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    filterButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // List
    listContent: {
        paddingHorizontal: GlassTokens.spacing.md,
        paddingBottom: 100,
    },
    // Transaction Card
    transactionCard: {
        marginBottom: 12,
        padding: 0, // Reset padding as we use wrapper
    },
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: GlassTokens.spacing.md,
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
        color: GlassTokens.colors.textPrimary,
        marginBottom: 2,
        fontFamily: 'Poppins_600SemiBold',
    },
    transactionDate: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 2,
        fontFamily: 'Poppins_400Regular',
    },
    transactionDesc: {
        fontSize: 11,
        color: GlassTokens.colors.textMuted,
        fontStyle: 'italic',
        fontFamily: 'Poppins_400Regular',
    },
    amountContainer: {
        alignItems: 'flex-end',
    },
    amount: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
        fontFamily: 'Poppins_700Bold',
    },
    balance: {
        fontSize: 11,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
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
        color: GlassTokens.colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
        fontFamily: 'Poppins_600SemiBold',
    },
    emptySubtext: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    // Footer
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});
