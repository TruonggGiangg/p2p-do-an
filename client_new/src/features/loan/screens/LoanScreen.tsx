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
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
                                <Text style={[styles.recentSeeAll, { color: c.primary }]}>Xem tất cả</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.recentList, {
                            backgroundColor: isDark ? c.backgroundSecondary : '#FFFFFF',
                            ...Platform.select({
                                ios: { shadowColor: '#14342B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: isDark ? 0.2 : 0.05, shadowRadius: 14 },
                                android: { elevation: isDark ? 4 : 2 },
                            }),
                        }]}>
                            {recentLoans.map((loan, index) => {
                                const status = getStatusInfo(loan);
                                const isLast = index === recentLoans.length - 1;
                                return (
                                    <TouchableOpacity
                                        key={loan.id}
                                        style={[styles.recentCard, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border + '30' }]}
                                        activeOpacity={0.75}
                                        onPress={() => (navigation as any).navigate('LoanDetail', { loan })}
                                    >
                                        <View style={[styles.recentIcon, { backgroundColor: status.color + '12' }]}>
                                            <MaterialCommunityIcons name={status.icon as any} size={18} color={status.color} />
                                        </View>
                                        <View style={styles.recentInfo}>
                                            <Text style={[styles.recentName, { color: c.textPrimary }]} numberOfLines={1}>
                                                {loan.willing || loan.productName || 'Khoản vay'}
                                            </Text>
                                            <Text style={[styles.recentDate, { color: c.textMuted }]}>
                                                {formatDateShort(loan.createdAt)} • {loan.periodMonth || 0} tháng
                                            </Text>
                                        </View>
                                        <View style={styles.recentRight}>
                                            <Text style={[styles.recentAmount, { color: c.textPrimary }]}>
                                                {formatMoney(loan.capital)} đ
                                            </Text>
                                            <View style={[styles.recentStatus, { backgroundColor: status.color + '12' }]}>
                                                <Text style={[styles.recentStatusText, { color: status.color }]}>{status.text}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
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

    // ── Recent Loans ──
    recentSection: { marginTop: 28 },
    recentHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
    },
    recentTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    recentSeeAll: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    recentList: { borderRadius: 20, overflow: 'hidden' },
    recentCard: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, gap: 14,
    },
    recentIcon: {
        width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    },
    recentInfo: { flex: 1 },
    recentName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginBottom: 3 },
    recentDate: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    recentRight: { alignItems: 'flex-end', gap: 5 },
    recentAmount: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    recentStatus: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    recentStatusText: { fontSize: 10, fontFamily: 'Poppins_700Bold' },
});
