import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import investService, { InvestmentOrderItem } from '../services/invest.service';

export default function InvestmentOrderListScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [orders, setOrders] = useState<InvestmentOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    try {
      setError('');
      const result = await investService.getInvestmentOrders({ sortOrder: 'desc' });
      setOrders(result.orders);
    } catch (e: any) {
      setError(e?.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const renderItem = ({ item }: { item: InvestmentOrderItem }) => {
    const matchPct = item.totalNodes > 0 ? Math.round((item.matchedNodes / item.totalNodes) * 100) : 0;
    const isClosed = item.status === 'closed';

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}
        onPress={() => navigation.navigate('InvestmentOrderDetail', { orderId: item._id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name={isClosed ? 'lock-closed' : 'folder-open'}
              size={20}
              color={isClosed ? theme.colors.textSecondary : theme.colors.primary}
            />
            <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name || `Lệnh #${item._id.slice(-6)}`}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isClosed ? '#EF4444' + '20' : theme.colors.primary + '20' }]}>
            <Text style={[styles.statusText, { color: isClosed ? '#EF4444' : theme.colors.primary }]}>
              {isClosed ? 'Đóng' : 'Mở'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Vốn đầu tư</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>
              {item.capital.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Đã ghép</Text>
            <Text style={[styles.value, { color: theme.colors.primary }]}>
              {item.matchedCapital.toLocaleString('vi-VN')} ₫ ({matchPct}%)
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Khoản vay</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>
              {item.loans?.length || 0} khoản
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressOuter, { backgroundColor: theme.colors.border || '#E5E7EB' }]}>
          <View
            style={[styles.progressInner, {
              width: `${matchPct}%`,
              backgroundColor: isClosed ? '#10B981' : theme.colors.primary,
            }]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="trending-up-outline" size={64} color={theme.colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Chưa có lệnh đầu tư nào</Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          Tạo lệnh đầu tư để hệ thống tự động tìm và ghép khoản vay phù hợp.
        </Text>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => navigation.navigate('InvestmentOrderCreate')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.createButtonText}>Tạo lệnh đầu tư</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Lệnh đầu tư</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('AvailableLoans')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="search-outline" size={26} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('InvestmentOrderCreate')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="add-circle-outline" size={28} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
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
  listContent: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardBody: { gap: 6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  progressOuter: { height: 4, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressInner: { height: '100%', borderRadius: 2 },
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  createButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 24 },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
