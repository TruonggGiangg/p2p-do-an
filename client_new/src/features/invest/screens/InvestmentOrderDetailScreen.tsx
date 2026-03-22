import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, StatusBar, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import investService, { InvestmentOrderItem } from '../services/invest.service';
import Svg, { Circle } from 'react-native-svg';

/* ── Circular Progress ── */
function CircularProgress({ pct, size, color, bgColor, textColor }: {
  pct: number; size: number; color: string; bgColor: string; textColor: string;
}) {
  const strokeWidth = 8;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={bgColor} strokeWidth={strokeWidth} fill="transparent" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="transparent"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      <Text style={{ fontSize: 22, fontWeight: '800', color: textColor }}>{pct}%</Text>
    </View>
  );
}

export default function InvestmentOrderDetailScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
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
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleClose = () => {
    Alert.alert('Đóng lệnh đầu tư', 'Hệ thống sẽ không ghép thêm khoản vay mới.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đóng', style: 'destructive', onPress: async () => {
          setClosing(true);
          try { await investService.closeInvestmentOrder(orderId); fetchOrder(); }
          catch (e: any) { Alert.alert('Lỗi', e?.message || 'Không thể đóng'); }
          finally { setClosing(false); }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Xóa lệnh đầu tư', 'Bạn chắc chắn muốn xóa?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive', onPress: async () => {
          try { await investService.deleteInvestmentOrder(orderId); navigation.goBack(); }
          catch (e: any) { Alert.alert('Lỗi', e?.message || 'Không thể xóa'); }
        },
      },
    ]);
  };

  const handleLoanPress = async (item: any) => {
    if (item.isInvested) {
      try {
        const contract = await investService.getContractByLoanId(item.loanId);
        if (contract) navigation.navigate('InvestmentContractDetail', { contractId: contract._id });
        else Alert.alert('Chưa sẵn sàng', 'Hợp đồng đang được tạo, vui lòng thử lại sau.');
      } catch (e: any) {
        Alert.alert('Lỗi', e?.message || 'Không thể mở chi tiết hợp đồng.');
      }
    } else {
      navigation.navigate('SchedulePreview', { loanApplicationId: item.loanId, numNotes: item.nodeMatch, readonly: true });
    }
  };

  if (loading) {
    return (
      <View style={[s.container, s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[s.container, s.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary }}>Không tìm thấy lệnh đầu tư</Text>
      </View>
    );
  }

  const matchPct = order.totalNodes > 0 ? Math.round((order.matchedNodes / order.totalNodes) * 100) : 0;
  const isClosed = order.status === 'closed';
  const statusColor = isClosed ? '#EF4444' : (c.success || '#4edea3');

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      <BinanceHeader
        mode="standard"
        title={order.name || `Lệnh #${order._id.slice(-6)}`}
        showBack
        rightComponents={
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        }
      />

      <FlatList
        ListHeaderComponent={
          <View style={s.headerSection}>
            {/* Status hero card */}
            <View style={[s.heroCard, { backgroundColor: c.backgroundSecondary }]}>
              <View style={s.heroRow}>
                <CircularProgress
                  pct={matchPct}
                  size={100}
                  color={isClosed ? (c.success || '#4edea3') : c.primary}
                  bgColor={(c.textMuted || '#999') + '20'}
                  textColor={c.text}
                />
                <View style={s.heroInfo}>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <Ionicons name={isClosed ? 'lock-closed' : 'folder-open'} size={14} color={statusColor} />
                    <Text style={[s.statusText, { color: statusColor }]}>{isClosed ? 'Đã đóng' : 'Đang hoạt động'}</Text>
                  </View>
                  <Text style={[s.heroAmount, { color: c.text }]}>
                    {order.matchedCapital.toLocaleString('vi-VN')} ₫
                  </Text>
                  <Text style={[s.heroSub, { color: c.textSecondary }]}>
                    / {order.capital.toLocaleString('vi-VN')} ₫
                  </Text>
                </View>
              </View>
            </View>

            {/* Info grid */}
            <View style={[s.infoGrid, { backgroundColor: c.backgroundSecondary }]}>
              <View style={s.gridRow}>
                <InfoItem icon="cash-outline" label="Vốn đầu tư" value={`${order.capital.toLocaleString('vi-VN')} ₫`} c={c} />
                <InfoItem icon="trending-up-outline" label="Max/khoản" value={`${order.maxCapital.toLocaleString('vi-VN')} ₫`} c={c} />
              </View>
              <View style={s.gridRow}>
                <InfoItem icon="calculator-outline" label="Lãi suất" value={`${order.interestRange.min}% — ${order.interestRange.max}%`} c={c} />
                <InfoItem icon="calendar-outline" label="Kỳ hạn" value={`${order.periodRange.min} — ${order.periodRange.max} tháng`} c={c} />
              </View>
              <View style={s.gridRow}>
                <InfoItem icon="bookmark-outline" label="Mục đích" value={order.purpose.join(', ')} c={c} />
                <InfoItem icon="grid-outline" label="Nodes" value={`${order.matchedNodes} / ${order.totalNodes}`} c={c} />
              </View>
            </View>

            {/* Close button */}
            {!isClosed && (
              <TouchableOpacity
                style={[s.closeBtn, { borderColor: '#EF4444' }]}
                onPress={handleClose} disabled={closing}
              >
                {closing ? <ActivityIndicator color="#EF4444" size="small" /> : (
                  <>
                    <Ionicons name="stop-circle-outline" size={18} color="#EF4444" />
                    <Text style={s.closeBtnText}>Đóng lệnh đầu tư</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Matched loans header */}
            <Text style={[s.sectionTitle, { color: c.text }]}>
              Khoản vay đã ghép ({order.loans?.length || 0})
            </Text>
          </View>
        }
        data={order.loans || []}
        keyExtractor={(item, i) => item.loanId + i}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.loanCard, { backgroundColor: c.backgroundSecondary }]}
            activeOpacity={0.7}
            onPress={() => handleLoanPress(item)}
          >
            <View style={s.loanHeader}>
              <View style={s.loanIdRow}>
                <Ionicons name="document-text" size={18} color={c.primary} />
                <Text style={[s.loanId, { color: c.text }]} numberOfLines={1}>
                  #{item.loanId.slice(-8)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />
            </View>
            <View style={s.loanInfoRow}>
              <Text style={[s.loanLabel, { color: c.textSecondary }]}>Nodes ghép</Text>
              <Text style={[s.loanValue, { color: c.text }]}>{item.nodeMatch}</Text>
            </View>
            <View style={s.loanInfoRow}>
              <Text style={[s.loanLabel, { color: c.textSecondary }]}>Trạng thái</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={item.isInvested ? 'checkmark-circle' : 'time-outline'} size={16} color={item.isInvested ? '#10B981' : '#F59E0B'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: item.isInvested ? '#10B981' : '#F59E0B' }}>
                  {item.isInvested ? 'Đã đầu tư' : 'Chờ xử lý'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.emptyLoans}>
            <Ionicons name="layers-outline" size={32} color={c.textMuted || c.textSecondary} />
            <Text style={{ color: c.textSecondary, marginTop: 8 }}>Chưa có khoản vay nào được ghép</Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      />
    </View>
  );
}

