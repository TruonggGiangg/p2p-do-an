import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import investService, { InvestmentContractItem } from '../services/invest.service';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Chờ xử lý', color: '#F59E0B' },
  active: { label: 'Đang hoạt động', color: '#10B981' },
  matured: { label: 'Đáo hạn', color: '#3B82F6' },
  closed: { label: 'Đã đóng', color: '#6B7280' },
};

function formatCurrency(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫';
}

export default function InvestmentContractListScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [contracts, setContracts] = useState<InvestmentContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchContracts = useCallback(async () => {
    try {
      const result = await investService.getContracts({ pageSize: 20 });
      setContracts(result.contracts);
      setTotalCount(result.totalCount);
    } catch (e: any) {
      console.error('Failed to fetch contracts:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchContracts(); }, [fetchContracts]));

  const renderItem = ({ item }: { item: InvestmentContractItem }) => {
    const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.pending;
    const paidPeriods = item.lenderSchedule?.filter(s => s.status === 'paid').length || 0;
    const totalPeriods = item.schedulePeriodCount || 0;
    const loanInfo = item.loanApplicationId;
    const loanPurpose = typeof loanInfo === 'object' ? loanInfo?.willing : '';

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}
        onPress={() => navigation.navigate('InvestmentContractDetail', { contractId: item._id })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="document-text" size={20} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.contractId, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {item.contractId}
              </Text>
              {loanPurpose ? (
                <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {loanPurpose}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Vốn đầu tư</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{formatCurrency(item.capital)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Lãi suất</Text>
            <Text style={[styles.value, { color: theme.colors.primary }]}>
              {item.monthlyRatePercent}%/tháng ({item.annualRatePercent.toFixed(1)}%/năm)
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Kỳ hạn</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{item.periodMonth} tháng</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Lợi nhuận</Text>
            <Text style={[styles.value, { color: '#10B981' }]}>{formatCurrency(item.entirelyProfit)}</Text>
          </View>
        </View>

        {/* Schedule progress */}
        {totalPeriods > 0 && (
          <View style={{ marginTop: 8 }}>
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Tiến độ</Text>
              <Text style={[styles.value, { color: theme.colors.primary }]}>
                {paidPeriods}/{totalPeriods} kỳ
              </Text>
            </View>
            <View style={[styles.progressOuter, { backgroundColor: theme.colors.border || '#E5E7EB' }]}>
              <View
                style={[styles.progressInner, {
                  width: `${Math.round((paidPeriods / totalPeriods) * 100)}%`,
                  backgroundColor: '#10B981',
                }]}
              />
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-outline" size={64} color={theme.colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Chưa có hợp đồng nào</Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          Đầu tư vào khoản vay để tạo hợp đồng ký quỹ đầu tư.
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Shared Header */}
      <BinanceHeader
        mode="standard"
        title="Hợp đồng đầu tư"
        showBack={true}
        rightComponents={
          totalCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.countBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                <Text style={[styles.countText, { color: theme.colors.primary }]}>{totalCount}</Text>
              </View>
            </View>
          ) : undefined
        }
      />

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={contracts}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchContracts(); }} tintColor={theme.colors.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  countBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  countText: { fontSize: 14, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  contractId: { fontSize: 11, fontWeight: '500' },
  cardTitle: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardBody: { gap: 5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  progressOuter: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressInner: { height: '100%', borderRadius: 2 },
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
