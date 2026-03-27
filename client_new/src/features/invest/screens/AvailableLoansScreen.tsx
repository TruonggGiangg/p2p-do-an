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
import { BinanceHeader, Pagination } from '../../../components';
import investService, { AvailableLoanItem } from '../services/invest.service';
import FilterBar from '../components/FilterBar';
import FilterBottomSheet from '../components/FilterBottomSheet';
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
    const tier = item.aiScore?.tier || '';
    const grade = item.aiScore?.grade || '';
    const totalNotes = item.totalNotes || Math.ceil(item.capital / 500000);
    const nodeMatch = item.nodeMatch || 0;
    const invested = item.investedNotes || 0;
    const totalClaimed = nodeMatch + invested;
    const available = Math.max(0, totalNotes - totalClaimed);
    const pct = totalNotes > 0 ? Math.min(100, Math.round((totalClaimed / totalNotes) * 100)) : 0;
    const matchPct = totalNotes > 0 ? Math.min(100, Math.round((totalClaimed / totalNotes) * 100)) : 0;

    // Map tier and risk to theme tokens
    const tierColor = { Platinum: theme.colors.textMuted, Gold: theme.colors.warning, Silver: theme.colors.textSecondary, Basic: theme.colors.textDim }[tier] || theme.colors.textMuted;
    const riskColor = { LOW: theme.colors.success, MEDIUM: theme.colors.warning, HIGH: theme.colors.error, VERY_HIGH: theme.colors.error }[riskLevel] || theme.colors.textMuted;

    // Compute AI repayment probability display
    const repayProb = item.aiScore?.creditScore ? Math.min(99.9, 80 + (item.aiScore.creditScore / 50)).toFixed(1) : null;

    return (
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>

        {/* ── Header Row ── */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <LinearGradient
              colors={[theme.colors.primary + '30', theme.colors.success + '18']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.purposeIcon}
            >
              <MaterialCommunityIcons name="file-document-outline" size={20} color={theme.colors.primary} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {item.willing || 'Chưa xác định mục đích'}
              </Text>
              <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
                Mã #{item._id?.slice(-4)?.toUpperCase()} • Đã thẩm định
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, {
            backgroundColor: item.status === 'approved' ? theme.colors.successGlass : theme.colors.primaryGlass,
          }]}>
            <View style={[styles.statusDot, {
              backgroundColor: item.status === 'approved' ? theme.colors.success : theme.colors.primary,
            }]} />
            <Text style={[styles.statusText, {
              color: item.status === 'approved' ? theme.colors.success : theme.colors.primary,
            }]}>
              {item.status === 'approved' ? 'Đã xác minh' : 'Đang giải ngân'}
            </Text>
          </View>
        </View>

        {/* ── Key Metrics 2x2 Grid — tonal elevated surface ── */}
        <View style={[styles.metricsGrid, { backgroundColor: theme.colors.surfaceLight }]}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>GIÁ TRỊ KHOẢN VAY</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(item.capital)}</Text>
          </View>
          <View style={[styles.metricItem, styles.metricItemRight]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>LỢI SUẤT</Text>
            <Text style={[styles.metricValue, { color: theme.colors.primary }]}>
              {item.fdMonthlyRate || item.monthlyRatePercent}%
            </Text>
            <Text style={[styles.metricSubValue, { color: theme.colors.primary }]}>({item.fdInterestRate || annualRate}%/năm)</Text>
          </View>
          <View style={[styles.metricItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.textMuted + '15' }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>KỲ HẠN ĐẦU TƯ</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{item.periodMonth}</Text>
              <Text style={[styles.metricUnit, { color: theme.colors.textSecondary }]}>tháng</Text>
            </View>
          </View>
          <View style={[styles.metricItem, styles.metricItemRight, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.textMuted + '15' }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>TỔNG THU NHẬN</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(item.entirelyPay)}</Text>
          </View>
        </View>

        {/* ── AI Score Badges — Glassmorphism ── */}
        {item.aiScore && (
          <View style={styles.badgeRow}>
            {grade ? (
              <LinearGradient
                colors={[theme.colors.primary + '25', theme.colors.primary + '0D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <MaterialCommunityIcons name="shield-star" size={12} color={theme.colors.primary} />
                <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                  {grade}{item.aiScore.subGrade ? ` (${item.aiScore.subGrade})` : ''}
                </Text>
              </LinearGradient>
            ) : null}
            {tier ? (
              <LinearGradient
                colors={[tierColor + '25', tierColor + '0D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <MaterialCommunityIcons name="trophy" size={11} color={tierColor} />
                <Text style={[styles.badgeText, { color: tierColor }]}>{tier}</Text>
              </LinearGradient>
            ) : null}
            {riskLevel ? (
              <LinearGradient
                colors={[riskColor + '25', riskColor + '0D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <Ionicons name={riskLevel === 'LOW' ? 'shield-checkmark' : 'warning'} size={11} color={riskColor} />
                <Text style={[styles.badgeText, { color: riskColor }]}>
                  {riskLevel === 'LOW' ? 'An toàn' : riskLevel === 'MEDIUM' ? 'Trung bình' : 'Rủi ro cao'}
                </Text>
              </LinearGradient>
            ) : null}
          </View>
        )}

        {/* ── Delinquency / Risk Warning — Red alert for investors ── */}
        {item.borrowerDelinquencyWarning && item.borrowerDelinquencyWarning.debtGroup >= 2 && (
          <View style={[styles.warningBanner, { backgroundColor: theme.colors.error + '18', borderColor: theme.colors.error + '40' }]}>
            <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningTitle, { color: theme.colors.error }]}>
                Cảnh báo nợ xấu — Nhóm {item.borrowerDelinquencyWarning.debtGroup}
              </Text>
              <Text style={[styles.warningDesc, { color: theme.colors.error + 'CC' }]}>
                Quá hạn {item.borrowerDelinquencyWarning.delinquentDays} ngày • Dư nợ: {fmt(item.borrowerDelinquencyWarning.overdueAmount)}
              </Text>
            </View>
          </View>
        )}
        {!item.borrowerDelinquencyWarning && item.aiScore && (item.aiScore.creditScore > 0 && item.aiScore.creditScore < 431) && (
          <View style={[styles.warningBanner, { backgroundColor: theme.colors.warning + '15', borderColor: theme.colors.warning + '35' }]}>
            <Ionicons name="warning" size={14} color={theme.colors.warning} />
            <Text style={[styles.warningDesc, { color: theme.colors.warning }]}>
              Điểm tín dụng thấp — Rủi ro đầu tư cao hơn bình thường
            </Text>
          </View>
        )}

        {/* ── AI Insight Cards — Stitch "Bioluminescent" tonal sections ── */}
        {item.aiScore && (
          <View style={styles.insightRow}>
            <View style={[styles.insightCard, { backgroundColor: theme.colors.primary + '0D' }]}>
              <MaterialCommunityIcons name="shield-check" size={16} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: theme.colors.primary }]}>Bảo toàn vốn</Text>
                <Text style={[styles.insightDesc, { color: theme.colors.textMuted }]}>Ký quỹ hợp đồng thông minh</Text>
              </View>
            </View>
            {repayProb && (
              <View style={[styles.insightCard, { backgroundColor: theme.colors.success + '0D' }]}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={16} color={theme.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.insightTitle, { color: theme.colors.success }]}>{repayProb}%</Text>
                  <Text style={[styles.insightDesc, { color: theme.colors.textMuted }]}>Tỷ lệ hoàn vốn</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Investment Progress — Stitch Donut ── */}
        <View style={[styles.progressSection, { backgroundColor: theme.colors.surfaceLight }]}>
          {/* Header */}
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>TIẾN ĐỘ HUY ĐỘNG</Text>
            <Text style={[styles.progressValue, { color: theme.colors.primary }]}>
              {totalClaimed}/{totalNotes} phần
            </Text>
          </View>
          {/* Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.textMuted + '15', marginBottom: 12 }} />

          {/* Donut Ring (left) + Legend (right) */}
          {(() => {
            const SIZE = 66;
            const STROKE = 6;
            const R = (SIZE - STROKE) / 2;
            const C = 2 * Math.PI * R;
            const investedPct = totalNotes > 0 ? invested / totalNotes : 0;
            const matchPctVal = totalNotes > 0 ? nodeMatch / totalNotes : 0;
            const availablePct = 1 - investedPct - matchPctVal;
            const pctNum = totalNotes > 0 ? Math.round(((invested + nodeMatch) / totalNotes) * 100) : 0;

            const gap = 0.01;
            const investedLen = investedPct * C;
            const matchLen = matchPctVal * C;
            const availableLen = Math.max(0, availablePct * C - (investedPct > 0 ? gap * C : 0) - (matchPctVal > 0 ? gap * C : 0));
            const offset2 = investedLen + gap * C;
            const offset3 = offset2 + matchLen + gap * C;

            const Svg = require('react-native-svg').default;
            const Circle = require('react-native-svg').Circle;

            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {/* Ring */}
                <View style={{ width: SIZE, height: SIZE }}>
                  <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                    <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={theme.colors.textMuted + '15'} strokeWidth={STROKE} fill="none" />
                    {availableLen > 0 && (
                      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={theme.colors.textMuted + '30'} strokeWidth={STROKE} fill="none"
                        strokeDasharray={`${availableLen} ${C - availableLen}`} strokeDashoffset={-offset3} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                    )}
                    {matchLen > 0 && (
                      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={theme.colors.warning || '#F0B90B'} strokeWidth={STROKE} fill="none"
                        strokeDasharray={`${matchLen} ${C - matchLen}`} strokeDashoffset={-offset2} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                    )}
                    {investedLen > 0 && (
                      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={theme.colors.success} strokeWidth={STROKE + 1} fill="none"
                        strokeDasharray={`${investedLen} ${C - investedLen}`} strokeDashoffset={0} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                    )}
                  </Svg>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>{pctNum}%</Text>
                  </View>
                </View>
                {/* Legend */}
                <View style={{ flex: 1, gap: 0 }}>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} />
                    <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>Đã rót vốn</Text>
                    <Text style={[styles.legendVal, { color: theme.colors.success }]}>{invested}</Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: theme.colors.textMuted + '10', marginVertical: 6 }} />
                  {nodeMatch > 0 && (
                    <>
                      <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: theme.colors.warning || '#F0B90B' }]} />
                        <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>Giữ chỗ</Text>
                        <Text style={[styles.legendVal, { color: theme.colors.warning || '#F0B90B' }]}>{nodeMatch}</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: theme.colors.textMuted + '10', marginVertical: 6 }} />
                    </>
                  )}
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.textMuted + '50' }]} />
                    <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>Khả dụng</Text>
                    <Text style={[styles.legendVal, { color: theme.colors.text }]}>{available}</Text>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>

        {/* ── Action Button — Navigate to Investment Flow ── */}
        <TouchableOpacity
          style={[styles.filledBtn, { backgroundColor: theme.colors.primary, flex: undefined }]}
          onPress={() => navigation.navigate('InvestmentFlow', { loan: item })}
          disabled={available <= 0}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="rocket-launch" size={16} color={theme.colors.onPrimary} />
          <Text style={[styles.filledBtnText, { color: theme.colors.onPrimary }]}>Đầu tư sinh lời</Text>
        </TouchableOpacity>
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
              <View style={styles.sortRow}>
                <Text style={[styles.sortResultText, { color: theme.colors.textSecondary }]}>
                  {totalCount} khoản vay
                </Text>
                <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(!showSort)} activeOpacity={0.7}>
                  <Text style={[styles.sortBtnText, { color: theme.colors.textSecondary }]}>{sortLabel}</Text>
                  <Ionicons name={showSort ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {showSort && (
                <View style={[styles.sortMenu, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  {SORT_OPTIONS.map(opt => {
                    const active = sortType === opt.key;
                    return (
                      <TouchableOpacity key={opt.key} style={[styles.sortItem, active && { backgroundColor: theme.colors.primary + '12' }]} onPress={() => onSort(opt.key)}>
                        <Text style={[styles.sortItemText, { color: active ? theme.colors.primary : theme.colors.text }]}>{opt.label}</Text>
                        {active && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
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
              <Pagination
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


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
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

  // Card — Stitch "Bioluminescent Vault" tonal layering
  card: {
    borderRadius: 22, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 18, marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#00110D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },

  // Gradient accent line at top of card
  cardAccentLine: { height: 3, width: '100%', marginBottom: 16 },

  // Card Header — Stitch editorial style
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingHorizontal: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  purposeIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  cardSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 2, letterSpacing: 0.3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Metrics Grid — Stitch tonal elevation with generous spacing
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: 16, overflow: 'hidden', marginBottom: 14,
  },
  metricItem: { width: '50%', paddingVertical: 14, paddingHorizontal: 16 },
  metricItemRight: {},
  metricLabel: { fontSize: 10, marginBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600' },
  metricValue: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  metricSubValue: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  metricUnit: { fontSize: 12, fontWeight: '500' },

  // Badges — Stitch glassmorphism
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Delinquency / Risk Warning Banner
  warningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  warningTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  warningDesc: { fontSize: 11, fontWeight: '500', marginTop: 1, lineHeight: 16 },

  // AI Insight Cards — Stitch "Bioluminescent" tonal
  insightRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  insightCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
  },
  insightTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  insightDesc: { fontSize: 10, fontWeight: '500', marginTop: 1 },

  // Progress — Stitch segmented progress bar
  progressSection: { borderRadius: 16, padding: 14, marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  progressValue: { fontSize: 13, fontWeight: '700' },
  // Donut legend (right side)
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: '500', flex: 1 },
  legendVal: { fontSize: 12, fontWeight: '700' },

  // Action buttons — Stitch premium CTA with glow
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 14, borderRadius: 14,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700' },
  filledBtn: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 14, borderRadius: 14,
    shadowColor: '#CDEA2D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  filledBtnText: { color: '#0B1F1A', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

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
