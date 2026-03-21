import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import investService, { InvestmentOrderItem } from '../services/invest.service';

export default function InvestmentOrderDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId: string = route.params?.orderId;

  const [order, setOrder] = useState<InvestmentOrderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const data = await investService.getInvestmentOrderById(orderId);
      setOrder(data);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không tải được chi tiết');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleClose = () => {
    Alert.alert('Đóng lệnh đầu tư', 'Bạn muốn đóng lệnh này? Hệ thống sẽ không ghép thêm khoản vay mới.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đóng', style: 'destructive', onPress: async () => {
          setClosing(true);
          try {
            await investService.closeInvestmentOrder(orderId);
            fetchOrder();
          } catch (e: any) {
            Alert.alert('Lỗi', e?.message || 'Không thể đóng');
          } finally {
            setClosing(false);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Xóa lệnh đầu tư', 'Bạn chắc chắn muốn xóa lệnh này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive', onPress: async () => {
          try {
            await investService.deleteInvestmentOrder(orderId);
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Lỗi', e?.message || 'Không thể xóa');
          }
        },
      },
    ]);
  };

  const handleLoanPress = async (item: any) => {
    if (item.isInvested) {
      try {
        const contract = await investService.getContractByLoanId(item.loanId);
        if (contract) {
          navigation.navigate('InvestmentContractDetail', { contractId: contract._id });
        } else {
          Alert.alert('Chưa sẵn sàng', 'Hợp đồng đầu tư đang được tạo, vui lòng thử lại sau.');
        }
      } catch (error: any) {
        Alert.alert('Lỗi', error?.message || 'Không thể mở chi tiết hợp đồng.');
      }
    } else {
      navigation.navigate('SchedulePreview', {
        loanApplicationId: item.loanId,
        numNotes: item.nodeMatch,
        readonly: true,
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.textSecondary }}>Không tìm thấy lệnh đầu tư</Text>
      </View>
    );
  }

  const matchPct = order.totalNodes > 0 ? Math.round((order.matchedNodes / order.totalNodes) * 100) : 0;
  const isClosed = order.status === 'closed';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {order.name || `Lệnh #${order._id.slice(-6)}`}
        </Text>
        <TouchableOpacity onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <FlatList
        ListHeaderComponent={
          <View style={styles.detailSection}>
            {/* Status + Progress */}
            <View style={[styles.statusCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <View style={styles.statusRow}>
                <Ionicons name={isClosed ? 'lock-closed' : 'folder-open'} size={28} color={isClosed ? '#EF4444' : theme.colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
                    {isClosed ? 'Đã đóng' : 'Đang hoạt động'}
                  </Text>
                  <Text style={[styles.statusSub, { color: theme.colors.textSecondary }]}>
                    Ghép {matchPct}% — {order.matchedCapital.toLocaleString('vi-VN')} / {order.capital.toLocaleString('vi-VN')} ₫
                  </Text>
                </View>
              </View>
              <View style={[styles.progressOuter, { backgroundColor: theme.colors.border || '#E5E7EB' }]}>
                <View style={[styles.progressInner, { width: `${matchPct}%`, backgroundColor: isClosed ? '#10B981' : theme.colors.primary }]} />
              </View>
            </View>

            {/* Info grid */}
            <View style={[styles.infoGrid, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <InfoItem icon="cash-outline" label="Vốn đầu tư" value={`${order.capital.toLocaleString('vi-VN')} ₫`} theme={theme} />
              <InfoItem icon="trending-up-outline" label="Max/khoản vay" value={`${order.maxCapital.toLocaleString('vi-VN')} ₫`} theme={theme} />
              <InfoItem icon="calculator-outline" label="Lãi suất" value={`${order.interestRange.min}% — ${order.interestRange.max}%`} theme={theme} />
              <InfoItem icon="calendar-outline" label="Kỳ hạn" value={`${order.periodRange.min} — ${order.periodRange.max} tháng`} theme={theme} />
              <InfoItem icon="bookmark-outline" label="Mục đích" value={order.purpose.join(', ')} theme={theme} />
              <InfoItem icon="grid-outline" label="Nodes" value={`${order.matchedNodes} / ${order.totalNodes}`} theme={theme} />
            </View>

            {/* Close button */}
            {!isClosed && (
              <TouchableOpacity
                style={[styles.closeButton, { borderColor: '#EF4444' }]}
                onPress={handleClose}
                disabled={closing}
              >
                {closing ? (
                  <ActivityIndicator color="#EF4444" size="small" />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                    <Text style={styles.closeButtonText}>Đóng lệnh đầu tư</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Matched loans header */}
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Khoản vay đã ghép ({order.loans?.length || 0})
            </Text>
          </View>
        }
        data={order.loans || []}
        keyExtractor={(item, index) => item.loanId + index}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.loanCard, { backgroundColor: theme.colors.backgroundSecondary }]}
            activeOpacity={0.7}
            onPress={() => handleLoanPress(item)}
          >
            <View style={styles.loanRow}>
              <Ionicons name="document-text" size={18} color={theme.colors.primary} />
              <Text style={[styles.loanId, { color: theme.colors.text }]} numberOfLines={1}>
                {item.loanId}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
            </View>
            <View style={styles.loanInfoRow}>
              <Text style={[styles.loanInfoLabel, { color: theme.colors.textSecondary }]}>Nodes ghép</Text>
              <Text style={[styles.loanInfoValue, { color: theme.colors.text }]}>{item.nodeMatch}</Text>
            </View>
            <View style={styles.loanInfoRow}>
              <Text style={[styles.loanInfoLabel, { color: theme.colors.textSecondary }]}>Đã đầu tư</Text>
              <Ionicons name={item.isInvested ? 'checkmark-circle' : 'time-outline'} size={16} color={item.isInvested ? '#10B981' : '#F59E0B'} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyLoans}>
            <Text style={{ color: theme.colors.textSecondary }}>Chưa có khoản vay nào được ghép</Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      />
    </View>
  );
}

function InfoItem({ icon, label, value, theme }: { icon: string; label: string; value: string; theme: any }) {
  return (
    <View style={infoStyles.item}>
      <Ionicons name={icon as any} size={18} color={theme.colors.primary} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={[infoStyles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
        <Text style={[infoStyles.value, { color: theme.colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  label: { fontSize: 12 },
  value: { fontSize: 14, fontWeight: '600', marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 12 },
  detailSection: { paddingTop: 8 },
  statusCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '600' },
  statusSub: { fontSize: 13, marginTop: 2 },
  progressOuter: { height: 6, borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  progressInner: { height: '100%', borderRadius: 3 },
  infoGrid: { borderRadius: 16, padding: 12, marginBottom: 12 },
  closeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, marginBottom: 16,
  },
  closeButtonText: { color: '#EF4444', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 4 },
  loanCard: { borderRadius: 12, padding: 14, marginBottom: 8 },
  loanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loanId: { fontSize: 13, fontWeight: '500', flex: 1 },
  loanInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  loanInfoLabel: { fontSize: 13 },
  loanInfoValue: { fontSize: 13, fontWeight: '600' },
  emptyLoans: { alignItems: 'center', paddingVertical: 30 },
});
