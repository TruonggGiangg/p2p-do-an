import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    FlatList,
    RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { walletAPI, WalletTransaction } from '../../wallet/api/wallet.api';
import { loanService, AppNotification } from '../../loan/services/loan.service';
import { formatCurrency } from '../../../shared/utils';
import { BinanceHeader, CommonCard, Pagination } from '../../../components';

// Icon & color map for notification types
const NOTIF_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
    loan_approved: { icon: 'check-circle-outline', color: '#10B981', bg: '#10B98115' },
    loan_rejected: { icon: 'close-circle-outline', color: '#EF4444', bg: '#EF444415' },
    loan_disbursed: { icon: 'cash-check', color: '#3B82F6', bg: '#3B82F615' },
    contract_ready: { icon: 'file-document-outline', color: '#F59E0B', bg: '#F59E0B15' },
    contract_signed: { icon: 'file-sign', color: '#8B5CF6', bg: '#8B5CF615' },
    repayment_due: { icon: 'calendar-alert', color: '#F59E0B', bg: '#F59E0B15' },
    overdue_reminder: { icon: 'alert-circle-outline', color: '#EF4444', bg: '#EF444415' },
    repayment_received: { icon: 'cash-plus', color: '#10B981', bg: '#10B98115' },
    general: { icon: 'bell-outline', color: '#6B7280', bg: '#6B728015' },
};

type TabKey = 'transactions' | 'system';

