import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { walletAPI, WalletTransaction } from '../../wallet/api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import { BinanceHeader, CommonCard, FintechPullToRefresh } from '../../../components';

export default function NotificationScreen() {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const LIMIT = 10;
    const loadingMoreRef = useRef(false);
    const offsetRef = useRef(0);

    const fetchTransactions = useCallback(async (isLoadMore = false) => {
        try {
            const currentOffset = isLoadMore ? offsetRef.current : 0;
            const response = await walletAPI.getTransactions(LIMIT, currentOffset);
            const newTxs = response.transactions || [];

            if (isLoadMore) {
                setTransactions(prev => [...prev, ...newTxs]);
            } else {
                setTransactions(newTxs);
            }

            const nextOffset = currentOffset + LIMIT;
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
            setHasMore(newTxs.length === LIMIT);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
            loadingMoreRef.current = false;
        }
    }, []);

    useEffect(() => {
        fetchTransactions(false);
    }, [fetchTransactions]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        offsetRef.current = 0;
        setOffset(0);
        setHasMore(true);
        fetchTransactions(false);
    }, [fetchTransactions]);

    const handleLoadMore = useCallback(() => {
        if (loadingMoreRef.current || !hasMore || loading || refreshing) return;
        if (transactions.length < LIMIT) return; // Tránh gọi khi list ngắn chưa đủ 1 trang
        loadingMoreRef.current = true;
        setLoadingMore(true);
        fetchTransactions(true);
    }, [hasMore, loading, refreshing, fetchTransactions, transactions.length]);

    const renderNotificationItem = ({ item }: { item: WalletTransaction }) => {
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
                                name={isIncome ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                                size={22}
                                color={isIncome ? '#0ECB81' : '#F6465D'}
                            />
                        </View>
                        <View style={styles.contentContainer}>
                            <View style={styles.headerRow}>
                                <Text
                                    style={[styles.title, { color: theme.colors.textPrimary }]}
                                    numberOfLines={1}
                                >
                                    {item.description || item.type || 'Giao dịch'}
                                </Text>
                                <Text style={[styles.amount, { color: isIncome ? '#0ECB81' : '#F6465D' }]}>
                                    {isIncome ? '+' : ''}{formatCurrency(Math.abs(item.amount))}
                                </Text>
                            </View>
                            <Text
                                style={[styles.description, { color: theme.colors.textSecondary }]}
                                numberOfLines={1}
                            >
                                {timeStr} • {dateStr}
                            </Text>
                        </View>
                    </View>
                </CommonCard>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader title="Thông báo" mode="standard" />

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FintechPullToRefresh
                    onRefresh={onRefresh}
                    refreshing={refreshing}
                    renderScrollComponent={(props: any) => (
                        <Animated.FlatList
                            {...props}
                            data={transactions}
                            keyExtractor={(item: WalletTransaction) => item.id}
                            renderItem={renderNotificationItem}
                            contentContainerStyle={styles.listContent}
                            onEndReached={handleLoadMore}
                            onEndReachedThreshold={0.2}
                            ListFooterComponent={
                                <View style={{ padding: 16 }}>
                                    {loadingMore && <ActivityIndicator color={theme.colors.primary} />}
                                </View>
                            }
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <MaterialCommunityIcons name="bell-off-outline" size={64} color={theme.colors.textDim} />
                                    <Text style={[styles.emptyText, { color: theme.colors.textDim }]}>Không có thông báo nào</Text>
                                </View>
                            }
                        />
                    )}
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
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    tab: {
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
    activeTabText: {
        fontFamily: 'Poppins_600SemiBold',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 20,
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
        marginTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
});
