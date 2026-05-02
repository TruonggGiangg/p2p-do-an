import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, FintechPagination } from '../../../components';
import SortBottomSheet from '../components/SortBottomSheet';
import investService, { InvestmentOrderItem } from '../services/invest.service';

const PAGE_SIZE = 10;

type StatusFilter = 'all' | 'open' | 'closed';
type SortType = 'newest' | 'oldest' | 'capital_desc' | 'capital_asc' | 'match_desc';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'open', label: 'Đang mở' },
  { key: 'closed', label: 'Đã đóng' },
];

const SORT_OPTIONS: { key: SortType; label: string }[] = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'oldest', label: 'Cũ nhất' },
  { key: 'capital_desc', label: 'Vốn cao → thấp' },
  { key: 'capital_asc', label: 'Vốn thấp → cao' },
  { key: 'match_desc', label: 'Phần trăm ghép cao nhất' },
];

function getSortParams(s: SortType) {
  switch (s) {
    case 'newest': return { sortBy: 'createdAt', sortOrder: 'desc' as const };
    case 'oldest': return { sortBy: 'createdAt', sortOrder: 'asc' as const };
    case 'capital_desc': return { sortBy: 'capital', sortOrder: 'desc' as const };
    case 'capital_asc': return { sortBy: 'capital', sortOrder: 'asc' as const };
    case 'match_desc': return { sortBy: 'matchedCapital', sortOrder: 'desc' as const };
  }
}

const fmtVND = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')}M ₫`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K ₫`;
  return `${v.toLocaleString('vi-VN')} ₫`;
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
};

