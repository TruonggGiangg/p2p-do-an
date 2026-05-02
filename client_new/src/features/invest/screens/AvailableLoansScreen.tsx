/**
 * AvailableLoansScreen — Khoản vay đang cho phép đầu tư
 * Redesigned: Finesse Wallet theme (Deep Teal + Lime Green)
 * Supports filter, sort, search, pagination via useFilterState hook.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Alert, Dimensions, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, FintechPagination } from '../../../components';
import investService, { AvailableLoanItem } from '../services/invest.service';
import FilterBar from '../components/FilterBar';
import FilterBottomSheet from '../components/FilterBottomSheet';
import SortBottomSheet from '../components/SortBottomSheet';
import { useFilterState, FilterState } from '../hooks/useFilterState';

type SortType = 'newest' | 'oldest' | 'capital_desc' | 'capital_asc' | 'rate_desc' | 'return_desc';

const SORT_OPTIONS: { key: SortType; label: string }[] = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'oldest', label: 'Cũ nhất' },
  { key: 'capital_desc', label: 'Vốn cao → thấp' },
  { key: 'capital_asc', label: 'Vốn thấp → cao' },
  { key: 'rate_desc', label: 'Lãi suất cao nhất' },
  { key: 'return_desc', label: 'Tổng trả cao nhất' },
];

function getSortParams(s: SortType): { sortBy: FilterState['sortBy']; sortOrder: 'asc' | 'desc' } {
  switch (s) {
    case 'newest': return { sortBy: 'createdAt', sortOrder: 'desc' };
    case 'oldest': return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'capital_desc': return { sortBy: 'capital', sortOrder: 'desc' };
    case 'capital_asc': return { sortBy: 'capital', sortOrder: 'asc' };
    case 'rate_desc': return { sortBy: 'monthlyRatePercent', sortOrder: 'desc' };
    case 'return_desc': return { sortBy: 'entirelyPay', sortOrder: 'desc' };
  }
}

function fmt(n: number): string { return n.toLocaleString('vi-VN') + ' ₫'; }

export default function AvailableLoansScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [loans, setLoans] = useState<AvailableLoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [sortType, setSortType] = useState<SortType>('newest');
  const [showSort, setShowSort] = useState(false);
  const BASE_UNIT_PRICE = 500_000;

  const {
    filters, page, pageSize,
    setFilter, setMultipleFilters, resetFilters,
    activeFilterCount, buildQueryParams, setPage,
  } = useFilterState();

  // Fetch loans with current filter params
  const fetchLoans = useCallback(async () => {
    try {
      const params = buildQueryParams();
      const result = await investService.getAvailableLoans(params);
      setLoans(result.loans);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (e: any) {
      console.error('Failed to fetch available loans:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildQueryParams]);

  // Fetch when filters or page change
  useEffect(() => {
    setLoading(true);
    fetchLoans();
  }, [filters, page]);

  // Also refetch on screen focus (page 1)
  useFocusEffect(useCallback(() => {
    setPage(1);
  }, []));

  // Pull-to-refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (page === 1) {
      // page đã là 1 → useEffect không trigger → gọi trực tiếp
      fetchLoans();
    } else {
      setPage(1); // useEffect sẽ trigger fetchLoans
    }
  }, [page, fetchLoans, setPage]);

  // Pagination handlers
  const goToPrev = useCallback(() => {
    if (page > 1) setPage(page - 1);
  }, [page, setPage]);

  const goToNext = useCallback(() => {
    if (page < totalPages) setPage(page + 1);
  }, [page, totalPages, setPage]);

  const onSort = (s: SortType) => {
    setSortType(s);
    setShowSort(false);
    const { sortBy, sortOrder } = getSortParams(s);
    setMultipleFilters({ sortBy, sortOrder });
  };

  const sortLabel = SORT_OPTIONS.find(s => s.key === sortType)?.label || 'Mới nhất';

  const renderItem = ({ item }: { item: AvailableLoanItem }) => {
    const annualRate = (item.monthlyRatePercent * 12).toFixed(1);
    const riskLevel = item.aiScore?.riskLevel || '';
    const grade = item.aiScore?.grade || '';
    
    // Progress calculation logic
    const totalNotes = item.totalNotes || Math.ceil(item.capital / 500000);
    const totalClaimed = (item.nodeMatch || 0) + (item.investedNotes || 0);
    const pct = totalNotes > 0 ? Math.min(100, Math.round((totalClaimed / totalNotes) * 100)) : 0;
    
    // Khả năng trả đúng hạn = evaluationScore (0-100) trực tiếp từ aiScore.
    // creditScore ở đây là evaluationScore đã được loan.service map từ PD model về thang 0-100.
    const repayProb =
      typeof item.aiScore?.creditScore === 'number'
        ? Math.max(0, Math.min(100, item.aiScore.creditScore)).toFixed(0)
        : null;

    return (
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>
        {/* ── Header: Purpose & Rate ── */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.leftHeaderPart}>
              <Text style={[styles.editorialLabel, { color: theme.colors.textSecondary }]}>MỤC ĐÍCH VAY</Text>
              <Text style={[styles.cardTitleText, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                {item.willing || 'Vay tiêu dùng cá nhân'}
              </Text>
            </View>
          </View>
          <View style={styles.rightHeaderPart}>
            <Text style={[styles.editorialLabel, { color: theme.colors.primary }]}>LÃI SUẤT</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[styles.rateValueText, { color: theme.colors.primary }]}>
                {item.fdMonthlyRate || item.monthlyRatePercent}%
              </Text>
              <Text style={[styles.rateUnitText, { color: theme.colors.textSecondary }]}>/tháng</Text>
            </View>
          </View>
        </View>

        {/* ── Premium Metrics Grid (3 columns) ── */}
        <View style={styles.premiumMetricsGrid}>
          <View style={styles.premiumMetricCell}>
            <Text style={[styles.editorialMiniLabel, { color: theme.colors.textSecondary }]}>KHOẢN VAY</Text>
            <Text style={[styles.premiumMetricValue, { color: theme.colors.textPrimary }]}>{fmt(item.capital / 1000000).replace(' ₫', '')}M</Text>
          </View>
          <View style={styles.premiumMetricCell}>
            <Text style={[styles.editorialMiniLabel, { color: theme.colors.textSecondary }]}>KỲ HẠN</Text>
            <Text style={[styles.premiumMetricValue, { color: theme.colors.textPrimary }]}>{item.periodMonth} Tháng</Text>
          </View>
          <View style={styles.premiumMetricCell}>
            <Text style={[styles.editorialMiniLabel, { color: theme.colors.textSecondary }]}>HÀNG THÁNG</Text>
            <Text style={[styles.premiumMetricValue, { color: theme.colors.textPrimary }]}>~{fmt(item.entirelyPay / (item.periodMonth || 1) / 1000000).replace(' ₫', '')}M</Text>
          </View>
        </View>

        {/* ── AI Insight Banner ── */}
        {item.aiScore && (
          <View style={[styles.aiInsightBanner, { backgroundColor: theme.colors.surfaceLight || '#1E2D26' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.aiTitle, { color: theme.colors.primary }]}>
                Khả năng trả đúng hạn: {repayProb}%
              </Text>
              <Text style={[styles.aiSubtitle, { color: theme.colors.textSecondary }]}>
                Hạng {grade || 'A'} ({riskLevel === 'LOW' ? 'Rủi ro thấp' : 'Ổn định'})
              </Text>
            </View>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={theme.colors.primary} />
          </View>
        )}

        {/* ── Progress Section ── */}
        <View style={styles.modernProgressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.modernProgressLabel, { color: theme.colors.textSecondary }]}>Tiến độ gọi vốn</Text>
            <Text style={[styles.modernProgressValue, { color: theme.colors.primary }]}>{pct}%</Text>
          </View>
          <View style={[styles.modernProgressBarTrack, { backgroundColor: theme.colors.border + '30' }]}>
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primary + 'CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.modernProgressBarFill, { width: `${pct}%` }]}
            />
          </View>
        </View>

        {/* ── Quick Stats Footer ── */}
        <View style={styles.cardFooter}>
          <Text style={[styles.idText, { color: theme.colors.textMuted }]}>
            Mã #{item._id?.slice(-4)?.toUpperCase()} • {item.borrowerSignedVerified ? '✅ Đã xác minh' : 'Đã thẩm định'}
          </Text>
          <TouchableOpacity 
            onPress={() => navigation.navigate('InvestmentFlow', { loan: item })}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[theme.colors.primary, '#1E3A2F']} // Lime to Deep Emerald gradient for pop
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionBtn}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={18} color="#FFF" />
              <Text style={[styles.primaryActionText, { color: '#FFF' }]}>ĐẦU TƯ NGAY</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="file-search-outline" size={64} color={theme.colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Chưa có khoản vay nào</Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          Hiện tại chưa có khoản vay nào đang mở cho đầu tư. Hãy quay lại sau.
        </Text>
      </View>
    );
  };

  // Header right components
  const HeaderRight = () => (
    <TouchableOpacity onPress={() => setFilterSheetVisible(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <View>
        <MaterialCommunityIcons name="tune-variant" size={22} color={theme.colors.text} />
        {activeFilterCount > 0 && (
          <View style={[styles.filterBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.filterBadgeText, { color: theme.colors.background }]}>{activeFilterCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* ── Shared Header ── */}
      <BinanceHeader
        mode="standard"
        title="Cơ hội đầu tư"
        showBack={false}
        rightComponents={<HeaderRight />}
      />




      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={loans}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              {/* Sort header Row */}
              <View style={styles.sortRow}>
                <Text style={[styles.sortResultText, { color: theme.colors.textSecondary }]}>
                  {totalCount} khoản vay
                </Text>
                <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(true)} activeOpacity={0.7}>
                  <Text style={[styles.sortBtnText, { color: theme.colors.textSecondary }]}>{sortLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <FintechPagination
                mode="page"
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={setPage}
              />
            ) : null
          }
        />
      )}

      {/* ── Filter Bottom Sheet ── */}
      <FilterBottomSheet
        visible={filterSheetVisible}
        filters={filters}
        onApply={setMultipleFilters}
        onReset={resetFilters}
        onClose={() => setFilterSheetVisible(false)}
      />
      {/* ── Sort Bottom Sheet ── */}
      <SortBottomSheet
        visible={showSort}
        options={SORT_OPTIONS}
        currentSort={sortType}
        onSelect={onSort}
        onClose={() => setShowSort(false)}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Sort row
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sortResultText: { fontSize: 13, fontWeight: '500' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortBtnText: { fontSize: 13, fontWeight: '600' },
  sortMenu: { borderRadius: 14, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  sortItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  sortItemText: { fontSize: 14, fontWeight: '500' },

  // Count chip
  countChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: 13, fontWeight: '700' },
  filterBadge: { position: 'absolute', top: -4, right: -6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 9, fontWeight: '700' },

  // Card — Editorial Premium Style
  card: {
    borderRadius: 24, padding: 24, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)',
  },

  // Editorial Header
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leftHeaderPart: { flex: 1, gap: 4 },
  rightHeaderPart: { alignItems: 'flex-end', gap: 2 },
  editorialLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  cardTitleText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  rateValueText: { fontSize: 24, fontWeight: '800' },
  rateUnitText: { fontSize: 12, fontWeight: '500', marginLeft: 2 },

  // Premium Metrics Grid (3 columns)
  premiumMetricsGrid: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20, paddingVertical: 12 },
  premiumMetricCell: { flex: 1, gap: 2 },
  editorialMiniLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  premiumMetricValue: { fontSize: 16, fontWeight: '700' },

  // AI Insight Banner
  aiInsightBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, width: '100%', marginBottom: 20 },
  aiTitle: { fontSize: 12, fontWeight: '700' },
  aiSubtitle: { fontSize: 10, fontWeight: '600' },

  // Modern Progress
  modernProgressSection: { width: '100%', gap: 8, marginBottom: 20 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  modernProgressLabel: { fontSize: 11, fontWeight: '600' },
  modernProgressValue: { fontSize: 11, fontWeight: '700' },
  modernProgressBarTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  modernProgressBarFill: { height: '100%', borderRadius: 3 },

  // Card Footer
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  idText: { fontSize: 11, fontWeight: '500', flex: 1 },
  primaryActionBtn: { 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#CDEA2D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryActionText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  // ── Bottom Sheet Modal ──
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36,
  },
  handleBar: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },

  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, marginBottom: 20 },

  // Counter
  counterContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, padding: 16, marginBottom: 16, gap: 24,
  },
  counterBtn: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  counterCenter: { alignItems: 'center' },
  counterValue: { fontSize: 22, fontWeight: '700' },
  counterLabel: { fontSize: 12, marginTop: 2 },

  // Quick select
  quickSelectRow: { flexDirection: 'row', gap: 8, marginBottom: 16, justifyContent: 'center' },
  quickSelectBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1,
  },
  quickSelectText: { fontSize: 13, fontWeight: '600' },

  // Summary
  summaryBox: { borderRadius: 12, padding: 14, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 14, fontWeight: '700' },

  // Sheet actions
  sheetActions: { flexDirection: 'row', gap: 10 },

  // Wallet selector
  // Footer (pagination moved to shared component)

  walletSectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  walletCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 12, padding: 14, borderWidth: 1.5,
  },
  walletCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletCardName: { fontSize: 14, fontWeight: '600' },
  walletCardAcct: { fontSize: 11, marginTop: 1 },
  walletCardBalance: { fontSize: 14, fontWeight: '700' },
  walletCardText: { fontSize: 13, fontWeight: '500' },
});
