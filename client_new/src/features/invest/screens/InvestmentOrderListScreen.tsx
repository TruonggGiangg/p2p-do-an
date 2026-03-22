import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
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

  /* ── Order Card (Stitch design) ── */
  const renderItem = ({ item }: { item: InvestmentOrderItem }) => {
    const matchPct = item.totalNodes > 0 ? Math.round((item.matchedNodes / item.totalNodes) * 100) : 0;
    const isClosed = item.status === 'closed';
    const accent = isClosed ? (c.success || '#4edea3') : c.primary;
    const statusClr = isClosed ? '#EF4444' : (c.success || '#4edea3');

    return (
      <TouchableOpacity
        style={[st.card, { backgroundColor: c.backgroundSecondary }]}
        onPress={() => nav.navigate('InvestmentOrderDetail', { orderId: item._id })}
        activeOpacity={0.7}
      >
        {/* ─ Top: Icon + Name + Status ─ */}
        <View style={st.cardTop}>
          <View style={[st.iconCircle, { backgroundColor: accent + '15' }]}>
            <MaterialCommunityIcons
              name={isClosed ? 'lock-outline' : 'briefcase-outline'}
              size={18} color={accent}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[st.cardName, { color: c.text }]} numberOfLines={1}>
              {item.name || `Lệnh #${item._id.slice(-6)}`}
            </Text>
            <Text style={[st.cardDate, { color: c.textMuted || c.textSecondary }]}>
              {fmtDate((item as any).createdAt)}
            </Text>
          </View>
          <View style={[st.statusPill, { backgroundColor: statusClr + '18' }]}>
            <View style={[st.statusDot, { backgroundColor: statusClr }]} />
            <Text style={[st.statusLabel, { color: statusClr }]}>
              {isClosed ? 'ĐÓNG' : 'MỞ'}
            </Text>
          </View>
        </View>

        {/* ─ Middle: Progress ─ */}
        <View style={st.progressSection}>
          <View style={st.progressHeader}>
            <Text style={[st.progressPctText, { color: accent }]}>
              Đã ghép {matchPct}%
            </Text>
            <Text style={[st.progressAmountText, { color: c.textMuted || c.textSecondary }]}>
              {item.matchedCapital.toLocaleString('vi-VN')} / {item.capital.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
          <View style={[st.progressTrack, { backgroundColor: (c.textMuted || '#999') + '15' }]}>
            <View style={[st.progressFill, {
              width: `${Math.max(matchPct, 1)}%`,
              backgroundColor: accent,
            }]} />
          </View>
        </View>

        {/* ─ Bottom: 3-col info strip ─ */}
        <View style={[st.infoStrip, { backgroundColor: (c.textMuted || '#999') + '08' }]}>
          <View style={st.infoCol}>
            <View style={st.infoLabelRow}>
              <Ionicons name="cash-outline" size={12} color={c.textSecondary} />
              <Text style={[st.infoLabel, { color: c.textSecondary }]}>Vốn</Text>
            </View>
            <Text style={[st.infoValue, { color: c.text }]}>{fmtVND(item.capital)}</Text>
          </View>
          <View style={[st.infoDivider, { backgroundColor: (c.textMuted || '#999') + '20' }]} />
          <View style={st.infoCol}>
            <View style={st.infoLabelRow}>
              <Ionicons name="layers-outline" size={12} color={c.textSecondary} />
              <Text style={[st.infoLabel, { color: c.textSecondary }]}>Khoản vay</Text>
            </View>
            <Text style={[st.infoValue, { color: c.text }]}>{item.loans?.length || 0}</Text>
          </View>
          <View style={[st.infoDivider, { backgroundColor: (c.textMuted || '#999') + '20' }]} />
          <View style={st.infoCol}>
            <View style={st.infoLabelRow}>
              <Ionicons name="trending-up-outline" size={12} color={c.textSecondary} />
              <Text style={[st.infoLabel, { color: c.textSecondary }]}>Khoản lãi</Text>
            </View>
            <Text style={[st.infoValue, { color: c.primary }]}>
              {(() => {
                const ir = item.interestRange;
                const pr = item.periodRange;
                if (!ir || !pr || !item.matchedCapital) return '—';
                const avgRate = (ir.min + ir.max) / 2 / 100;
                const avgPeriod = (pr.min + pr.max) / 2;
                const est = Math.round(item.matchedCapital * avgRate * avgPeriod);
                return fmtVND(est);
              })()}
            </Text>
          </View>
        </View>

        {/* Chevron */}
        <View style={st.chevron}>
          <Ionicons name="chevron-forward" size={14} color={(c.textMuted || '#999') + '50'} />
        </View>
      </TouchableOpacity>
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
            <Ionicons name="add" size={28} color={c.text} />
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
              {/* Stats */}
              <View style={st.statsRow}>
                <View style={[st.statCard, { backgroundColor: c.backgroundSecondary }]}>
                  <Text style={[st.statLbl, { color: c.textSecondary }]}>TỔNG VỐN</Text>
                  <Text style={[st.statVal, { color: c.text }]}>{fmtVND(stats.total)}</Text>
                </View>
                <View style={[st.statCard, { backgroundColor: c.backgroundSecondary }]}>
                  <Text style={[st.statLbl, { color: c.textSecondary }]}>ĐÃ GHÉP</Text>
                  <Text style={[st.statVal, { color: c.primary }]}>{fmtVND(stats.matched)}</Text>
                </View>
                <View style={[st.statCard, { backgroundColor: c.backgroundSecondary }]}>
                  <Text style={[st.statLbl, { color: c.textSecondary }]}>LỆNH MỞ</Text>
                  <Text style={[st.statVal, { color: c.text }]}>{stats.open}</Text>
                </View>
              </View>

              {/* Filter + Sort — SAME ROW */}
              <View style={st.filterSortRow}>
                <View style={st.filterRow}>
                  {STATUS_FILTERS.map(f => {
                    const active = statusFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[st.filterChip, { backgroundColor: active ? c.primary : c.backgroundSecondary }]}
                        onPress={() => onFilter(f.key)} activeOpacity={0.7}
                      >
                        <Text style={[st.filterText, { color: active ? (c.onPrimary || '#2C3400') : c.text }]}>{f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={st.sortBtn} onPress={() => setShowSort(!showSort)} activeOpacity={0.7}>
                  <Text style={[st.sortBtnText, { color: c.textSecondary }]}>{sortLabel}</Text>
                  <Ionicons name={showSort ? 'chevron-up' : 'chevron-down'} size={14} color={c.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Sort dropdown */}
              {showSort && (
                <View style={[st.sortMenu, { backgroundColor: c.backgroundSecondary }]}>
                  {SORT_OPTIONS.map(opt => {
                    const active = sortType === opt.key;
                    return (
                      <TouchableOpacity key={opt.key} style={[st.sortItem, active && { backgroundColor: c.primary + '12' }]} onPress={() => onSort(opt.key)}>
                        <Text style={[st.sortItemText, { color: active ? c.primary : c.text }]}>{opt.label}</Text>
                        {active && <Ionicons name="checkmark" size={16} color={c.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={orders.length === 0 ? st.emptyListContent : st.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOrders(1, true)} tintColor={c.primary} />}
          onEndReached={() => { if (!loadingMore && hasMore && !loading) fetchOrders(page + 1); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ paddingVertical: 20 }} size="small" color={c.primary} />
              : orders.length > 0 && !hasMore ? <Text style={[st.endText, { color: c.textSecondary }]}>— Hết —</Text>
                : <View style={{ height: 80 }} />
          }
        />
      )}

      {/* FAB */}
      {orders.length > 0 && (
        <TouchableOpacity style={[st.fab, { backgroundColor: c.primary }]} onPress={() => nav.navigate('InvestmentOrderCreate')} activeOpacity={0.8}>
          <Ionicons name="add" size={28} color={c.onPrimary || '#2C3400'} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  statCard: { flex: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12 },
  statLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  statVal: { fontSize: 16, fontWeight: '800' },

  // Filter + Sort row
  filterSortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  filterText: { fontSize: 12, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortBtnText: { fontSize: 12, fontWeight: '500' },

  // Sort menu
  sortMenu: { borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  sortItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  sortItemText: { fontSize: 13, fontWeight: '500' },

  // ─── CARD (STITCH DESIGN) ───
  card: { borderRadius: 16, padding: 18, marginBottom: 12, position: 'relative' },

  // Card top
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDate: { fontSize: 11, marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '800' },

  // Card progress
  progressSection: { marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  progressPctText: { fontSize: 14, fontWeight: '700' },
  progressAmountText: { fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Card info strip
  infoStrip: { flexDirection: 'row', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  infoCol: { flex: 1, alignItems: 'center' },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  infoLabel: { fontSize: 10, fontWeight: '500' },
  infoValue: { fontSize: 14, fontWeight: '800' },
  infoDivider: { width: 1, height: 28 },

  // Chevron
  chevron: { position: 'absolute', right: 10, bottom: 16 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, marginTop: -40 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 28 },
  emptyBtnText: { fontSize: 16, fontWeight: '700' },

  endText: { textAlign: 'center', fontSize: 12, paddingVertical: 20 },

  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
  },
});
