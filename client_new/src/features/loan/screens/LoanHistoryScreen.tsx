/**
 * LoanHistoryScreen.tsx - Danh sách khoản vay với Filter Modal
 * Redesign theo reference p2p/client History.js
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Dimensions,
    FlatList,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, Pagination, CommonInput } from '../../../components';
import { loanService, LoanHistoryItem, LoanListResponse } from '../services/loan.service';

const { width } = Dimensions.get('window');

type StatusFilter = 'all' | 'waiting' | 'success' | 'overdue' | 'clean' | 'fail';
type SortType = 'newest' | 'oldest' | 'capital_desc' | 'capital_asc';

const STATUS_FILTERS: { key: StatusFilter; label: string; color: string }[] = [
    { key: 'all', label: 'Tất cả', color: '#CDEA2D' },
    { key: 'waiting', label: 'Chờ duyệt', color: '#F59E0B' },
    { key: 'success', label: 'Đang vay', color: '#3B82F6' },
    { key: 'overdue', label: 'Quá hạn', color: '#EF4444' },
    { key: 'clean', label: 'Đã trả', color: '#10B981' },
    { key: 'fail', label: 'Thất bại', color: '#6B7280' },
];

const SORT_OPTIONS: { key: SortType; label: string }[] = [
    { key: 'newest', label: 'Mới nhất' },
    { key: 'oldest', label: 'Cũ nhất' },
    { key: 'capital_desc', label: 'Vốn cao → thấp' },
    { key: 'capital_asc', label: 'Vốn thấp → cao' },
];

function getSortParams(s: SortType) {
    switch (s) {
        case 'newest': return { sortBy: 'createdAt', sortOrder: 'desc' as const };
        case 'oldest': return { sortBy: 'createdAt', sortOrder: 'asc' as const };
        case 'capital_desc': return { sortBy: 'capital', sortOrder: 'desc' as const };
        case 'capital_asc': return { sortBy: 'capital', sortOrder: 'asc' as const };
    }
}

const getStatusInfo = (loan: LoanHistoryItem) => {
    // Check overdue FIRST (before active)
    const overdueDays = loan.delinquentDays || 0;
    if (overdueDays > 0) return { text: `Quá hạn ${overdueDays} ngày`, color: '#EF4444' };

    const sf = loan.statusInfo;
    if (sf) {
        if (sf.active) return { text: 'Đang vay', color: '#3B82F6' };
        if (sf.closedObligationsMet) return { text: 'Đã tất toán', color: '#10B981' };
        if (sf.closedWrittenOff) return { text: 'Đã xóa nợ', color: '#6B7280' };
        if (sf.overpaid) return { text: 'Trả thừa', color: '#10B981' };
        if (sf.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B' };
        if (sf.waitingForDisbursal) return { text: 'Chờ giải ngân', color: '#8B5CF6' };
        if (sf.closed) return { text: 'Đã đóng', color: '#6B7280' };
        if (sf.rejected) return { text: 'Bị từ chối', color: '#EF4444' };
        if (sf.withdrawnByClient) return { text: 'Đã hủy', color: '#9CA3AF' };
    }
    if (loan.status === 'clean' || loan.status === 'closed') return { text: 'Đã tất toán', color: '#10B981' };
    if (loan.status === 'success' || loan.status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6' };
    if (loan.status === 'waiting' || loan.status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B' };
    if (loan.status === 'approved') return { text: 'Đã duyệt', color: '#8B5CF6' };
    if (loan.status === 'rejected' || loan.status === 'fail') return { text: 'Bị từ chối', color: '#EF4444' };
    if (loan.status === 'cancelled') return { text: 'Đã hủy', color: '#9CA3AF' };
    if (loan.status === 'written_off') return { text: 'Đã xóa nợ', color: '#6B7280' };
    return { text: loan.status || 'N/A', color: '#6B7280' };
};

const getPurposeIcon = (purpose?: string): any => {
    const lower = purpose?.toLowerCase() || '';
    if (lower.includes('học') || lower.includes('giáo') || lower.includes('trường')) return 'school';
    if (lower.includes('xe')) return 'car';
    if (lower.includes('nhà') || lower.includes('sửa') || lower.includes('đất')) return 'home-variant';
    if (lower.includes('doanh') || lower.includes('đầu tư')) return 'briefcase';
    if (lower.includes('tiêu dùng') || lower.includes('mua sắm')) return 'cart';
    if (lower.includes('y tế') || lower.includes('sức khỏe')) return 'heart-pulse';
    if (lower.includes('du lịch')) return 'airplane';
    return 'cash-multiple';
};

const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (Array.isArray(dateString) && (dateString as any[]).length >= 3) {
        const [y, m, d] = dateString as any[];
        return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
    return new Date(dateString).toLocaleDateString('vi-VN');
};

// ---------- LoanCard component ----------
interface LoanCardProps {
    loan: LoanHistoryItem;
    onPress: () => void;
    onRepayPress: () => void;
    colors: any;
    isDark: boolean;
}

const LoanCard = React.memo(({ loan, onPress, onRepayPress, colors, isDark }: LoanCardProps) => {
    const statusInfo = getStatusInfo(loan);
    const progress = loan.progress || 0;
    const isActive = loan.status === 'success' || loan.status === 'disbursed';
    const annualRate = loan.rate || 0;

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.loanCard, {
                backgroundColor: isDark ? colors.surface : '#FFFFFF',
                borderRadius: 24,
                padding: 16,
                marginBottom: 16,
                borderWidth: isDark ? 1 : 1,
                borderColor: isDark ? colors.border : '#F3F4F6',
            }]}
            onPress={onPress}
        >
            {/* Header: Icon + Info + Amount/Badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                {/* Icon */}
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: statusInfo.color + '15', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <MaterialCommunityIcons name={getPurposeIcon(loan.productName || loan.willing)} size={24} color={statusInfo.color} />
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }} numberOfLines={1}>
                        {loan.productName || 'Khoản vay P2P'}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted }}>
                        {formatDate(loan.createdAt)}
                    </Text>
                </View>

                {/* Right */}
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
                        {formatMoney(loan.capital)} <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>đ</Text>
                    </Text>
                    <View style={{ backgroundColor: statusInfo.color + '10', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: statusInfo.color }}>{statusInfo.text}</Text>
                    </View>
                </View>
            </View>

            {/* Investment Progress (donut ring) — shown when totalNotes > 0 */}
            {(loan.totalNotes ?? 0) > 0 && (() => {
                const totalN = loan.totalNotes || 1;
                const invested = loan.investedNotes || 0;
                const matched = loan.nodeMatch || 0;
                const available = Math.max(0, totalN - invested - matched);
                const pctNum = Math.round(((invested + matched) / totalN) * 100);
                const SIZE = 54;
                const STROKE = 5;
                const R = (SIZE - STROKE) / 2;
                const C = 2 * Math.PI * R;
                const invLen = (invested / totalN) * C;
                const matchLen = (matched / totalN) * C;
                const availLen = Math.max(0, (available / totalN) * C);
                const gap = 0.01 * C;
                const off2 = invLen + (invested > 0 ? gap : 0);
                const off3 = off2 + matchLen + (matched > 0 ? gap : 0);

                const Svg = require('react-native-svg').default;
                const Circle = require('react-native-svg').Circle;

                return (
                    <View style={[styles.investSection, { backgroundColor: isDark ? (colors.surfaceLight || colors.backgroundSecondary) + '40' : '#F8F8F6', borderRadius: 16, padding: 16, marginBottom: 12 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {/* Donut */}
                            <View style={{ width: SIZE, height: SIZE }}>
                                <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                                    <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.textMuted + '15'} strokeWidth={STROKE} fill="none" />
                                    {availLen > 0 && (
                                        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.textMuted + '30'} strokeWidth={STROKE} fill="none"
                                            strokeDasharray={`${availLen} ${C - availLen}`} strokeDashoffset={-off3} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                                    )}
                                    {matchLen > 0 && (
                                        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.warning || '#F0B90B'} strokeWidth={STROKE} fill="none"
                                            strokeDasharray={`${matchLen} ${C - matchLen}`} strokeDashoffset={-off2} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                                    )}
                                    {invLen > 0 && (
                                        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.success} strokeWidth={STROKE + 1} fill="none"
                                            strokeDasharray={`${invLen} ${C - invLen}`} strokeDashoffset={0} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                                    )}
                                </Svg>
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>{pctNum}%</Text>
                                </View>
                            </View>
                            {/* Legend */}
                            <View style={{ flex: 1, gap: 3 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 }}>TIẾN ĐỘ HUY ĐỘNG</Text>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Đã rót</Text>
                                    <Text style={[styles.legendVal, { color: colors.success }]}>{invested}/{totalN}</Text>
                                </View>
                                {matched > 0 && (
                                    <View style={styles.legendRow}>
                                        <View style={[styles.legendDot, { backgroundColor: colors.warning || '#F0B90B' }]} />
                                        <Text style={[styles.legendText, { color: colors.textSecondary }]}>Giữ chỗ</Text>
                                        <Text style={[styles.legendVal, { color: colors.warning || '#F0B90B' }]}>{matched}</Text>
                                    </View>
                                )}
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: colors.textMuted + '30' }]} />
                                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Khả dụng</Text>
                                    <Text style={[styles.legendVal, { color: colors.textMuted }]}>{available}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                );
            })()}

            {/* Gray Box Footer */}
            <View style={{ backgroundColor: isDark ? colors.background : '#F9FAFB', borderRadius: 16, padding: 16 }}>

                {/* Overdue & Penalty Alert */}
                {(loan.delinquentDays ?? 0) > 0 && (
                    <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#E5E7EB' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="warning" size={14} color="#EF4444" />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>
                                Quá hạn {loan.delinquentDays} ngày
                            </Text>
                        </View>
                        {(loan.totalOverdue ?? 0) > 0 && (
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626', marginLeft: 20 }}>
                                Nợ quá hạn: {formatMoney(loan.totalOverdue)} đ
                            </Text>
                        )}
                        {(loan.penaltyOutstanding ?? 0) > 0 && (
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706', marginLeft: 20, marginTop: 2 }}>
                                Phí phạt: {formatMoney(loan.penaltyOutstanding)} đ
                            </Text>
                        )}
                    </View>
                )}

                {/* Progress (if active) */}
                {isActive && (
                    <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#E5E7EB' }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>
                            Đã trả {loan.paidInstallments || 0}/{loan.totalInstallments || 0} kỳ • {Math.round(progress)}%
                        </Text>
                    </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingRight: isActive ? 6 : 16 }}>
                        <View style={{ flexShrink: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500', marginBottom: 4 }} numberOfLines={1}>Kỳ hạn</Text>
                            <Text style={{ fontSize: 13, color: colors.text, fontWeight: '700' }} numberOfLines={1}>{loan.periodMonth || 0} th</Text>
                        </View>
                        <View style={{ flexShrink: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500', marginBottom: 4 }} numberOfLines={1}>Gốc & Lãi/th</Text>
                            <Text style={{ fontSize: 13, color: colors.text, fontWeight: '700' }} numberOfLines={1}>{formatMoney(loan.monthlyPay)} đ</Text>
                        </View>
                        <View style={{ flexShrink: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500', marginBottom: 4 }} numberOfLines={1}>Lãi suất</Text>
                            <Text style={{ fontSize: 13, color: colors.text, fontWeight: '700' }} numberOfLines={1}>{annualRate.toFixed(1)}%/năm</Text>
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {isActive && (
                            <TouchableOpacity
                                style={{ backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                                onPress={onRepayPress}
                            >
                                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Trả nợ</Text>
                            </TouchableOpacity>
                        )}
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? colors.surfaceLight : '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
                            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                        </View>
                    </View>
                </View>

            </View>
        </TouchableOpacity>
    );
});

// ---------- Main Screen ----------
const LoanHistoryScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const { theme } = useTheme();
    const colors = theme.colors;
    const isDark = theme.mode === 'dark';
    const flatListRef = useRef<FlatList>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loans, setLoans] = useState<LoanHistoryItem[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [summary, setSummary] = useState({ totalActiveLoans: 0, totalOutstanding: 0, totalPaidLoans: 0, totalWaitingLoans: 0 });
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortType, setSortType] = useState<SortType>('newest');
    const [showSort, setShowSort] = useState(false);
    const itemsPerPage = 10;

    const fetchData = useCallback(async (page = 1, filt?: StatusFilter, sort?: SortType) => {
        try {
            setLoading(true);
            const f = filt ?? statusFilter;
            const st = sort ?? sortType;
            const { sortBy, sortOrder } = getSortParams(st);
            const result = await loanService.getApplications({
                page,
                pageSize: itemsPerPage,
                status: f === 'all' ? undefined : f,
                sortBy,
                sortOrder,
            });
            if (result) {
                setLoans(result.loans || []);
                setCurrentPage(result.currentPage || page);
                setTotalPages(result.totalPages || 1);
                setTotalCount(result.totalCount || 0);
                if (result.summary) setSummary(result.summary);
            }
        } catch (err) {
            console.error('[LoanHistory] Error:', err);
            setLoans([]);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, sortType]);

    useEffect(() => { fetchData(1); }, [statusFilter, sortType]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchData(currentPage);
        setRefreshing(false);
    };

    const onFilter = (f: StatusFilter) => { setStatusFilter(f); fetchData(1, f, sortType); };
    const onSort = (s: SortType) => { setSortType(s); setShowSort(false); fetchData(1, statusFilter, s); };

    const getActiveFilterCount = () => {
        let n = 0;
        if (statusFilter !== 'all') n++;
        if (sortType !== 'newest') n++;
        return n;
    };

    const filteredLoans = useMemo(() => {
        if (!searchText.trim()) return loans;
        const q = searchText.trim().toLowerCase();
        return loans.filter(
            (l) =>
                (l.willing || '').toLowerCase().includes(q) ||
                (l.productName || '').toLowerCase().includes(q) ||
                formatMoney(l.capital).toLowerCase().includes(q)
        );
    }, [loans, searchText]);

    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            fetchData(page);
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
    };

    const navigateToDetail = (loan: LoanHistoryItem, autoOpenRepay = false) => {
        navigation.navigate('LoanDetail', { loan, autoOpenRepay });
    };

    const sortLabel = SORT_OPTIONS.find(s => s.key === sortType)?.label || 'Mới nhất';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Shared Header — consistent with other screens */}
            <BinanceHeader
                showBack
                title="Lịch Sử Khoản Vay"
                showThemeToggle={false}
                rightComponents={<View />}
            />


            {/* ── Filter Row ── */}
            <View style={styles.filterSortRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.chipRow}>
                    {STATUS_FILTERS.map(opt => {
                        const active = statusFilter === opt.key;
                        return (
                            <TouchableOpacity
                                key={opt.key}
                                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.backgroundSecondary }]}
                                onPress={() => onFilter(opt.key)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* ── Search ── */}
            <View style={styles.searchBar}>
                <View style={{ flex: 1 }}>
                    <CommonInput
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholder="Tìm theo mục đích, sản phẩm..."
                        icon="magnify"
                        variant="standard"
                        returnKeyType="search"
                    />
                </View>
                <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(!showSort)} activeOpacity={0.7}>
                    <Text style={[styles.sortBtnText, { color: colors.textSecondary }]}>{sortLabel}</Text>
                    <Ionicons name={showSort ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Sort dropdown */}
            {showSort && (
                <View style={[styles.sortDropdown, { backgroundColor: colors.backgroundSecondary }]}>
                    {SORT_OPTIONS.map(opt => {
                        const active = sortType === opt.key;
                        return (
                            <TouchableOpacity
                                key={opt.key}
                                style={[styles.sortOption, active && { backgroundColor: colors.primary + '12' }]}
                                onPress={() => onSort(opt.key)}
                            >
                                <Text style={[styles.sortOptionText, { color: active ? colors.primary : colors.text }]}>{opt.label}</Text>
                                {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {/* Main Content */}
            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Đang tải...</Text>
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={filteredLoans}
                    renderItem={({ item }) => (
                        <LoanCard
                            loan={item}
                            colors={colors}
                            isDark={isDark}
                            onPress={() => navigateToDetail(item)}
                            onRepayPress={() => navigateToDetail(item, true)}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons
                                name={searchText || getActiveFilterCount() > 0 ? 'file-search-outline' : 'hand-coin-outline'}
                                size={64}
                                color={colors.textDim}
                            />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>
                                {searchText || getActiveFilterCount() > 0 ? 'Không tìm thấy khoản vay' : 'Chưa có khoản vay nào'}
                            </Text>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {searchText || getActiveFilterCount() > 0
                                    ? 'Thử thay đổi từ khóa hoặc bộ lọc'
                                    : 'Bắt đầu vay ngay để quản lý khoản vay của bạn'}
                            </Text>
                            {!searchText && getActiveFilterCount() === 0 && (
                                <TouchableOpacity
                                    style={[styles.emptyCta, { backgroundColor: colors.primary }]}
                                    onPress={() => (navigation as any).navigate('Main', { screen: 'Loan' })}
                                >
                                    <Text style={styles.emptyCtaText}>Xem gói vay</Text>
                                    <Ionicons name="arrow-forward" size={18} color="#000" />
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                    ListFooterComponent={totalPages > 1 ? (
                        <Pagination
                            mode="page"
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalCount={totalCount}
                            onPageChange={goToPage}
                        />
                    ) : null}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            )}


        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 12, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    headerSubtitle: { fontSize: 12, marginTop: 2 },

    // Stats (removed — counts now in filter modal)

    // Search Bar
    searchBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, height: 46, gap: 10 },
    searchInput: { flex: 1, fontSize: 14 },
    filterBtn: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    filterBadge: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    filterBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },

    // Loading / Empty
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14 },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600' },
    emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
    emptyCtaText: { fontSize: 15, fontWeight: '700', color: '#000' },

    // List
    listContent: { paddingBottom: 24, paddingTop: 4 },

    // Loan Card — polished
    loanCard: { borderRadius: 22, padding: 18, marginBottom: 12, marginHorizontal: 16, overflow: 'hidden' },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    purposeIconContainer: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    cardHeaderInfo: { flex: 1, marginLeft: 12 },
    loanPurpose: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    loanDate: { fontSize: 11, opacity: 0.6 },
    cardHeaderRight: { alignItems: 'flex-end' },
    loanAmount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
    loanCurrency: { fontSize: 12, fontWeight: '400' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '600' },

    // Progress
    progressSection: { marginTop: 12, gap: 4 },
    progressBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 2 },
    progressDesc: { fontSize: 10, opacity: 0.6 },

    // Card Footer — 3-column grid
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginTop: 14, borderRadius: 14 },
    footerStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    footerStat: {},
    footerLabel: { fontSize: 10, marginBottom: 3 },
    footerValue: { fontSize: 13, fontWeight: '700' },
    actionGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    repayBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
    repayBtnText: { fontSize: 12, fontWeight: '700' },
    detailBtn: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    // Filter + Sort row
    filterSortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    chipDot: { width: 7, height: 7, borderRadius: 3.5 },
    chipText: { fontSize: 12, fontWeight: '600' },

    // Sort
    sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sortBtnText: { fontSize: 12, fontWeight: '500' },
    sortDropdown: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
    sortOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
    sortOptionText: { fontSize: 13, fontWeight: '500' },

    // Investment donut
    investSection: { marginTop: 12, borderRadius: 14, padding: 12 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 6, height: 6, borderRadius: 3 },
    legendText: { flex: 1, fontSize: 11 },
    legendVal: { fontSize: 11, fontWeight: '700' },
});

export default LoanHistoryScreen;