export default function InvestmentOrderListScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const nav = useNavigation<any>();

  const [orders, setOrders] = useState<InvestmentOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortType, setSortType] = useState<SortType>('newest');
  const [showSort, setShowSort] = useState(false);

  const fetchOrders = useCallback(async (pg = 1, refresh = false, filt?: StatusFilter, sort?: SortType) => {
    try {
      if (refresh) setRefreshing(true);
      else if (pg > 1) setLoadingMore(true);
      else setLoading(true);

      const f = filt ?? statusFilter;
      const st = sort ?? sortType;
      const { sortBy, sortOrder } = getSortParams(st);

      const res = await investService.getInvestmentOrders({
        page: pg, pageSize: PAGE_SIZE, sortBy, sortOrder,
        status: f === 'all' ? undefined : f,
      });
      const items = res.orders || [];
      setOrders(pg === 1 ? items : prev => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE && res.currentPage < res.totalPages);
      setPage(pg);
    } catch { } finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [statusFilter, sortType]);

  useFocusEffect(useCallback(() => { fetchOrders(1); }, [fetchOrders]));

  const onFilter = (f: StatusFilter) => { setStatusFilter(f); fetchOrders(1, false, f, sortType); };
  const onSort = (s: SortType) => { setSortType(s); setShowSort(false); fetchOrders(1, false, statusFilter, s); };

  const stats = useMemo(() => ({
    total: orders.reduce((a, o) => a + o.capital, 0),
    matched: orders.reduce((a, o) => a + o.matchedCapital, 0),
    open: orders.filter(o => o.status !== 'closed').length,
  }), [orders]);

  /* ── Order Card (Stitch premium design) ── */
  const renderItem = ({ item }: { item: InvestmentOrderItem }) => {
    const isClosed = item.status === 'closed';
    const matchPct = item.capital > 0 ? Math.round((item.matchedCapital / item.capital) * 100) : 0;
    const remaining = item.capital - item.matchedCapital;

    // Status visual
    const statusBg = isClosed ? c.textMuted + '15' : c.success + '15';
    const statusClr = isClosed ? c.textSecondary : c.success;
    const Svg = require('react-native-svg').default;
    const Circle = require('react-native-svg').Circle;

    return (
      <View style={[st.card, { backgroundColor: c.backgroundSecondary }]}>
        {/* ── Header Row ── */}
        <View style={st.cardHeader}>
          <View style={st.cardTitleRow}>
            <View style={[st.purposeIcon, { backgroundColor: isClosed ? c.textMuted + '15' : c.primary + '15' }]}>
              <MaterialCommunityIcons
                name={isClosed ? "lock-outline" : "briefcase-check-outline"}
                size={22}
                color={isClosed ? c.textMuted : c.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.cardTitle, { color: c.text }]} numberOfLines={1}>
                {item.name || `Lệnh #${item._id.slice(-6)}`}
              </Text>
              <Text style={[st.cardSubtitle, { color: c.textMuted }]}>
                {fmtDate((item as any).createdAt)}
              </Text>
            </View>
          </View>
          <View style={[st.statusBadge, { backgroundColor: statusBg }]}>
            <View style={[st.statusDot, { backgroundColor: statusClr }]} />
            <Text style={[st.statusText, { color: statusClr }]}>
              {isClosed ? 'ĐÓNG' : 'MỞ'}
            </Text>
          </View>
        </View>

        {/* ── Key Metrics 2x2 Grid ── */}
        <View style={[st.metricsGrid, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }]}>
          <View style={st.metricItem}>
            <Text style={[st.metricLabel, { color: c.textSecondary }]}>GIÁ TRỊ LỆNH</Text>
            <Text style={[st.metricValue, { color: c.textPrimary }]}>{fmtVND(item.capital)}</Text>
          </View>
          <View style={[st.metricItem, st.metricItemRight]}>
            <Text style={[st.metricLabel, { color: c.textSecondary }]}>MỤC TIÊU LÃI</Text>
            <Text style={[st.metricValue, { color: c.primary }]}>
              {item.interestRange ? `${item.interestRange.min}%-${item.interestRange.max}%` : '—'}
            </Text>
          </View>
          <View style={[st.metricItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.textMuted + '15' }]}>
            <Text style={[st.metricLabel, { color: c.textSecondary }]}>KỲ HẠN</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[st.metricValue, { color: c.textPrimary }]}>
                {item.periodRange ? `${item.periodRange.min}-${item.periodRange.max}` : '—'}
              </Text>
              <Text style={[st.metricUnit, { color: c.textSecondary }]}>tháng</Text>
            </View>
          </View>
          <View style={[st.metricItem, st.metricItemRight, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.textMuted + '15' }]}>
            <Text style={[st.metricLabel, { color: c.textSecondary }]}>SỐ KHOẢN VAY</Text>
            <Text style={[st.metricValue, { color: c.textPrimary }]}>{item.loans?.length || 0}</Text>
          </View>
        </View>

        {/* ── Investment Progress (Donut) ── */}
        <View style={[st.progressSection, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }]}>
          <View style={st.progressHeader}>
            <Text style={[st.progressLabel, { color: c.textSecondary }]}>TIẾN ĐỘ GHÉP VỐN</Text>
            <Text style={[st.progressValue, { color: c.primary }]}>{fmtVND(item.matchedCapital)} / {fmtVND(item.capital)}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: c.textMuted + '15', marginBottom: 12 }} />

          {(() => {
            const SIZE = 66;
            const STROKE = 6;
            const R = (SIZE - STROKE) / 2;
            const C = 2 * Math.PI * R;
            const matchPctVal = item.capital > 0 ? item.matchedCapital / item.capital : 0;
            const availablePct = 1 - matchPctVal;

            const gap = 0.01;
            const matchLen = matchPctVal * C;
            const availableLen = Math.max(0, availablePct * C - (matchPctVal > 0 ? gap * C : 0));

            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{ width: SIZE, height: SIZE }}>
                  <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                    <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={c.textMuted + '15'} strokeWidth={STROKE} fill="none" />
                    {availableLen > 0 && (
                      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={c.textMuted + '30'} strokeWidth={STROKE} fill="none"
                        strokeDasharray={`${availableLen} ${C - availableLen}`} strokeDashoffset={-matchLen - gap * C} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                    )}
                    {matchLen > 0 && (
                      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={c.success} strokeWidth={STROKE + 1} fill="none"
                        strokeDasharray={`${matchLen} ${C - matchLen}`} strokeDashoffset={0} strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`} />
                    )}
                  </Svg>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{matchPct}%</Text>
                  </View>
                </View>

                <View style={{ flex: 1, gap: 0 }}>
                  <View style={st.legendRow}>
                    <View style={[st.legendDot, { backgroundColor: c.success }]} />
                    <Text style={[st.legendText, { color: c.textSecondary }]}>Đã ghép</Text>
                    <Text style={[st.legendVal, { color: c.success }]}>{fmtVND(item.matchedCapital)}</Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: c.textMuted + '10', marginVertical: 6 }} />
                  <View style={st.legendRow}>
                    <View style={[st.legendDot, { backgroundColor: c.textMuted + '50' }]} />
                    <Text style={[st.legendText, { color: c.textSecondary }]}>Chờ duyệt</Text>
                    <Text style={[st.legendVal, { color: c.text }]}>{fmtVND(remaining)}</Text>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>

        {/* ── Action Button ── */}
        <TouchableOpacity
          style={[st.filledBtn, { backgroundColor: c.primary }]}
          onPress={() => nav.navigate('InvestmentOrderDetail', { orderId: item._id })}
          activeOpacity={0.7}
        >
          <Ionicons name="eye-outline" size={16} color={c.onPrimary || '#fff'} />
          <Text style={[st.filledBtnText, { color: c.onPrimary || '#fff' }]}>Xem chi tiết</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={st.emptyWrap}>
        <View style={[st.emptyIcon, { backgroundColor: c.backgroundSecondary }]}>
          <Ionicons name="trending-up" size={56} color={c.primary} />
        </View>
        <Text style={[st.emptyTitle, { color: c.text }]}>Chưa có lệnh đầu tư nào</Text>
        <Text style={[st.emptySub, { color: c.textSecondary }]}>Tạo lệnh để hệ thống tự ghép khoản vay phù hợp.</Text>
        <TouchableOpacity style={[st.emptyBtn, { backgroundColor: c.primary }]} onPress={() => nav.navigate('InvestmentOrderCreate')}>
          <Ionicons name="add" size={20} color={c.onPrimary || '#fff'} />
          <Text style={[st.emptyBtnText, { color: c.onPrimary || '#fff' }]}>Tạo lệnh đầu tư</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const sortLabel = SORT_OPTIONS.find(s => s.key === sortType)?.label || 'Mới nhất';

  return (
    <View style={[st.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      <BinanceHeader
        mode="standard" title="Lệnh đầu tư" showBack={false}
        rightComponents={
          <TouchableOpacity onPress={() => nav.navigate('InvestmentOrderCreate')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="add" size={24} color={c.text} />
          </TouchableOpacity>
        }
      />

      {loading && !refreshing && orders.length === 0 ? (
        <View style={st.loadingWrap}><ActivityIndicator size="large" color={c.primary} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListHeaderComponent={
            <View>
              <View style={st.filterSortRow}>
                <View style={st.filterRow}>
                  {STATUS_FILTERS.map(f => {
                    const active = statusFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[st.filterChip, { backgroundColor: active ? c.primary : c.backgroundSecondary, borderColor: active ? c.primary : (c.border || 'transparent') }]}
                        onPress={() => onFilter(f.key)} activeOpacity={0.7}
                      >
                        <Text style={[st.filterText, { color: active ? (c.onPrimary || '#FFF') : c.textSecondary }]}>{f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={[st.sortBtn, { backgroundColor: c.backgroundSecondary, borderColor: c.border || 'transparent', borderWidth: 1 }]} onPress={() => setShowSort(true)} activeOpacity={0.7}>
                  <Text style={[st.sortBtnText, { color: c.textSecondary }]}>{sortLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color={c.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={orders.length === 0 ? st.emptyListContent : st.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOrders(1, true)} tintColor={c.primary} />}
          onEndReached={() => { if (!loadingMore && hasMore && !loading) fetchOrders(page + 1); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            <FintechPagination
              mode="infinite"
              loading={loadingMore}
              hasMore={hasMore}
            />
          }
        />
      )}

      {/* FAB */}
      {orders.length > 0 && (
        <TouchableOpacity style={[st.fab, { backgroundColor: c.primary }]} onPress={() => nav.navigate('InvestmentOrderCreate')} activeOpacity={0.8}>
          <Ionicons name="add" size={28} color={c.onPrimary || '#2C3400'} />
        </TouchableOpacity>
      )}
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

const st = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  emptyListContent: { flexGrow: 1 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  statLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  statVal: { fontSize: 15, fontWeight: '700' },

  // Filter + Sort row
  filterSortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  sortBtnText: { fontSize: 12, fontWeight: '600' },

  // Sort menu
  sortMenu: { borderRadius: 12, marginBottom: 12, overflow: 'hidden', elevation: 2 },
  sortItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  sortItemText: { fontSize: 13, fontWeight: '500' },

  // ─── CARD (STITCH DESIGN - MATCHES AVAILABLE LOANS) ───
  card: {
    borderRadius: 22, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 18, marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#00110D', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingHorizontal: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  purposeIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  cardSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 2, letterSpacing: 0.3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Metrics Grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  metricItem: { width: '50%', paddingVertical: 16, paddingHorizontal: 20 },
  metricItemRight: { alignItems: 'flex-end' },
  metricLabel: { fontSize: 10, marginBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600' },
  metricValue: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  metricUnit: { fontSize: 12, fontWeight: '500' },

  // Progress (Donut)
  progressSection: { borderRadius: 16, padding: 14, marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  progressValue: { fontSize: 13, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: '500', flex: 1 },
  legendVal: { fontSize: 12, fontWeight: '700' },

  // CTA Button
  filledBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 14, borderRadius: 14,
    shadowColor: '#CDEA2D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  filledBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  // Empty
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 100 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 28 },
  emptyBtnText: { fontSize: 14, fontWeight: '700' },



  fab: {
    position: 'absolute', right: 20, bottom: 120,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
  },
});
