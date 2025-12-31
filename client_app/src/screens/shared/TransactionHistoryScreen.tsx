/**
 * TransactionHistoryScreen - Fintech Style (Updated to match Loan/Wallet UI)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    TouchableOpacity,
    StatusBar,
    Animated,
    Dimensions,
    Platform,
    Modal,
    TouchableWithoutFeedback,
    ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { walletApi } from '../../services';
import { WalletTransaction } from '../../services/wallet/wallet.api';
import { GradientBackground, GlassCard, GlassTokens } from '../../components/glass';
import { PageHeader, ListSkeleton } from '../../components/common';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Transaction type configurations with Fintech Colors
const TRANSACTION_TYPES: Record<string, { icon: string; color: string; bg: string; label: string }> = {
    deposit: { icon: 'arrow-down-bold', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Nạp tiền' },
    withdrawal: { icon: 'arrow-up-bold', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Rút tiền' },
    payment: { icon: 'cash-minus', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', label: 'Thanh toán' },
    receipt: { icon: 'cash-plus', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Thu tiền' },
    transfer_out: { icon: 'bank-transfer-out', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Chuyển đi' },
    transfer_in: { icon: 'bank-transfer-in', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)', label: 'Nhận tiền' },
    repayment: { icon: 'hand-coin', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)', label: 'Trả nợ' },
    investment: { icon: 'chart-line', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)', label: 'Đầu tư' },
};

const formatCurrency = (value: number): string => new Intl.NumberFormat('vi-VN').format(Math.abs(value));

const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function TransactionHistoryScreen() {
    const navigation = useNavigation();
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const [walletNotLinked, setWalletNotLinked] = useState(false);
    const [transferDetail, setTransferDetail] = useState<any>(null);
    const PAGE_SIZE = 20;

    const fadeAnim = useRef(new Animated.Value(0)).current;

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

            setTransactions(prev => {
                const updated = pageNum === 0 ? response.transactions : [...prev, ...response.transactions];
                setHasMore(updated.length < response.total);
                return updated;
            });

            if (pageNum === 0) {
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }).start();
            }

            setPage(pageNum);
            setWalletNotLinked(false);
        } catch (error: any) {
            console.error('Error loading transactions:', error);
            if (error.message && error.message.includes('Wallet not linked')) {
                setWalletNotLinked(true);
            }
            if (pageNum === 0) setTransactions([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [fadeAnim]); // Keep fadeAnim, but setTransactions handles prev state

    useEffect(() => {
        loadTransactions(0);
    }, [loadTransactions]);

    // Fetch transfer details when a transaction is selected
    useEffect(() => {
        if (selectedTransaction?.transferId) {
            setTransferDetail(null);
            walletApi.getTransferDetails(selectedTransaction.transferId)
                .then(data => setTransferDetail(data))
                .catch(err => console.error('Fetch transfer detail error:', err));
        } else {
            setTransferDetail(null);
        }
    }, [selectedTransaction]);

    const handleRefresh = () => {
        loadTransactions(0, true);
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            loadTransactions(page + 1);
        }
    };

    const getTransactionConfig = (type: string) => {
        return TRANSACTION_TYPES[type] || { icon: 'circle-small', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)', label: type };
    };

    const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

    const renderTransaction = ({ item, index }: { item: WalletTransaction; index: number }) => {
        const config = getTransactionConfig(item.type);
        const isCredit = ['deposit', 'receipt', 'transfer_in', 'repayment'].includes(item.type);
        const sign = isCredit ? '+' : '-';
        const color = isCredit ? '#10B981' : '#EF4444';

        return (
            <AnimatedTouchableOpacity
                activeOpacity={0.7}
                onPress={() => setSelectedTransaction(item)}
                style={{
                    opacity: fadeAnim,
                    transform: [{
                        translateY: fadeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20 * ((index % 10) + 1), 0]
                        })
                    }],
                }}
            >
                <View style={styles.itemContainer}>
                    {/* Left: Icon */}
                    <View style={[styles.iconContainer, { backgroundColor: `${config.color}15` }]}>
                        <MaterialCommunityIcons name={config.icon} size={18} color={config.color} />
                    </View>

                    {/* Middle: Info */}
                    <View style={styles.contentContainer}>
                        <Text style={styles.typeText}>{config.label}</Text>
                        <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                        {item.description ? (
                            <Text style={styles.descText} numberOfLines={1}>
                                {item.description}
                            </Text>
                        ) : null}
                    </View>

                    {/* Right: Amount & Balance */}
                    <View style={styles.rightContainer}>
                        <Text style={[styles.amountText, { color: color }]}>
                            {sign}{formatCurrency(item.amount)}
                        </Text>
                        {item.balance !== undefined && (
                            <Text style={styles.balanceText}>
                                {formatCurrency(item.balance)}₫
                            </Text>
                        )}
                    </View>
                </View>
            </AnimatedTouchableOpacity>
        );
    };

    const renderSeparator = () => <View style={styles.separator} />;

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
                name={walletNotLinked ? "wallet-plus" : "file-search-outline"}
                size={64}
                color="rgba(255,255,255,0.2)"
            />
            <Text style={styles.emptyText}>
                {walletNotLinked ? 'Chưa liên kết ví' : 'Chưa có giao dịch nào'}
            </Text>
        </View>
    );

    const renderFooter = () => {
        if (!loadingMore) return <View style={{ height: 40 }} />;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={GlassTokens.colors.primary} />
            </View>
        );
    };

    const renderDetailModal = () => {
        if (!selectedTransaction) return null;

        const config = getTransactionConfig(selectedTransaction.type);
        const isCredit = ['deposit', 'receipt', 'transfer_in', 'repayment'].includes(selectedTransaction.type);
        const sign = isCredit ? '+' : '-';
        const color = isCredit ? '#10B981' : '#EF4444';

        return (
            <Modal
                transparent={true}
                visible={!!selectedTransaction}
                animationType="fade"
                onRequestClose={() => setSelectedTransaction(null)}
            >
                <TouchableWithoutFeedback onPress={() => setSelectedTransaction(null)}>
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalContentWrapper}>
                            <View style={styles.modalCard}>
                                <View>
                                    {/* Header Icon */}
                                    <View style={styles.modalHeader}>
                                        <View style={[styles.bigIconContainer, { backgroundColor: `${config.color}20` }]}>
                                            <MaterialCommunityIcons name={config.icon} size={40} color={config.color} />
                                        </View>
                                        <Text style={[styles.modalAmount, { color: color }]}>
                                            {sign}{formatCurrency(selectedTransaction.amount)}₫
                                        </Text>
                                        <Text style={styles.modalTypeLabel}>{config.label}</Text>
                                    </View>

                                    {/* Divider */}
                                    <View style={styles.modalDivider} />

                                    {/* Details */}
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Thời gian</Text>
                                        <Text style={styles.detailValue}>{formatDate(selectedTransaction.date)}</Text>
                                    </View>

                                    {selectedTransaction.id && (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Mã giao dịch</Text>
                                            <Text style={styles.detailValue}>{selectedTransaction.id}</Text>
                                        </View>
                                    )}

                                    {selectedTransaction.balance !== undefined && (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Số dư sau GD</Text>
                                            <Text style={styles.detailValue}>{formatCurrency(selectedTransaction.balance)}₫</Text>
                                        </View>
                                    )}

                                    {/* Transfer Details */}
                                    {transferDetail && (
                                        <>
                                            <View style={[styles.modalDivider, { marginTop: 10, marginBottom: 10 }]} />

                                            {transferDetail.fromClient && (
                                                <View style={styles.detailRow}>
                                                    <Text style={styles.detailLabel}>Người gửi</Text>
                                                    <Text style={styles.detailValue}>{transferDetail.fromClient.displayName}</Text>
                                                </View>
                                            )}
                                            {transferDetail.fromAccount && (
                                                <View style={styles.detailRow}>
                                                    <Text style={styles.detailLabel}>TK Gửi</Text>
                                                    <Text style={styles.detailValue}>{transferDetail.fromAccount.accountNo}</Text>
                                                </View>
                                            )}

                                            {transferDetail.toClient && (
                                                <View style={styles.detailRow}>
                                                    <Text style={styles.detailLabel}>Người nhận</Text>
                                                    <Text style={styles.detailValue}>{transferDetail.toClient.displayName}</Text>
                                                </View>
                                            )}
                                            {transferDetail.toAccount && (
                                                <View style={styles.detailRow}>
                                                    <Text style={styles.detailLabel}>TK Nhận</Text>
                                                    <Text style={styles.detailValue}>{transferDetail.toAccount.accountNo}</Text>
                                                </View>
                                            )}
                                            <View style={[styles.modalDivider, { marginTop: 10, marginBottom: 10 }]} />
                                        </>
                                    )}

                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Nội dung</Text>
                                        <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' }]}>
                                            {selectedTransaction.description || 'Không có nội dung'}
                                        </Text>
                                    </View>

                                    {/* Close Button */}
                                    <TouchableOpacity
                                        style={styles.closeButton}
                                        onPress={() => setSelectedTransaction(null)}
                                    >
                                        <Text style={styles.closeButtonText}>Đóng</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        );
    };

    return (
        <GradientBackground>
            <StatusBar barStyle="light-content" />

            <View style={styles.safeArea}>
                {/* Header */}
                <View style={styles.headerContainer}>
                    <PageHeader
                        title="Lịch sử giao dịch"
                        showBack={true}
                        onBack={() => navigation.goBack()}
                    />
                </View>

                {/* Body Section */}
                <View style={styles.listSection}>
                    {loading && !refreshing ? (
                        <View style={{ padding: 20 }}>
                            <ListSkeleton count={8} />
                        </View>
                    ) : (
                        <FlatList
                            data={transactions}
                            renderItem={renderTransaction}
                            ItemSeparatorComponent={renderSeparator}
                            keyExtractor={(item, index) => `${item.id || index}`}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={renderEmpty}
                            ListFooterComponent={renderFooter}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={handleRefresh}
                                    tintColor="#3B82F6"
                                />
                            }
                            onEndReached={handleLoadMore}
                            onEndReachedThreshold={0.5}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </View>
            </View>
            {renderDetailModal()}
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 10 : 0,
    },
    headerContainer: {
        paddingBottom: 10,
    },

    // List Section (Rounded Top)
    listSection: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)', // Slightly darker for better contrast
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    },
    listContent: {
        paddingTop: 10,
        paddingBottom: 40,
    },
    loadingCenter: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Item Layout
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 14,
        paddingHorizontal: 20,
    },

    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
        marginTop: 2,
    },

    contentContainer: {
        flex: 1,
        marginRight: 8,
        justifyContent: 'center',
    },
    typeText: {
        fontSize: 17,
        fontWeight: '600',
        color: 'white',
        marginBottom: 2,
    },
    dateText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 3,
    },
    descText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        fontStyle: 'italic',
        lineHeight: 18,
    },

    rightContainer: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    amountText: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 2,
    },
    balanceText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        fontWeight: '500',
    },

    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginLeft: 78,
        marginRight: 20,
    },

    // Empty State
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
        gap: 16,
    },
    emptyText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.5)',
    },

    // Footer
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center',
    },

    // Modal Styles
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContentWrapper: {
        width: '85%',
        maxWidth: 340,
    },
    modalCard: {
        borderRadius: 24,
        backgroundColor: '#1E1E24',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    modalScrollContent: {
        padding: 0,
    },
    modalHeader: {
        alignItems: 'center',
        marginBottom: 16,
    },
    bigIconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalAmount: {
        fontSize: 26,
        fontWeight: '700',
        marginBottom: 2,
        textAlign: 'center',
        color: 'white',
        letterSpacing: -0.5,
    },
    modalTypeLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
    modalDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 16,
        marginHorizontal: 10,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        alignItems: 'flex-start',
    },
    detailLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        width: 100,
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        flex: 1,
        textAlign: 'right',
    },
    closeButton: {
        marginTop: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
});