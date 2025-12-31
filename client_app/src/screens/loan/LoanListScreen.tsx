import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Dimensions,
    Animated,
    StatusBar,
    ScrollView,
    Platform
} from 'react-native';
import { Text, Avatar, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { GradientBackground, GlassCard, GlassTokens, SectionTitle } from '../../components/glass';
import { QuickAction } from '../../components/glass/QuickAction';
import { SkeletonLoader, ListSkeleton } from '../../components/common';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');


// Format number
const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatCurrency = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return formatNumber(Math.floor(num));
};

const getStatusColor = (status: LoanStatus) => {
    switch (status) {
        case 'approved': return '#10B981';
        case 'success': return '#10B981';
        case 'done': return '#10B981';
        case 'clean': return '#10B981';
        case 'waiting': return '#F59E0B';
        case 'pending': return '#F59E0B';
        case 'active': return '#3B82F6';
        case 'on_going': return '#3B82F6';
        case 'disbursed': return '#3B82F6';
        case 'overdue': return '#EF4444';
        case 'fail': return '#EF4444';
        case 'rejected': return '#EF4444';
        default: return '#9CA3AF';
    }
};

const getStatusLabel = (status: LoanStatus) => {
    const labels: Record<string, string> = {
        waiting: 'Đang gọi vốn',
        pending: 'Chờ duyệt',
        approved: 'Đã duyệt',
        success: 'Đã giải ngân',
        active: 'Đang hoạt động',
        on_going: 'Đang hoạt động',
        disbursed: 'Đã giải ngân',
        done: 'Đã tất toán',
        closed: 'Đã đóng',
        overdue: 'Quá hạn',
        fail: 'Thất bại',
        rejected: 'Từ chối',
        withdrawn: 'Đã hủy',
    };
    return labels[status] || status;
};

// Filter Types
type FilterType = 'all' | 'active' | 'pending' | 'completed';
const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'active', label: 'Đang vay' },
    { id: 'pending', label: 'Chờ duyệt' },
    { id: 'completed', label: 'Lịch sử' },
];

interface Props {
    navigation: any;
}

const mapFilterToStatus = (filter: FilterType) => {
    switch (filter) {
        case 'active': return 'active,disbursed,on_going,overdue';
        case 'pending': return 'pending,waiting,approved';
        case 'completed': return 'done,clean,closed,rejected,fail';
        default: return undefined;
    }
};

