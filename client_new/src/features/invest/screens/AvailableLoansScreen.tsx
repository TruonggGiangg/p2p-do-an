import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import investService, { AvailableLoanItem } from '../services/invest.service';

const RISK_COLORS: Record<string, string> = {
  LOW: '#10B981',
  MEDIUM: '#F59E0B',
  HIGH: '#EF4444',
  VERY_HIGH: '#DC2626',
};

const TIER_COLORS: Record<string, string> = {
  Platinum: '#94A3B8',
  Gold: '#F59E0B',
  Silver: '#9CA3AF',
  Basic: '#78716C',
};

function formatCurrency(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫';
}

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
      const result = await investService.getAvailableLoans({
        pageSize: 20,
        sortOrder: 'desc',
      });
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
    const totalNotes = Math.ceil(item.capital / 500000);
    const available = totalNotes - (item.investedNotes || 0);
    const numNotes = Math.min(available, totalNotes);

    Alert.alert(
      'Xác nhận đầu tư',
      `Bạn muốn đầu tư ${numNotes} notes (${(numNotes * 500000).toLocaleString('vi-VN')} ₫) vào khoản vay "${item.willing || 'N/A'}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đầu tư',
          onPress: async () => {
            try {
              setInvesting(item._id);
              const contract = await investService.createContract({
                loanApplicationId: item._id,
                numNotes,
              });
              Alert.alert('Thành công', `Hợp đồng ${contract.contractId} đã tạo`, [
                { text: 'Xem chi tiết', onPress: () => navigation.navigate('InvestmentContractDetail', { contractId: contract._id }) },
                { text: 'OK' },
              ]);
              fetchLoans();
            } catch (e: any) {
              Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tạo hợp đồng');
            } finally {
              setInvesting(null);
            }
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

    return (
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
            <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {item.willing || 'Chưa chỉ định mục đích'}
            </Text>
          </View>
          <View style={[styles.statusBadge, {
            backgroundColor: (item.status === 'approved' ? '#10B981' : '#3B82F6') + '20',
          }]}>
            <Text style={[styles.statusText, {
              color: item.status === 'approved' ? '#10B981' : '#3B82F6',
            }]}>
              {item.status === 'approved' ? 'Đã duyệt' : 'Đang giải ngân'}
            </Text>
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Số vốn</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>
              {formatCurrency(item.capital)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Lãi suất</Text>
            <Text style={[styles.value, { color: theme.colors.primary }]}>
              {item.monthlyRatePercent}%/tháng ({annualRate}%/năm)
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Kỳ hạn</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>
              {item.periodMonth} tháng
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Trả hàng tháng</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>
              {formatCurrency(item.monthlyPay)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Tổng trả</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>
              {formatCurrency(item.entirelyPay)}
            </Text>
          </View>
        </View>

        {/* Investment progress */}
        {item.totalNotes > 0 && (
          <View style={{ marginTop: 8 }}>
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Đã ghép / Tổng</Text>
              <Text style={[styles.value, { color: theme.colors.primary }]}>
                {(item.nodeMatch || 0) + (item.investedNotes || 0)} / {item.totalNotes} notes
              </Text>
            </View>
            <View style={[styles.progressOuter, { backgroundColor: theme.colors.border || '#E5E7EB' }]}>
              <View
                style={[styles.progressInner, {
                  width: `${Math.min(100, Math.round(((item.nodeMatch || 0) + (item.investedNotes || 0)) / item.totalNotes * 100))}%`,
                  backgroundColor: theme.colors.primary,
                }]}
              />
            </View>
          </View>
        )}

        {/* AI Score badges */}
        {item.aiScore && (
          <View style={styles.badgeRow}>
            {grade && (
              <View style={[styles.badge, { backgroundColor: theme.colors.primary + '15' }]}>
                <Text style={[styles.badgeLabel, { color: theme.colors.primary }]}>
                  Grade {grade}{item.aiScore.subGrade ? ` (${item.aiScore.subGrade})` : ''}
                </Text>
              </View>
            )}
            {tier && (
              <View style={[styles.badge, { backgroundColor: (TIER_COLORS[tier] || '#6B7280') + '20' }]}>
                <Ionicons name="shield-checkmark" size={12} color={TIER_COLORS[tier] || '#6B7280'} />
                <Text style={[styles.badgeLabel, { color: TIER_COLORS[tier] || '#6B7280' }]}>
                  {tier}
                </Text>
              </View>
            )}
            {riskLevel && (
              <View style={[styles.badge, { backgroundColor: (RISK_COLORS[riskLevel] || '#6B7280') + '20' }]}>
                <Text style={[styles.badgeLabel, { color: RISK_COLORS[riskLevel] || '#6B7280' }]}>
                  Rủi ro: {riskLevel}
                </Text>
              </View>
            )}
            {item.aiScore.creditScore > 0 && (
              <View style={[styles.badge, { backgroundColor: '#6366F1' + '15' }]}>
                <Text style={[styles.badgeLabel, { color: '#6366F1' }]}>
                  CS: {item.aiScore.creditScore}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Invest button */}
        <TouchableOpacity
          style={[styles.investButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => handleInvest(item)}
          disabled={investing === item._id}
          activeOpacity={0.7}
        >
          {investing === item._id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="wallet-outline" size={16} color="#fff" />
              <Text style={styles.investButtonText}>Đầu tư</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={64} color={theme.colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          Chưa có khoản vay nào
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          Hiện tại chưa có khoản vay nào đang mở cho đầu tư. Hãy quay lại sau.
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Khoản vay cho đầu tư</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {totalCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: theme.colors.primary + '20' }]}>
              <Text style={[styles.countText, { color: theme.colors.primary }]}>{totalCount}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('InvestmentContractList')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="folder-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  countBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  countText: { fontSize: 14, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardBody: { gap: 6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeLabel: { fontSize: 11, fontWeight: '600' },
  progressOuter: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressInner: { height: '100%', borderRadius: 2 },
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  investButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 10, borderRadius: 12,
  },
  investButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