/* ── InfoItem ── */
function InfoItem({ icon, label, value, c }: { icon: string; label: string; value: string; c: any }) {
  return (
    <View style={s.infoItem}>
      <Ionicons name={icon as any} size={16} color={c.primary} />
      <View style={{ flex: 1, marginLeft: 6 }}>
        <Text style={[s.infoLabel, { color: c.textSecondary }]}>{label}</Text>
        <Text style={[s.infoValue, { color: c.text }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  headerSection: { paddingTop: 8 },

  // Hero
  heroCard: { borderRadius: 16, padding: 20, marginBottom: 10 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  heroInfo: { flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  heroAmount: { fontSize: 20, fontWeight: '800' },
  heroSub: { fontSize: 13, marginTop: 2 },

  // Info grid
  infoGrid: { borderRadius: 16, padding: 14, marginBottom: 10 },
  gridRow: { flexDirection: 'row', gap: 8 },
  infoItem: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingVertical: 8 },
  infoLabel: { fontSize: 11, fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },

  // Close
  closeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, marginBottom: 16,
  },
  closeBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },

  // Section
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },

  // Loan cards
  loanCard: { borderRadius: 14, padding: 16, marginBottom: 8 },
  loanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  loanIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  loanId: { fontSize: 14, fontWeight: '600' },
  loanInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  loanLabel: { fontSize: 13 },
  loanValue: { fontSize: 13, fontWeight: '600' },

  // Empty
  emptyLoans: { alignItems: 'center', paddingVertical: 40 },
});