export default function LoanListScreen({ navigation }: Props) {
    const { user } = useAuth();
    const [loans, setLoans] = useState<LoanContract[]>([]);
    const [walletBalance, setWalletBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [showBalance, setShowBalance] = useState(true); // Toggle balance visibility

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 20;

    const fadeAnim = useRef(new Animated.Value(0)).current;

    const fetchLoans = useCallback(async (pageNum: number, filter: FilterType, isRefresh = false) => {
        try {
            if (pageNum === 1 && !isRefresh) {
                setLoading(true);
                // We keep current loans present during loading for a smoother transition,
                // ListEmptyComponent will still handle the absolute first load.
                // If we want the skeleton to appear even when we have old data, 
                // we should only clear if we are switching filters.
                setLoans([]);
            }
            if (pageNum > 1) setLoadingMore(true);

            // Parallel fetch for first page: Loans + Wallet
            const promises: Promise<any>[] = [
                loanApi.getMyLoans(pageNum, PAGE_SIZE, mapFilterToStatus(filter))
            ];

            if (pageNum === 1) {
                promises.push(loanApi.getWalletBalance());
            }

            const results = await Promise.all(promises);
            const loanResult = results[0];

            if (pageNum === 1 && results[1]) {
                setWalletBalance(results[1].availableBalance || 0);
            }

            const receivedCount = loanResult.data.length;
            setHasMore(receivedCount >= PAGE_SIZE);

            if (pageNum === 1) {
                // Reset fade animation before updating data to avoid jump
                fadeAnim.setValue(0);
                setLoans(loanResult.data);

                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400, // Slightly faster for responsiveness
                    useNativeDriver: true,
                }).start();
            } else {
                setLoans(prev => {
                    const existingIds = new Set(prev.map(l => l.contractId));
                    const newLoans = loanResult.data.filter((l: LoanContract) => !existingIds.has(l.contractId));
                    return [...prev, ...newLoans];
                });
            }

            setTotalPages(loanResult.totalPages);
            setPage(pageNum);

        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [fadeAnim]);

    useFocusEffect(
        useCallback(() => {
            fetchLoans(1, activeFilter);
        }, [fetchLoans, activeFilter])
    );

    const handleRefresh = () => {
        setRefreshing(true);
        setHasMore(true);
        fetchLoans(1, activeFilter, true);
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMore && page < totalPages) {
            fetchLoans(page + 1, activeFilter);
        }
    };

    const handleFilterChange = (filter: FilterType) => {
        if (activeFilter === filter) return;
        setActiveFilter(filter);
        setPage(1);
        // Removed fetchLoans(1, filter) here because useFocusEffect will handle it
    };

    const renderLoanItem = ({ item, index }: { item: LoanContract; index: number }) => {
        const statusColor = getStatusColor(item.status);
        const amount = formatCurrency(item.info.capital);
        const date = new Date(item.createdAt || Date.now()).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        const rate = item.info.rate || 0;
        const progress = item.totalNotes && item.totalNotes > 0 ? (item.investedNotes || 0) / item.totalNotes : 0;
        const progressPercent = Math.round(progress * 100);

        return (
            <Animated.View
                style={{
                    opacity: fadeAnim,
                    transform: [{
                        translateY: fadeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20 * ((index % 10) + 1), 0]
                        })
                    }],
                    marginBottom: 8
                }}
            >
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('LoanDetail', { loanId: item.contractId })}
                >
                    <GlassCard blur={GlassTokens.blur.light} style={styles.cardContainer}>
                        {/* Header: Status & Date */}
                        <View style={styles.cardHeader}>
                            <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: `${statusColor}15` }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                                <Text style={[styles.statusText, { color: statusColor }]}>{getStatusLabel(item.status)}</Text>
                            </View>
                            <Text style={styles.dateText}>{date}</Text>
                        </View>

                        {/* Main: Title & Amount */}
                        <View style={styles.cardMain}>
                            <Text style={styles.loanTitle}>{item.info.willing}</Text>
                            <Text style={styles.amountText}>{amount}<Text style={styles.currencyText}>₫</Text></Text>
                        </View>

                        {/* Footer: Specs */}
                        <View style={styles.specsGrid}>
                            <View style={styles.specItem}>
                                <Text style={styles.specLabel}>Kỳ hạn</Text>
                                <Text style={styles.specValue}>{item.info.periodMonth} th</Text>
                            </View>
                            <View style={styles.specSeparator} />
                            <View style={styles.specItem}>
                                <Text style={styles.specLabel}>Lãi suất</Text>
                                <Text style={styles.specValue}>{rate}%</Text>
                            </View>
                            <View style={styles.specSeparator} />
                            <View style={styles.specItem}>
                                <Text style={styles.specLabel}>Thanh toán</Text>
                                <Text style={styles.specValue}>{formatCurrency(item.info.monthlyPay)}₫</Text>
                            </View>
                        </View>

                        {/* Optional Progress */}
                        {item.status === 'waiting' && (
                            <View style={styles.progressSection}>
                                <View style={styles.progressTrack}>
                                    <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: statusColor }]} />
                                </View>
                            </View>
                        )}
                    </GlassCard>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderFooter = () => {
        if (loadingMore) {
            return (
                <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={GlassTokens.colors.primary} />
                </View>
            );
        }
        return <View style={{ height: 100 }} />; // Bottom padding
    };

    return (
        <GradientBackground>
            <StatusBar barStyle="light-content" />
            <View style={styles.safeArea}>

                {/* --- MODERN WALLET HEADER --- */}
                <View style={styles.walletHeader}>
                    {/* User Profile Tiny Row */}
                    <View style={styles.userRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Avatar.Image size={28} source={{ uri: 'https://i.pravatar.cc/150' }} />
                            <Text style={styles.userName}>Xin chào, {user?.name || 'User'}</Text>
                        </View>
                        <TouchableOpacity style={styles.notiBtn}>
                            <MaterialCommunityIcons name="bell-outline" size={20} color="rgba(255,255,255,0.7)" />
                            <View style={styles.notiDot} />
                        </TouchableOpacity>
                    </View>

                    {/* Balance Display */}
                    <View style={styles.balanceContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Text style={styles.balanceLabel}>Tổng tài sản</Text>
                            <TouchableOpacity onPress={() => setShowBalance(!showBalance)}>
                                <MaterialCommunityIcons
                                    name={showBalance ? "eye-outline" : "eye-off-outline"}
                                    size={16}
                                    color="rgba(255,255,255,0.5)"
                                />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                            <Text style={styles.balanceValue}>
                                {showBalance ? formatCurrency(walletBalance) : '••••••••'}
                            </Text>
                            <Text style={styles.balanceCurrency}>₫</Text>
                        </View>
                    </View>

                    {/* Quick Actions Component */}
                    <View style={styles.actionsRow}>
                        <QuickAction
                            icon="plus"
                            label="Vay ngay"
                            onPress={() => navigation.navigate('LoanCreate')}
                            colors={['#3B82F6', '#2563EB']} // Blue gradient
                        />
                        <QuickAction
                            icon="wallet-plus"
                            label="Nạp tiền"
                            onPress={() => { }}
                            colors={['#10B981', '#059669']} // Green gradient
                        />
                        <QuickAction
                            icon="bank-transfer"
                            label="Rút tiền"
                            onPress={() => { }}
                        />
                        <QuickAction
                            icon="history"
                            label="Lịch sử"
                            onPress={() => navigation.navigate('TransactionHistory')}
                        />
                    </View>
                </View>

                {/* --- LOAN LIST SECTION --- */}
                <View style={styles.listSection}>
                    {/* Filters */}
                    <View style={styles.filterRow}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                        >
                            {FILTERS.map(filter => (
                                <TouchableOpacity
                                    key={filter.id}
                                    onPress={() => handleFilterChange(filter.id)}
                                    style={[
                                        styles.filterPill,
                                        activeFilter === filter.id && styles.filterPillActive
                                    ]}
                                >
                                    <Text style={[
                                        styles.filterText,
                                        activeFilter === filter.id && styles.filterTextActive
                                    ]}>
                                        {filter.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* List */}
                    <FlatList
                        data={loans}
                        renderItem={renderLoanItem}
                        keyExtractor={(item) => item.contractId}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={handleRefresh}
                                tintColor={GlassTokens.colors.primary}
                            />
                        }
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={renderFooter}
                        ListEmptyComponent={loading ? (
                            <ListSkeleton count={4} />
                        ) : (
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="file-document-outline" size={48} color="rgba(255,255,255,0.2)" />
                                <Text style={styles.emptyText}>Chưa có khoản vay nào</Text>
                            </View>
                        )}
                    />

                </View>
            </View>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        paddingTop: 50, // Matches status bar area
    },

    // --- WALLET HEADER ---
    walletHeader: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    userRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    userName: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    notiBtn: {
        padding: 4,
    },
    notiDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#EF4444',
    },

    // Balance
    balanceContainer: {
        marginBottom: 24,
    },
    balanceLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    balanceValue: {
        fontSize: 40,
        fontWeight: '300', // Thin font for elegance
        color: 'white',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        letterSpacing: -1,
        lineHeight: 48,
    },
    balanceCurrency: {
        fontSize: 24,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 6,
        marginLeft: 4,
        fontWeight: '300',
    },

    // Actions
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },

    // --- LIST SECTION ---
    listSection: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.2)', // Subtle darkening
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    },

    // Filters
    filterRow: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    filterContent: {
        paddingHorizontal: 20,
        gap: 8,
    },
    filterPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    filterPillActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)', // Blue tint
        borderColor: '#3B82F6',
    },
    filterText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    filterTextActive: {
        color: '#60A5FA', // Light blue text
        fontWeight: '700',
    },

    // Card
    listContent: {
        padding: 16,
        paddingTop: 16,
    },
    cardContainer: {
        padding: 14,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        gap: 4,
    },
    statusDot: { width: 5, height: 5, borderRadius: 2.5 },
    statusText: { fontSize: 10, fontWeight: '700' },
    dateText: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },

    cardMain: {
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    loanTitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
    amountText: { fontSize: 24, fontWeight: '700', color: 'white', letterSpacing: -0.5 },
    currencyText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

    specsGrid: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        padding: 10,
        justifyContent: 'space-between',
    },
    specItem: { alignItems: 'center', flex: 1 },
    specLabel: { fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
    specValue: { fontSize: 12, fontWeight: '600', color: 'white' },
    specSeparator: { width: 1, height: '60%', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },

    progressSection: { marginTop: 8, paddingHorizontal: 4 },
    progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 1.5, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 1.5 },

    emptyContainer: { alignItems: 'center', marginTop: 60, gap: 16 },
    emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
    centerLoading: {
        paddingVertical: 20
    },
});