export default function NotificationScreen() {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const c = theme.colors;
    const [activeTab, setActiveTab] = useState<TabKey>('system');

    // ── Wallet Transactions ──
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [txLoading, setTxLoading] = useState(true);
    const [txRefreshing, setTxRefreshing] = useState(false);
    const [txLoadingMore, setTxLoadingMore] = useState(false);
    const [txHasMore, setTxHasMore] = useState(true);
    const txOffsetRef = useRef(0);
    const txLoadingMoreRef = useRef(false);
    const LIMIT = 10;

    // ── App Notifications ──
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [notiLoading, setNotiLoading] = useState(true);
    const [notiRefreshing, setNotiRefreshing] = useState(false);
    const [notiLoadingMore, setNotiLoadingMore] = useState(false);
    const [notiHasMore, setNotiHasMore] = useState(true);
    const notiPageRef = useRef(1);
    const notiLoadingMoreRef = useRef(false);

    // ── Fetch Transactions ──
    const fetchTransactions = useCallback(async (isLoadMore = false) => {
        try {
            const currentOffset = isLoadMore ? txOffsetRef.current : 0;
            const response = await walletAPI.getTransactions(LIMIT, currentOffset);
            const newTxs = response.transactions || [];

            if (isLoadMore) {
                setTransactions(prev => [...prev, ...newTxs]);
            } else {
                setTransactions(newTxs);
            }

            const nextOffset = currentOffset + LIMIT;
            txOffsetRef.current = nextOffset;
            setTxHasMore(newTxs.length === LIMIT);
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
        } finally {
            setTxLoading(false);
            setTxRefreshing(false);
            setTxLoadingMore(false);
            txLoadingMoreRef.current = false;
        }
    }, []);

    // ── Fetch App Notifications ──
    const fetchNotifications = useCallback(async (isLoadMore = false) => {
        try {
            const page = isLoadMore ? notiPageRef.current : 1;
            const res = await loanService.getNotifications(page, 15);
            const items = res.notifications || [];

            if (isLoadMore) {
                setNotifications(prev => [...prev, ...items]);
            } else {
                setNotifications(items);
            }

            notiPageRef.current = page + 1;
            setNotiHasMore(items.length >= 15);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setNotiLoading(false);
            setNotiRefreshing(false);
            setNotiLoadingMore(false);
            notiLoadingMoreRef.current = false;
        }
    }, []);

    useEffect(() => {
        fetchTransactions(false);
        fetchNotifications(false);
    }, [fetchTransactions, fetchNotifications]);

    const onRefreshTx = useCallback(() => {
        setTxRefreshing(true);
        txOffsetRef.current = 0;
        setTxHasMore(true);
        fetchTransactions(false);
    }, [fetchTransactions]);

    const onRefreshNoti = useCallback(() => {
        setNotiRefreshing(true);
        notiPageRef.current = 1;
        setNotiHasMore(true);
        fetchNotifications(false);
        // Also mark all read
        loanService.markAllNotificationsRead().catch(() => { });
    }, [fetchNotifications]);

    const handleLoadMoreTx = useCallback(() => {
        if (txLoadingMoreRef.current || !txHasMore || txLoading || txRefreshing) return;
        if (transactions.length < LIMIT) return;
        txLoadingMoreRef.current = true;
        setTxLoadingMore(true);
        fetchTransactions(true);
    }, [txHasMore, txLoading, txRefreshing, fetchTransactions, transactions.length]);

    const handleLoadMoreNoti = useCallback(() => {
        if (notiLoadingMoreRef.current || !notiHasMore || notiLoading || notiRefreshing) return;
        notiLoadingMoreRef.current = true;
        setNotiLoadingMore(true);
        fetchNotifications(true);
    }, [notiHasMore, notiLoading, notiRefreshing, fetchNotifications]);

    // ── Render Transaction Item ──
    const renderTransactionItem = ({ item }: { item: WalletTransaction }) => {
        const isIncome = item.amount >= 0;
        const date = new Date(item.date);
        const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <TouchableOpacity activeOpacity={0.7} style={styles.notificationWrapper}>
                <CommonCard style={styles.notificationCard}>
                    <View style={styles.notificationInner}>
                        <View style={[styles.iconContainer, { backgroundColor: isIncome ? '#0ECB8115' : '#F6465D15' }]}>
                            <MaterialCommunityIcons
                                name={isIncome ? 'arrow-down' : 'arrow-up'}
                                size={20}
                                color={isIncome ? '#0ECB81' : '#F6465D'}
                            />
                        </View>
                        <View style={styles.contentContainer}>
                            <View style={styles.headerRow}>
                                <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
                                    {item.description || item.type || 'Giao dịch'}
                                </Text>
                                <Text style={[styles.amount, { color: isIncome ? '#0ECB81' : '#F6465D' }]}>
                                    {isIncome ? '+' : ''}{formatCurrency(Math.abs(item.amount))}
                                </Text>
                            </View>
                            <Text style={[styles.description, { color: c.textSecondary }]} numberOfLines={1}>
                                {item.type || 'Ví điện tử'}
                            </Text>
                            <Text style={[styles.time, { color: c.textDim }]}>{timeStr} • {dateStr}</Text>
                        </View>
                    </View>
                </CommonCard>
            </TouchableOpacity>
        );
    };

    // ── Render Notification Item ──
    const renderNotificationItem = ({ item }: { item: AppNotification }) => {
        const cfg = NOTIF_CONFIG[item.type] || NOTIF_CONFIG.general;
        const date = new Date(item.createdAt);
        const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                style={styles.notificationWrapper}
                onPress={() => {
                    if (!item.read) loanService.markNotificationRead(item._id).catch(() => { });
                }}
            >
                <CommonCard style={[
                    styles.notificationCard,
                    !item.read && { borderLeftWidth: 3, borderLeftColor: c.primary }
                ]}>
                    <View style={styles.notificationInner}>
                        <View style={[styles.iconContainer, { backgroundColor: cfg.bg }]}>
                            <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
                        </View>
                        <View style={styles.contentContainer}>
                            <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
                                {item.title}
                            </Text>
                            <Text style={[styles.description, { color: c.textSecondary }]} numberOfLines={2}>
                                {item.message}
                            </Text>
                            <Text style={[styles.time, { color: c.textDim }]}>{timeStr} • {dateStr}</Text>
                        </View>
                    </View>
                </CommonCard>
            </TouchableOpacity>
        );
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const loading = activeTab === 'transactions' ? txLoading : notiLoading;

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Thông báo" mode="standard" />

            {/* Tab Bar */}
            <View style={[styles.tabBar, { borderBottomColor: c.border }]}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'system' && [styles.activeTab, { borderBottomColor: c.primary }]]}
                    onPress={() => setActiveTab('system')}
                >
                    <Text style={[styles.tabText, { color: c.textSecondary }, activeTab === 'system' && { color: c.primary, fontWeight: '700' }]}>
                        Hệ thống
                    </Text>
                    {unreadCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: c.primary }]}>
                            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'transactions' && [styles.activeTab, { borderBottomColor: c.primary }]]}
                    onPress={() => setActiveTab('transactions')}
                >
                    <Text style={[styles.tabText, { color: c.textSecondary }, activeTab === 'transactions' && { color: c.primary, fontWeight: '700' }]}>
                        Giao dịch
                    </Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={c.primary} />
                </View>
            ) : activeTab === 'system' ? (
                <FlatList
                    data={notifications}
                    keyExtractor={(item: AppNotification) => item._id}
                    renderItem={renderNotificationItem}
                    contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
                    onEndReached={handleLoadMoreNoti}
                    onEndReachedThreshold={0.3}
                    refreshControl={
                        <RefreshControl
                            refreshing={notiRefreshing}
                            onRefresh={onRefreshNoti}
                            tintColor={c.primary}
                            colors={[c.primary]}
                        />
                    }
                    ListFooterComponent={
                        <Pagination mode="infinite" loading={notiLoadingMore} hasMore={notiHasMore} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={[styles.emptyIconWrap, { backgroundColor: c.surfaceLight }]}>
                                <MaterialCommunityIcons name="bell-off-outline" size={48} color={c.textDim} />
                            </View>
                            <Text style={[styles.emptyText, { color: c.textPrimary }]}>Không có thông báo mới</Text>
                            <Text style={[styles.emptySubText, { color: c.textDim }]}>Chúng tôi sẽ thông báo cho bạn khi có tin mới.</Text>
                        </View>
                    }
                />
            ) : (
                <FlatList
                    data={transactions}
                    keyExtractor={(item: WalletTransaction) => item.id}
                    renderItem={renderTransactionItem}
                    contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
                    onEndReached={handleLoadMoreTx}
                    onEndReachedThreshold={0.2}
                    refreshControl={
                        <RefreshControl
                            refreshing={txRefreshing}
                            onRefresh={onRefreshTx}
                            tintColor={c.primary}
                            colors={[c.primary]}
                        />
                    }
                    ListFooterComponent={
                        <Pagination mode="infinite" loading={txLoadingMore} hasMore={txHasMore} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={[styles.emptyIconWrap, { backgroundColor: c.surfaceLight }]}>
                                <MaterialCommunityIcons name="swap-horizontal" size={48} color={c.textDim} />
                            </View>
                            <Text style={[styles.emptyText, { color: c.textPrimary }]}>Chưa có giao dịch nào</Text>
                            <Text style={[styles.emptySubText, { color: c.textDim }]}>Thực hiện giao dịch đầu tiên ngay hôm nay.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    headerAction: {
        padding: 4,
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        marginRight: 24,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
    },
    tabText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 6,
        paddingHorizontal: 4,
    },
    badgeText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 100,
    },
    notificationWrapper: {
        marginBottom: 12,
    },
    notificationCard: {
        padding: 12,
    },
    notificationInner: {
        flexDirection: 'row',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    title: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        flex: 1,
        marginRight: 8,
    },
    amount: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    description: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 8,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    time: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 120,
        paddingHorizontal: 40,
    },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
    },
});
