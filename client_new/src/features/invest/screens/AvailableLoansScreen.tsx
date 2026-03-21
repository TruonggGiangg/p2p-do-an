/**
 * AvailableLoansScreen — Khoản vay đang cho phép đầu tư
 * Redesigned: Finesse Wallet theme (Deep Teal + Lime Green)
 * Supports both light & dark mode via useTheme() tokens.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import investService, { AvailableLoanItem } from '../services/invest.service';

function fmt(n: number): string { return n.toLocaleString('vi-VN') + ' ₫'; }

export default function AvailableLoansScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [loans, setLoans] = useState<AvailableLoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [investing, setInvesting] = useState<string | null>(null);

  const fetchLoans = useCallback(async () => {
    try {
      const result = await investService.getAvailableLoans({ pageSize: 20, sortOrder: 'desc' });
      setLoans(result.loans);
      setTotalCount(result.totalCount);
    } catch (e: any) {
      console.error('Failed to fetch available loans:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchLoans(); }, [fetchLoans]));

  const handleInvest = (item: AvailableLoanItem) => {
    const totalNotes = item.totalNotes || Math.ceil(item.capital / 500000);
    const available = Math.max(0, totalNotes - ((item.nodeMatch || 0) + (item.investedNotes || 0)));
    const numNotes = Math.min(available, totalNotes);

    Alert.alert(
      'Xác nhận đầu tư',
      `Đầu tư ${numNotes} notes (${fmt(numNotes * 500000)}) vào "${item.willing || 'N/A'}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đầu tư',
          onPress: async () => {
            try {
              setInvesting(item._id);
              const contract = await investService.createContract({ loanApplicationId: item._id, numNotes });
              Alert.alert('Thành công', `Hợp đồng ${contract.contractId} đã tạo`, [
                { text: 'Xem chi tiết', onPress: () => navigation.navigate('InvestmentContractDetail', { contractId: contract._id }) },
                { text: 'OK' },
              ]);
              fetchLoans();
            } catch (e: any) {
              Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tạo hợp đồng');
            } finally { setInvesting(null); }
          },
        },
      ],
    );
  };

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

    return (
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>
        {/* ── Header Row ── */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.purposeIcon, { backgroundColor: theme.colors.primaryGlass }]}>
              <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {item.willing || 'Chưa chỉ định mục đích'}
            </Text>
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
              {item.status === 'approved' ? 'Đã duyệt' : 'Giải ngân'}
            </Text>
          </View>
        </View>

        {/* ── Key Metrics 2x2 Grid — surfaceLight for tonal contrast ── */}
        <View style={[styles.metricsGrid, { backgroundColor: theme.colors.surfaceLight }]}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Số vốn</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(item.capital)}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Lãi suất đầu tư</Text>
            <Text style={[styles.metricValue, { color: theme.colors.primary }]}>
              {item.fdMonthlyRate || item.monthlyRatePercent}% <Text style={{ fontSize: 11, color: theme.colors.primary }}>({item.fdInterestRate || annualRate}%/năm)</Text>
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Kỳ hạn</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>
              {item.periodMonth} <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>tháng</Text>
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Tổng trả</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(item.entirelyPay)}</Text>
          </View>
        </View>

        {/* ── AI Score Badges ── */}
        {item.aiScore && (
          <View style={styles.badgeRow}>
            {grade ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.primaryGlass }]}>
                <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                  {grade}{item.aiScore.subGrade ? ` (${item.aiScore.subGrade})` : ''}
                </Text>
              </View>
            ) : null}
            {tier ? (
              <View style={[styles.badge, { backgroundColor: tierColor + '18' }]}>
                <MaterialCommunityIcons name="shield-check" size={10} color={tierColor} />
                <Text style={[styles.badgeText, { color: tierColor }]}>{tier}</Text>
              </View>
            ) : null}
            {riskLevel ? (
              <View style={[styles.badge, { backgroundColor: riskColor + '18' }]}>
                <Text style={[styles.badgeText, { color: riskColor }]}>
                  {riskLevel}
                </Text>
              </View>
            ) : null}
            {item.aiScore.creditScore > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.accentGlass }]}>
                <Text style={[styles.badgeText, { color: theme.colors.textSecondary }]}>CS:{item.aiScore.creditScore}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Investment Progress — tonal bg for contrast ── */}
        <View style={[styles.progressSection, { backgroundColor: theme.colors.surfaceLight }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>Tiến độ đầu tư</Text>
            <Text style={[styles.progressValue, { color: theme.colors.primary }]}>
              {totalClaimed}/{totalNotes} notes ({pct}%)
            </Text>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressOuter, { backgroundColor: theme.colors.accent }]}>
            <View style={[styles.progressInner, {
              width: `${matchPct}%`,
              backgroundColor: invested > 0 ? theme.colors.success : theme.colors.primary,
            }]} />
          </View>

          {/* Detail row */}
          <View style={styles.progressDetail}>
            <View style={styles.progressDetailItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} />
              <Text style={[styles.progressDetailText, { color: theme.colors.success }]}>Đã đầu tư: {invested}</Text>
            </View>
            {nodeMatch > 0 && (
              <View style={styles.progressDetailItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={[styles.progressDetailText, { color: theme.colors.primary }]}>Đang ghép: {nodeMatch}</Text>
              </View>
            )}
            <View style={styles.progressDetailItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.textMuted }]} />
              <Text style={[styles.progressDetailText, { color: theme.colors.textMuted }]}>
                Còn trống: {available}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.outlineBtn, { backgroundColor: theme.colors.primaryGlass }]}
            onPress={() => {
              navigation.navigate('SchedulePreview' as any, {
                loanApplicationId: item._id,
                numNotes: Math.min(available, totalNotes),
                loanTitle: item.willing || undefined,
              });
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={15} color={theme.colors.primary} />
            <Text style={[styles.outlineBtnText, { color: theme.colors.primary }]}>Xem trước</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filledBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleInvest(item)}
            disabled={investing === item._id}
            activeOpacity={0.7}
          >
            {investing === item._id ? (
              <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={15} color={theme.colors.onPrimary} />
                <Text style={[styles.filledBtnText, { color: theme.colors.onPrimary }]}>Đầu tư</Text>
              </>
            )}
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {totalCount > 0 && (
        <View style={[styles.countChip, { backgroundColor: theme.colors.primaryGlass }]}>
          <Text style={[styles.countText, { color: theme.colors.primary }]}>{totalCount}</Text>
        </View>
      )}
      <TouchableOpacity onPress={() => navigation.navigate('InvestmentStats' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <MaterialCommunityIcons name="chart-line" size={22} color={theme.colors.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('InvestmentContractList')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <MaterialCommunityIcons name="folder-outline" size={22} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* ── Shared Header ── */}
      <BinanceHeader
        mode="standard"
        title="Khoản vay cho đầu tư"
        showBack={true}
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLoans(); }} tintColor={theme.colors.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Count chip
  countChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: 13, fontWeight: '700' },

  // Card — backgroundSecondary for contrast with nested elements
  card: {
    borderRadius: 16, padding: 16, marginBottom: 14,
  },

  // Card Header
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  purposeIcon: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  // Metrics Grid — surfaceLight for visible tonal separation from card
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: 12, overflow: 'hidden', marginBottom: 12,
  },
  metricItem: { width: '50%', paddingVertical: 12, paddingHorizontal: 14 },
  metricLabel: { fontSize: 11, marginBottom: 3 },
  metricValue: { fontSize: 14, fontWeight: '700' },

  // Badges
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  // Progress — surfaceLight for contrast
  progressSection: { borderRadius: 12, padding: 12, marginBottom: 14 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 12, fontWeight: '500' },
  progressValue: { fontSize: 13, fontWeight: '700' },
  progressOuter: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressInner: { height: '100%', borderRadius: 3 },
  progressDetail: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  progressDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  progressDetailText: { fontSize: 11 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10 },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '600' },
  filledBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
  },
  filledBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
