/**
 * LoanHistoryScreen.tsx - Danh sách khoản vay với Filter Modal
 * Redesign theo reference p2p/client History.js
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import { loanService, LoanHistoryItem, LoanListResponse } from '../services/loan.service';

const { width } = Dimensions.get('window');

// Status options
const STATUS_OPTIONS = [
    { value: null, label: 'Tất cả', color: '#CDEA2D' },
    { value: 'waiting', label: 'Chờ duyệt', color: '#F59E0B' },
    { value: 'success', label: 'Đang vay', color: '#3B82F6' },
    { value: 'clean', label: 'Đã trả', color: '#10B981' },
    { value: 'fail', label: 'Thất bại', color: '#EF4444' },
];

// Sort options
const SORT_OPTIONS = [
    { value: 'createdAt', label: 'Ngày tạo' },
    { value: 'capital', label: 'Số tiền' },
    { value: 'status', label: 'Trạng thái' },
];

const getStatusInfo = (loan: LoanHistoryItem) => {
    const sf = loan.statusInfo;
    if (sf) {
        if (sf.active) return { text: 'Đang vay', color: '#3B82F6' };
        if (sf.closedObligationsMet) return { text: 'Đã tất toán', color: '#10B981' };
        if (sf.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B' };
        if (sf.waitingForDisbursal) return { text: 'Chờ giải ngân', color: '#8B5CF6' };
        if (sf.closed) return { text: 'Đã đóng', color: '#6B7280' };
        if (sf.rejected || sf.withdrawnByClient) return { text: 'Thất bại', color: '#EF4444' };
    }
    if (loan.status === 'clean' || loan.status === 'closed') return { text: 'Đã tất toán', color: '#10B981' };
    if (loan.status === 'success' || loan.status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6' };
    if (loan.status === 'waiting' || loan.status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B' };
    if (loan.status === 'approved') return { text: 'Đã duyệt', color: '#8B5CF6' };
    if (loan.status === 'fail' || loan.status === 'rejected') return { text: 'Thất bại', color: '#EF4444' };
    return { text: loan.status || 'N/A', color: '#6B7280' };
};

const getPurposeIcon = (purpose?: string): string => {
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
    // rate from server is already annualInterestRate (%/năm)
    const annualRate = loan.rate || 0;

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.loanCard, {
                backgroundColor: isDark ? colors.backgroundSecondary : '#FFFFFF',
                borderColor: isDark ? colors.border : '#F0F0EC',
                ...Platform.select({
                    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.08 : 0.03, shadowRadius: 12 },
                    android: { elevation: isDark ? 2 : 1 },
                }),
            }]}
            onPress={onPress}
        >
            {/* Row 1: Icon + Name/Date + Amount/Status */}
            <View style={styles.cardHeader}>
                <View style={[styles.purposeIconContainer, { backgroundColor: statusInfo.color + '10' }]}>
                    <MaterialCommunityIcons name="hand-coin-outline" size={18} color={statusInfo.color} />
                </View>
                <View style={styles.cardHeaderInfo}>
                    <Text style={[styles.loanPurpose, { color: colors.textPrimary }]} numberOfLines={1}>
                        {loan.productName || 'Khoản vay P2P'}
                    </Text>
                    <Text style={[styles.loanDate, { color: colors.textDim || colors.textMuted }]}>
                        {formatDate(loan.createdAt)}
                    </Text>
                </View>
                <View style={styles.cardHeaderRight}>
                    <Text style={[styles.loanAmount, { color: colors.textPrimary }]}>
                        {formatMoney(loan.capital)} <Text style={[styles.loanCurrency, { color: colors.textMuted }]}>đ</Text>
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '10' }]}>
                        <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
                    </View>
                </View>
            </View>

            {/* Progress Bar (active loans only) */}
            {isActive && (
                <View style={styles.progressSection}>
                    <View style={[styles.progressBarBg, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(progress, 100)}%` as any, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.progressDesc, { color: colors.textDim || colors.textMuted }]}>
                        Đã trả {loan.paidInstallments || 0}/{loan.totalInstallments || 0} kỳ • {Math.round(progress)}%
                    </Text>
                </View>
            )}

            {/* Footer: Term + Monthly + Rate + Action */}
            <View style={[styles.cardFooter, { borderTopColor: isDark ? colors.border + '60' : '#F0F0EC' }]}>
                <View style={styles.footerStats}>
                    <View style={styles.footerStat}>
                        <Text style={[styles.footerLabel, { color: colors.textDim || colors.textMuted, opacity: 0.75 }]}>Kỳ hạn</Text>
                        <Text style={[styles.footerValue, { color: colors.textPrimary }]}>{loan.periodMonth || 0} th</Text>
                    </View>
                    <View style={styles.footerStat}>
                        <Text style={[styles.footerLabel, { color: colors.textDim || colors.textMuted, opacity: 0.75 }]}>Gốc & Lãi/th</Text>
                        <Text style={[styles.footerValue, { color: colors.textPrimary }]}>{formatMoney(loan.monthlyPay)} đ</Text>
                    </View>
                    <View style={styles.footerStat}>
                        <Text style={[styles.footerLabel, { color: colors.textDim || colors.textMuted, opacity: 0.75 }]}>Lãi suất</Text>
                        <Text style={[styles.footerValue, { color: colors.textPrimary }]}>{annualRate.toFixed(1)}%/năm</Text>
                    </View>
                </View>
                <View style={styles.actionGroup}>
                    {isActive && (
                        <TouchableOpacity
                            style={[styles.repayBtn, { backgroundColor: colors.primary }]}
                            onPress={onRepayPress}
                        >
                            <Text style={styles.repayBtnText}>Trả nợ</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.detailBtn, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} onPress={onPress}>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
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
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filters, setFilters] = useState({ status: null as string | null, sortBy: 'createdAt', sortOrder: 'desc' as 'asc' | 'desc' });
    const [appliedFilters, setAppliedFilters] = useState({ ...filters });
    const itemsPerPage = 10;

    const fetchData = useCallback(async (page = 1, overrides = {}) => {
        try {
            setLoading(true);
            const active = { ...appliedFilters, ...overrides };
            const result = await loanService.getApplications({
                page,
                pageSize: itemsPerPage,
                status: active.status || undefined,
                sortBy: active.sortBy,
                sortOrder: active.sortOrder,
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
    }, [appliedFilters]);

    useEffect(() => { fetchData(1); }, [appliedFilters]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchData(currentPage);
        setRefreshing(false);
    };

    const applyFilters = () => {
        Keyboard.dismiss();
        setAppliedFilters({ ...filters });
        setShowFilterModal(false);
    };

    const resetFilters = () => {
        const def = { status: null, sortBy: 'createdAt', sortOrder: 'desc' as 'asc' | 'desc' };
        setFilters(def);
        setAppliedFilters(def);
        setShowFilterModal(false);
    };

    const getActiveFilterCount = () => {
        let n = 0;
        if (appliedFilters.status) n++;
        if (appliedFilters.sortBy !== 'createdAt') n++;
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

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Shared Header — consistent with other screens */}
            <BinanceHeader
                showBack
                title="Lịch Sử Khoản Vay"
                showThemeToggle={false}
                rightComponents={<View />}
            />


            {/* Search + Filter Bar */}
            <View style={styles.searchBar}>
                <View style={[styles.searchInputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.textMuted} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Tìm theo mục đích, sản phẩm..."
                        placeholderTextColor={colors.textMuted}
                        value={searchText}
                        onChangeText={setSearchText}
                        returnKeyType="search"
                    />
                </View>
                <TouchableOpacity
                    style={[styles.filterBtn, { borderColor: colors.primary, backgroundColor: getActiveFilterCount() > 0 ? colors.primary : 'transparent' }]}
                    onPress={() => setShowFilterModal(true)}
                >
                    <Ionicons name="options-outline" size={20} color={getActiveFilterCount() > 0 ? '#000' : colors.primary} />
                    {getActiveFilterCount() > 0 && (
                        <View style={[styles.filterBadge, { backgroundColor: colors.error }]}>
                            <Text style={styles.filterBadgeText}>{getActiveFilterCount()}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

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
                        <View style={styles.pagination}>
                            <TouchableOpacity
                                style={[styles.pageBtn, { borderColor: colors.border, opacity: currentPage === 1 ? 0.4 : 1 }]}
                                onPress={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                <Ionicons name="chevron-back" size={20} color={colors.primary} />
                            </TouchableOpacity>
                            <Text style={[styles.pageInfo, { color: colors.textSecondary }]}>Trang {currentPage} / {totalPages}</Text>
                            <TouchableOpacity
                                style={[styles.pageBtn, { borderColor: colors.border, opacity: currentPage === totalPages ? 0.4 : 1 }]}
                                onPress={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                            >
                                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        </View>
                    ) : null}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            )}

            {/* Filter Modal */}
            <Modal visible={showFilterModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowFilterModal(false)}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <Pressable style={styles.modalDismiss} onPress={() => setShowFilterModal(false)} />
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                            <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
                                <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Bộ lọc & Sắp xếp</Text>
                                    <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                                        <Ionicons name="close" size={22} color={colors.text} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
                                    {/* Status Filter */}
                                    <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Trạng thái</Text>
                                    <View style={styles.statusGrid}>
                                    {STATUS_OPTIONS.map(option => {
                                            const count = option.value === null
                                                ? totalCount
                                                : option.value === 'success' || option.value === 'waiting'
                                                    ? (option.value === 'success' ? summary.totalActiveLoans : summary.totalWaitingLoans)
                                                    : option.value === 'clean' ? summary.totalPaidLoans
                                                    : undefined;
                                            return (
                                            <TouchableOpacity
                                                key={String(option.value)}
                                                style={[
                                                    styles.statusChip,
                                                    { borderColor: colors.border, backgroundColor: colors.background },
                                                    filters.status === option.value && { backgroundColor: option.color + '20', borderColor: option.color, borderWidth: 1.5 }
                                                ]}
                                                onPress={() => setFilters(f => ({ ...f, status: option.value }))}
                                            >
                                                <View style={[styles.statusDotSmall, { backgroundColor: option.color }]} />
                                                <Text style={[
                                                    styles.statusChipText,
                                                    { color: colors.textSecondary },
                                                    filters.status === option.value && { color: option.color, fontWeight: '600' }
                                                ]}>{option.label}{count != null ? ` (${count})` : ''}</Text>
                                            </TouchableOpacity>
                                        );
                                        })}
                                    </View>

                                    {/* Sort By */}
                                    <Text style={[styles.filterLabel, { color: colors.textSecondary, marginTop: 16 }]}>Sắp xếp theo</Text>
                                    <View style={styles.sortRow}>
                                        {SORT_OPTIONS.map(opt => (
                                            <TouchableOpacity
                                                key={opt.value}
                                                style={[
                                                    styles.sortChip,
                                                    { borderColor: colors.border, backgroundColor: colors.background },
                                                    filters.sortBy === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                                                ]}
                                                onPress={() => setFilters(f => ({ ...f, sortBy: opt.value }))}
                                            >
                                                <Text style={[styles.sortChipText, { color: colors.textSecondary }, filters.sortBy === opt.value && { color: '#000', fontWeight: '600' }]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Sort Order */}
                                    <View style={styles.orderRow}>
                                        {[{ val: 'desc', label: 'Mới nhất' }, { val: 'asc', label: 'Cũ nhất' }].map(o => (
                                            <TouchableOpacity
                                                key={o.val}
                                                style={[
                                                    styles.sortChip,
                                                    { borderColor: colors.border, backgroundColor: colors.background },
                                                    filters.sortOrder === o.val && { backgroundColor: colors.primary, borderColor: colors.primary }
                                                ]}
                                                onPress={() => setFilters(f => ({ ...f, sortOrder: o.val as 'asc' | 'desc' }))}
                                            >
                                                <Ionicons
                                                    name={o.val === 'desc' ? 'arrow-down' : 'arrow-up'}
                                                    size={14}
                                                    color={filters.sortOrder === o.val ? '#000' : colors.textSecondary}
                                                />
                                                <Text style={[styles.sortChipText, { color: colors.textSecondary }, filters.sortOrder === o.val && { color: '#000', fontWeight: '600' }]}>
                                                    {o.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>

                                {/* Actions */}
                                <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
                                    <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={resetFilters}>
                                        <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>Đặt lại</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={applyFilters}>
                                        <Text style={styles.applyBtnText}>Áp dụng</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
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
    searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, height: 44, gap: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    searchInput: { flex: 1, fontSize: 14, color: '#111827' },
    filterBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CDEA2D', backgroundColor: '#FFF' },
    filterBadge: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
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
    loanCard: { borderRadius: 16, padding: 16, marginBottom: 10, marginHorizontal: 16, borderWidth: 1, overflow: 'hidden' },
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
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    footerStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    footerStat: {},
    footerLabel: { fontSize: 10, marginBottom: 3 },
    footerValue: { fontSize: 13, fontWeight: '700' },
    actionGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    repayBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    repayBtnText: { fontSize: 12, fontWeight: '700', color: '#14342B' },
    detailBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

    // Pagination
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 16 },
    pageBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    pageInfo: { fontSize: 14, fontWeight: '500' },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalContent: { paddingHorizontal: 20, paddingBottom: 8 },
    filterLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
    statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    statusDotSmall: { width: 7, height: 7, borderRadius: 3.5 },
    statusChipText: { fontSize: 13 },
    sortRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    orderRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    sortChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
    sortChipText: { fontSize: 13 },
    modalActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1 },
    resetBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    resetBtnText: { fontSize: 14, fontWeight: '600' },
    applyBtn: { flex: 2, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    applyBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
});

export default LoanHistoryScreen;
