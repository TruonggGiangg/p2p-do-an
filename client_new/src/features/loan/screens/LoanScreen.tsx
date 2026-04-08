import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';
import { BinanceHeader, CommonCard, FintechPullToRefresh, FintechScreenSkeleton } from '../../../components';
import { loanService, LoanProduct, LoanHistoryItem } from '../services/loan.service';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

type LoanScreenNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

const getStatusInfo = (loan: LoanHistoryItem) => {
    const sf = loan.statusInfo;
    if (sf) {
        if (sf.active) return { text: 'Đang vay', color: '#3B82F6', icon: 'progress-clock' as const };
        if (sf.closedObligationsMet) return { text: 'Đã tất toán', color: '#0ECB81', icon: 'check-circle' as const };
        if (sf.closedWrittenOff) return { text: 'Đã xóa nợ', color: '#6B7280', icon: 'close-circle' as const };
        if (sf.overpaid) return { text: 'Trả thừa', color: '#0ECB81', icon: 'check-circle' as const };
        if (sf.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B', icon: 'clock-outline' as const };
        if (sf.waitingForDisbursal) return { text: 'Chờ giải ngân', color: '#8B5CF6', icon: 'bank-transfer' as const };
        if (sf.closed) return { text: 'Đã đóng', color: '#6B7280', icon: 'close-circle' as const };
        if (sf.rejected) return { text: 'Bị từ chối', color: '#F6465D', icon: 'alert-circle' as const };
        if (sf.withdrawnByClient) return { text: 'Đã hủy', color: '#9CA3AF', icon: 'close-circle' as const };
    }
    if (loan.status === 'clean' || loan.status === 'closed') return { text: 'Đã tất toán', color: '#0ECB81', icon: 'check-circle' as const };
    if (loan.status === 'success' || loan.status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6', icon: 'progress-clock' as const };
    if (loan.status === 'waiting' || loan.status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B', icon: 'clock-outline' as const };
    if (loan.status === 'approved') return { text: 'Đã duyệt', color: '#8B5CF6', icon: 'check-decagram' as const };
    if (loan.status === 'rejected' || loan.status === 'fail') return { text: 'Bị từ chối', color: '#F6465D', icon: 'alert-circle' as const };
    if (loan.status === 'cancelled') return { text: 'Đã hủy', color: '#9CA3AF', icon: 'close-circle' as const };
    if (loan.status === 'written_off') return { text: 'Đã xóa nợ', color: '#6B7280', icon: 'close-circle' as const };
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
    const modal = useConfirmModal();
    const [products, setProducts] = useState<LoanProduct[]>([]);
    const [activeLoans, setActiveLoans] = useState<LoanHistoryItem[]>([]);
    const [pendingLoans, setPendingLoans] = useState<LoanHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const isActiveLoan = useCallback((loan: LoanHistoryItem) => {
        const sf = loan.statusInfo;
        const status = String(loan.status || '').toLowerCase();
        return Boolean(sf?.active || status === 'success' || status === 'disbursed' || status === 'active');
    }, []);

    const isPendingLoan = useCallback((loan: LoanHistoryItem) => {
        const sf = loan.statusInfo;
        const status = String(loan.status || '').toLowerCase();
        return Boolean(
            sf?.pendingApproval ||
            sf?.waitingForDisbursal ||
            status === 'waiting' ||
            status === 'pending' ||
            status === 'approved'
        );
    }, []);

    const fetchData = useCallback(async () => {
        const minDelay = new Promise(resolve => setTimeout(resolve, 1700));
        try {
            const [[data, activeRes, pendingRes]] = await Promise.all([
                Promise.all([
                    loanService.getLoanProducts(),
                    loanService.getApplications({ page: 1, pageSize: 30, status: 'success', sortBy: 'createdAt', sortOrder: 'desc' }),
                    loanService.getApplications({ page: 1, pageSize: 30, status: 'waiting', sortBy: 'createdAt', sortOrder: 'desc' }),
                ]),
                minDelay,
            ]);

            setProducts(data);

            let nextActiveLoans = (activeRes?.loans ?? []).filter(isActiveLoan);
            let nextPendingLoans = (pendingRes?.loans ?? []).filter(isPendingLoan);
            let allLoansFallback: LoanHistoryItem[] | null = null;

            // Fallback: in case backend status filter misses loans by semantic status mapping
            if (nextActiveLoans.length === 0 || nextPendingLoans.length === 0) {
                const allRes = await loanService.getApplications({ page: 1, pageSize: 80, sortBy: 'createdAt', sortOrder: 'desc' });
                allLoansFallback = allRes?.loans ?? [];
            }

            if (nextActiveLoans.length === 0 && allLoansFallback) {
                nextActiveLoans = allLoansFallback.filter(isActiveLoan);
            }

            if (nextPendingLoans.length === 0 && allLoansFallback) {
                nextPendingLoans = allLoansFallback.filter(isPendingLoan);
            }

            setActiveLoans(nextActiveLoans);
            setPendingLoans(nextPendingLoans);
        } catch (error) {
            console.error('Failed to fetch loan data:', error);
            setActiveLoans([]);
            setPendingLoans([]);
            modal.error('Lỗi', 'Không thể tải danh sách sản phẩm vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isActiveLoan, isPendingLoan]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
    }, [fetchData]);

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [fetchData]),
    );

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

    const renderActiveLoanItem = ({ item }: { item: LoanHistoryItem }) => {
        const status = getStatusInfo(item);
        return (
            <TouchableOpacity
                style={styles.activeLoanItem}
                activeOpacity={0.8}
                onPress={() => (navigation as any).navigate('LoanDetail', { loan: item })}
            >
                <CommonCard style={[styles.activeLoanCard, { backgroundColor: c.backgroundSecondary, borderColor: c.border }]}>
                    <View style={styles.activeLoanTop}>
                        <View style={[styles.activeLoanIconWrap, { backgroundColor: c.primaryGlass }]}>
                            <MaterialCommunityIcons name="credit-card-outline" size={18} color={c.primary} />
                        </View>
                        <View style={styles.activeLoanInfo}>
                            <Text style={[styles.activeLoanTitle, { color: c.textPrimary }]} numberOfLines={1}>
                                {item.productName || `Khoản vay #${item.fineractLoanId ?? item.id.slice(-6)}`}
                            </Text>
                            <Text style={[styles.activeLoanAmount, { color: c.textSecondary }]}>
                                Vay: {formatMoney(item.capital)} đ
                            </Text>
                            {item.contractSignedVerified && (
                                <View style={[styles.verifiedBadge, { backgroundColor: `${c.success}1A` }]}>
                                    <MaterialCommunityIcons name="shield-check" size={11} color={c.success} />
                                    <Text style={[styles.verifiedBadgeText, { color: c.success }]}>Đã ký xác minh</Text>
                                </View>
                            )}
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: status.color + '20' }]}>
                            <MaterialCommunityIcons name={status.icon as any} size={12} color={status.color} />
                            <Text style={[styles.statusChipText, { color: status.color }]}>{status.text}</Text>
                        </View>
                    </View>

                    <View style={styles.activeLoanMetaRow}>
                        <View style={styles.metaCol}>
                            <Text style={[styles.metaLabel, { color: c.textMuted }]}>Kỳ hạn</Text>
                            <Text style={[styles.metaValue, { color: c.textPrimary }]}>{item.periodMonth || '--'} tháng</Text>
                        </View>
                        <View style={styles.metaCol}>
                            <Text style={[styles.metaLabel, { color: c.textMuted }]}>Ngày tạo</Text>
                            <Text style={[styles.metaValue, { color: c.textPrimary }]}>{formatDateShort(item.createdAt) || '--'}</Text>
                        </View>
                        <View style={styles.metaCol}>
                            <Text style={[styles.metaLabel, { color: c.textMuted }]}>Trả/tháng</Text>
                            <Text style={[styles.metaValue, { color: c.textPrimary }]}>
                                {item.monthlyPay ? `${formatMoney(item.monthlyPay)} đ` : '--'}
                            </Text>
                        </View>
                    </View>
                </CommonCard>
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
                {/* ═══ LOAN HISTORY BTN ═══ */}
                <View style={styles.historySection}>
                    <TouchableOpacity
                        style={[
                            styles.historyBtnTop,
                            {
                                backgroundColor: isDark ? c.surfaceLight : c.backgroundSecondary,
                                borderWidth: 1,
                                borderColor: isDark ? c.border : '#DEE5E8',
                            },
                        ]}
                        activeOpacity={0.7}
                        onPress={navToHistory}
                    >
                        <View style={[styles.historyIconWrap, { backgroundColor: c.primaryGlass }]}>
                            <MaterialCommunityIcons name="history" size={20} color={c.primary} />
                        </View>
                        <View style={styles.historyTextWrap}>
                            <Text style={[styles.historyBtnText, { color: c.textPrimary }]}>Lịch sử khoản vay</Text>
                            <Text style={[styles.historyBtnSubText, { color: c.textSecondary }]}>Theo dõi trạng thái và thanh toán</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </TouchableOpacity>
                </View>
                {/* ═══ HEADER ═══ */}
                <View style={styles.headerSection}>
                    <View style={styles.headerRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Gói vay ưu đãi</Text>
                            <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>Chọn gói vay phù hợp với nhu cầu của bạn</Text>
                        </View>
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

                {/* ═══ ACTIVE LOANS ═══ */}
                {!loading && (
                    <View style={styles.activeSection}>
                        <View style={styles.activeHeaderRow}>
                            <Text style={[styles.activeSectionTitle, { color: c.textPrimary }]}>Khoản vay đang hoạt động</Text>
                            <View style={[styles.activeCountBadge, { backgroundColor: c.primaryGlass, borderColor: c.primaryBorder }]}>
                                <Text style={[styles.activeCountText, { color: c.primary }]}>{activeLoans.length} khoản</Text>
                            </View>
                        </View>

                        {activeLoans.length > 0 ? (
                            <FlatList
                                data={activeLoans}
                                renderItem={renderActiveLoanItem}
                                keyExtractor={(item) => item.id}
                                scrollEnabled={false}
                                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                            />
                        ) : (
                            <CommonCard style={[styles.activeEmptyCard, { backgroundColor: c.backgroundSecondary, borderColor: c.border }]}>
                                <Text style={[styles.activeEmptyText, { color: c.textSecondary }]}>
                                    Hiện chưa có khoản vay nào đang hoạt động.
                                </Text>
                            </CommonCard>
                        )}
                    </View>
                )}

                {!loading && (
                    <View style={styles.pendingSection}>
                        <View style={styles.activeHeaderRow}>
                            <Text style={[styles.activeSectionTitle, { color: c.textPrimary }]}>Khoản vay chờ duyệt</Text>
                            <View
                                style={[
                                    styles.pendingCountBadge,
                                    {
                                        backgroundColor: isDark ? 'rgba(248, 185, 77, 0.16)' : 'rgba(245, 158, 11, 0.12)',
                                        borderColor: isDark ? 'rgba(248, 185, 77, 0.35)' : 'rgba(180, 83, 9, 0.22)',
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.activeCountText,
                                        { color: isDark ? '#F8B94D' : '#B45309' },
                                    ]}
                                >
                                    {pendingLoans.length} hồ sơ
                                </Text>
                            </View>
                        </View>

                        {pendingLoans.length > 0 ? (
                            <FlatList
                                data={pendingLoans}
                                renderItem={renderActiveLoanItem}
                                keyExtractor={(item) => `pending-${item.id}`}
                                scrollEnabled={false}
                                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                            />
                        ) : (
                            <CommonCard style={[styles.activeEmptyCard, { backgroundColor: c.backgroundSecondary, borderColor: c.border }]}>
                                <Text style={[styles.activeEmptyText, { color: c.textSecondary }]}>Chưa có khoản vay nào đang chờ duyệt.</Text>
                            </CommonCard>
                        )}
                    </View>
                )}



                <View style={{ height: 40 }} />
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    // ── History Link ──
    historySection: { marginTop: 16 },
    historyBtnTop: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
    },
    historyIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center', alignItems: 'center',
    },
    historyTextWrap: {
        flex: 1,
        marginLeft: 10,
        marginRight: 8,
    },
    historyBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyBtnSubText: {
        marginTop: 1,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },

    // ── Header ──
    headerSection: { marginTop: 32, marginBottom: 20 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    sectionTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
    sectionSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 18 },
    loadingContainer: { marginTop: 28 },

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

    // ── Active Loans ──
    activeSection: {
        marginTop: 20,
    },
    pendingSection: {
        marginTop: 16,
    },
    activeHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    activeSectionTitle: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
    },
    activeCountBadge: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    pendingCountBadge: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    activeCountText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    activeEmptyCard: {
        borderRadius: 14,
        borderWidth: 1,
        paddingVertical: 14,
        paddingHorizontal: 12,
    },
    activeEmptyText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    activeLoanItem: {
        borderRadius: 16,
    },
    activeLoanCard: {
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    activeLoanTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    activeLoanIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeLoanInfo: {
        flex: 1,
        marginLeft: 10,
        marginRight: 8,
    },
    activeLoanTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    activeLoanAmount: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    verifiedBadge: {
        marginTop: 6,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    verifiedBadgeText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
    },
    statusChipText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    activeLoanMetaRow: {
        flexDirection: 'row',
        marginTop: 10,
        paddingTop: 10,
    },
    metaCol: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 2,
    },
    metaValue: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },

    // ── Empty ──
    emptyContainer: { marginTop: 60, alignItems: 'center', gap: 16 },
    emptyIcon: {
        width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center',
    },
    emptyText: { fontSize: 15, textAlign: 'center', fontFamily: 'Poppins_500Medium' },

});
