import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, FintechPullToRefresh, FintechScreenSkeleton } from '../../../components';
import { loanService, LoanProduct, LoanHistoryItem } from '../services/loan.service';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

type LoanScreenNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

const getStatusInfo = (loan: LoanHistoryItem) => {
    const sf = loan.statusInfo;
    if (sf) {
        if (sf.active) return { text: 'Đang vay', color: '#3B82F6', icon: 'progress-clock' as const };
        if (sf.closedObligationsMet) return { text: 'Đã tất toán', color: '#0ECB81', icon: 'check-circle' as const };
        if (sf.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B', icon: 'clock-outline' as const };
        if (sf.waitingForDisbursal) return { text: 'Chờ giải ngân', color: '#8B5CF6', icon: 'bank-transfer' as const };
        if (sf.closed) return { text: 'Đã đóng', color: '#6B7280', icon: 'close-circle' as const };
        if (sf.rejected || sf.withdrawnByClient) return { text: 'Thất bại', color: '#F6465D', icon: 'alert-circle' as const };
    }
    if (loan.status === 'clean' || loan.status === 'closed') return { text: 'Đã tất toán', color: '#0ECB81', icon: 'check-circle' as const };
    if (loan.status === 'success' || loan.status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6', icon: 'progress-clock' as const };
    if (loan.status === 'waiting' || loan.status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B', icon: 'clock-outline' as const };
    if (loan.status === 'approved') return { text: 'Đã duyệt', color: '#8B5CF6', icon: 'check-decagram' as const };
    if (loan.status === 'fail' || loan.status === 'rejected') return { text: 'Thất bại', color: '#F6465D', icon: 'alert-circle' as const };
    return { text: loan.status || 'N/A', color: '#6B7280', icon: 'help-circle' as const };
};

const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const PRODUCT_ICONS: Record<string, string> = {
    'P': 'account-cash-outline',
    'default': 'cash-multiple',
};

export default function LoanScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<LoanScreenNav>();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';
    const [products, setProducts] = useState<LoanProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [recentLoans, setRecentLoans] = useState<LoanHistoryItem[]>([]);
    const [loadingLoans, setLoadingLoans] = useState(false);

    const fetchProducts = async () => {
        const minDelay = new Promise(resolve => setTimeout(resolve, 1700));
        try {
            const [data] = await Promise.all([loanService.getLoanProducts(), minDelay]);
            setProducts(data);
        } catch (error) {
            console.error('Failed to fetch loan products:', error);
            Alert.alert('Lỗi', 'Không thể tải danh sách sản phẩm vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchRecentLoans = async () => {
        try {
            setLoadingLoans(true);
            const result = await loanService.getApplications({ page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' });
            setRecentLoans(result.loans || []);
        } catch { } finally { setLoadingLoans(false); }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchProducts(), fetchRecentLoans()]);
    }, []);

    useEffect(() => { fetchProducts(); fetchRecentLoans(); }, []);
    useFocusEffect(useCallback(() => { fetchRecentLoans(); }, []));

    const navToHistory = () => (navigation as any).navigate('LoanHistory');

    const getProductIcon = (shortName?: string) => {
        if (shortName && PRODUCT_ICONS[shortName.charAt(0)]) return PRODUCT_ICONS[shortName.charAt(0)];
        return PRODUCT_ICONS['default'];
    };

    // ── Product Card ──
    const renderProductItem = ({ item, index }: { item: LoanProduct; index: number }) => {
        const gradColors: [string, string] = index % 2 === 0
            ? (isDark ? ['#14342B', '#1A3B34'] : ['#14342B', '#1E4D3F'])
            : (isDark ? ['#1A3028', '#245649'] : ['#1A3B34', '#245649']);

        return (
            <TouchableOpacity
                style={styles.productItem}
                onPress={() => navigation.navigate('LoanProductDetail', { product: item })}
                activeOpacity={0.85}
            >
                <LinearGradient colors={gradColors} style={styles.productCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    {/* Decorative blob */}
                    <View style={styles.productBlob} />

                    <View style={styles.productTop}>
                        <View style={styles.productIconWrap}>
                            <MaterialCommunityIcons name={getProductIcon(item.shortName) as any} size={22} color="#CDEA2D" />
                        </View>
                        <View style={styles.productInfo}>
                            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.productShortName}>{item.shortName}</Text>
                        </View>
                        <View style={styles.productArrow}>
                            <MaterialCommunityIcons name="arrow-right" size={18} color="rgba(255,255,255,0.6)" />
                        </View>
                    </View>

                    <View style={styles.productDivider} />

                    <View style={styles.productBottom}>
                        <View style={styles.productStat}>
                            <Text style={styles.productStatLabel}>Lãi suất</Text>
                            <Text style={styles.productStatValue}>
                                {item.interestRatePerPeriod}%
                                <Text style={styles.productStatUnit}>
                                    /{item.interestRateFrequencyType?.value?.toLowerCase()?.includes('year') ? 'năm' : 'tháng'}
                                </Text>
                            </Text>
                        </View>
                        <View style={[styles.productStatDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                        <View style={styles.productStat}>
                            <Text style={styles.productStatLabel}>Kiểu lãi</Text>
                            <Text style={styles.productStatValue} numberOfLines={1}>{item.interestType.value}</Text>
                        </View>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader mode="dashboard" title="Vay vốn" />

            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
                primaryColor={c.primary}
                glowColor={c.primaryLight}
            >
                {/* ═══ HEADER ═══ */}
                <View style={styles.headerSection}>
                    <View style={styles.headerRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Gói vay ưu đãi</Text>
                            <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>Chọn gói vay phù hợp với nhu cầu của bạn</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.historyLink, { backgroundColor: c.primary + '12' }]}
                            onPress={navToHistory}
                            activeOpacity={0.75}
                        >
                            <MaterialCommunityIcons name="history" size={16} color={c.primary} />
                            <Text style={[styles.historyLinkText, { color: c.primary }]}>Lịch sử</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ═══ PRODUCTS ═══ */}
                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <FintechScreenSkeleton variant="loan" />
                    </View>
                ) : (
                    <FlatList
                        data={products}
                        renderItem={renderProductItem}
                        keyExtractor={(item) => item.id.toString()}
                        scrollEnabled={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <View style={[styles.emptyIcon, { backgroundColor: c.textDim + '15' }]}>
                                    <MaterialCommunityIcons name="briefcase-off-outline" size={40} color={c.textDim} />
                                </View>
                                <Text style={[styles.emptyText, { color: c.textSecondary }]}>Hiện chưa có gói vay nào khả dụng</Text>
                            </View>
                        }
                    />
                )}

                {/* ═══ RECENT LOANS ═══ */}
                {recentLoans.length > 0 && (
                    <View style={styles.recentSection}>
                        <View style={styles.recentHeader}>
                            <Text style={[styles.recentTitle, { color: c.textPrimary }]}>Khoản vay gần đây</Text>
                            <TouchableOpacity onPress={navToHistory} activeOpacity={0.75}>
                                <Text style={[styles.recentSeeAll, { color: isDark ? '#8ECFB9' : '#14342B' }]}>Xem tất cả</Text>
                            </TouchableOpacity>
                        </View>

                        {recentLoans.map((loan) => {
                                const status = getStatusInfo(loan);
                                const annualRate = loan.rate || 0;
                                return (
                                    <TouchableOpacity
                                        key={loan.id}
                                        style={[styles.recentCard, {
                                            backgroundColor: isDark ? c.backgroundSecondary : '#FFFFFF',
                                            borderColor: isDark ? c.border : '#F0F0EC',
                                            ...Platform.select({
                                                ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.08 : 0.03, shadowRadius: 12 },
                                                android: { elevation: isDark ? 2 : 1 },
                                            }),
                                        }]}
                                        activeOpacity={0.7}
                                        onPress={() => (navigation as any).navigate('LoanDetail', { loan })}
                                    >
                                        {/* Header: Icon + Name/Date + Amount/Status */}
                                        <View style={styles.recentCardHeader}>
                                            <View style={[styles.recentIcon, { backgroundColor: status.color + '10' }]}>
                                                <MaterialCommunityIcons name="hand-coin-outline" size={18} color={status.color} />
                                            </View>
                                            <View style={styles.recentCardInfo}>
                                                <Text style={[styles.recentName, { color: c.textPrimary }]} numberOfLines={1}>
                                                    {loan.willing || loan.productName || 'Khoản vay'}
                                                </Text>
                                                <Text style={[styles.recentSub, { color: c.textMuted, opacity: 0.6 }]}>
                                                    {formatDateShort(loan.createdAt)}
                                                </Text>
                                            </View>
                                            <View style={styles.recentRight}>
                                                <Text style={[styles.recentAmount, { color: c.textPrimary }]}>
                                                    {formatMoney(loan.capital)} <Text style={[styles.recentCurrency, { color: c.textMuted }]}>đ</Text>
                                                </Text>
                                                <View style={[styles.recentBadge, { backgroundColor: status.color + '10' }]}>
                                                    <Text style={[styles.recentBadgeText, { color: status.color }]}>{status.text}</Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Footer: Term + Monthly + Rate + Chevron */}
                                        <View style={[styles.recentCardFooter, { borderTopColor: isDark ? c.border + '60' : '#F0F0EC' }]}>
                                            <View style={styles.recentFooterStats}>
                                                <View style={styles.recentFooterStat}>
                                                    <Text style={[styles.recentFooterLabel, { color: c.textMuted, opacity: 0.75 }]}>Kỳ hạn</Text>
                                                    <Text style={[styles.recentFooterValue, { color: c.textPrimary }]}>{loan.periodMonth || 0} th</Text>
                                                </View>
                                                <View style={styles.recentFooterStat}>
                                                    <Text style={[styles.recentFooterLabel, { color: c.textMuted, opacity: 0.75 }]}>Gốc & Lãi/th</Text>
                                                    <Text style={[styles.recentFooterValue, { color: c.textPrimary }]}>{formatMoney(loan.monthlyPay)} đ</Text>
                                                </View>
                                                <View style={styles.recentFooterStat}>
                                                    <Text style={[styles.recentFooterLabel, { color: c.textMuted, opacity: 0.75 }]}>Lãi suất</Text>
                                                    <Text style={[styles.recentFooterValue, { color: c.textPrimary }]}>{annualRate.toFixed(1)}%/năm</Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity style={[styles.recentChevron, { backgroundColor: isDark ? c.border : '#F3F4F6' }]} onPress={() => (navigation as any).navigate('LoanDetail', { loan })}>
                                                <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />
                                            </TouchableOpacity>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Xem tất cả button */}
                            <TouchableOpacity
                                style={[styles.viewAllBtn, { backgroundColor: isDark ? '#1A3A30' : '#14342B' }]}
                                activeOpacity={0.7}
                                onPress={navToHistory}
                            >
                                <Text style={styles.viewAllText}>Xem tất cả khoản vay</Text>
                                <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                            </TouchableOpacity>
                    </View>
                )}

                {loadingLoans && recentLoans.length === 0 && (
                    <ActivityIndicator size="small" color={c.primary} style={{ marginTop: 20 }} />
                )}

                <View style={{ height: 40 }} />
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    // ── Header ──
    headerSection: { marginTop: 20, marginBottom: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    sectionTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
    sectionSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 18 },
    loadingContainer: { marginTop: 28 },

    // ── History Link ──
    historyLink: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    },
    historyLinkText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

    // ── Product Card ──
    productItem: { marginBottom: 14 },
    productCard: {
        borderRadius: 20, padding: 20, overflow: 'hidden', position: 'relative',
    },
    productBlob: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(205, 234, 45, 0.06)', top: -40, right: -30,
    },
    productTop: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
    productIconWrap: {
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: 'rgba(205, 234, 45, 0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    productInfo: { flex: 1, marginLeft: 14 },
    productName: {
        fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF', marginBottom: 2,
    },
    productShortName: {
        fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.5)',
    },
    productArrow: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center',
    },
    productDivider: {
        height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 16,
    },
    productBottom: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
    productStat: { flex: 1 },
    productStatLabel: {
        fontSize: 11, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.45)', marginBottom: 4,
    },
    productStatValue: {
        fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#CDEA2D',
    },
    productStatUnit: {
        fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(205,234,45,0.7)',
    },
    productStatDivider: { width: 1, height: 30, marginHorizontal: 16 },

    // ── Empty ──
    emptyContainer: { marginTop: 60, alignItems: 'center', gap: 16 },
    emptyIcon: {
        width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center',
    },
    emptyText: { fontSize: 15, textAlign: 'center', fontFamily: 'Poppins_500Medium' },

    // ── Recent Loans — individual cards matching LoanHistoryScreen ──
    recentSection: { marginTop: 28 },
    recentHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
    },
    recentTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    recentSeeAll: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    recentCard: { borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
    recentCardHeader: { flexDirection: 'row', alignItems: 'center' },
    recentIcon: {
        width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    },
    recentCardInfo: { flex: 1, marginLeft: 12 },
    recentName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginBottom: 2 },
    recentSub: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    recentRight: { alignItems: 'flex-end' },
    recentAmount: { fontSize: 16, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3, marginBottom: 4 },
    recentCurrency: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
    recentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    recentBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    recentCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    recentFooterStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    recentFooterStat: {},
    recentFooterLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginBottom: 3 },
    recentFooterValue: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    recentChevron: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    viewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 4, borderRadius: 14 },
    viewAllText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
});
