import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, StatusBar, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, useConfirmModal } from '../../../components';
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
  const modal = useConfirmModal();
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
      modal.error('Lỗi', e?.message || 'Không tải được chi tiết');
    } finally { setLoading(false); }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      fetchOrder();
    }, [fetchOrder])
  );

  const handleClose = () => {
    modal.confirm({
      title: 'Đóng lệnh đầu tư',
      message: 'Hệ thống sẽ không ghép thêm khoản vay mới.',
      confirmText: 'Đóng',
      variant: 'danger',
      onConfirm: async () => {
        setClosing(true);
        try { await investService.closeInvestmentOrder(orderId); fetchOrder(); }
        catch (e: any) { modal.error('Lỗi', e?.message || 'Không thể đóng'); }
        finally { setClosing(false); }
      },
    });
  };

  const handleDelete = () => {
    modal.confirm({
      title: 'Xóa lệnh đầu tư',
      message: 'Bạn chắc chắn muốn xóa?',
      confirmText: 'Xóa',
      variant: 'danger',
      onConfirm: async () => {
        try { await investService.deleteInvestmentOrder(orderId); navigation.goBack(); }
        catch (e: any) { modal.error('Lỗi', e?.message || 'Không thể xóa'); }
      },
    });
  };

  const handleLoanPress = async (item: any) => {
    // Tap vào khoản vay ghép chưa đầu tư sẽ cho phép thanh toán.
    // Nếu đã đầu tư (isInvested = true) thì readonly.
    navigation.navigate('SchedulePreview', {
      loanApplicationId: item.loanId,
      numNotes: item.nodeMatch,
      readonly: item.isInvested,
      investmentOrderId: orderId,
    });
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
  const statusColor = isClosed ? '#EF4444' : (c.primary || '#2C5D53');
  const badgeBg = isClosed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(44, 93, 83, 0.1)';

  return (
    <View style={[s.container, { backgroundColor: theme.mode === 'dark' ? c.background : '#FAFAF7' }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      <BinanceHeader
        mode="standard"
        title={order.name || `Lệnh #${order._id.slice(-6)}`}
        showBack
        rightComponents={
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={24} color="#D32F2F" />
          </TouchableOpacity>
        }
      />

      <FlatList
        ListHeaderComponent={
          <View style={s.headerSection}>
            {/* Status hero card */}
            <View style={[s.heroCard, { backgroundColor: c.backgroundSecondary }]}>
              <CircularProgress
                pct={matchPct}
                size={96}
                color={isClosed ? '#EF4444' : (c.primary || '#2C5D53')}
                bgColor={theme.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#DFECE8'}
                textColor={c.text}
              />
              <View style={s.heroInfo}>
                <View style={[s.statusBadge, { backgroundColor: badgeBg }]}>
                  <Text style={[s.statusText, { color: statusColor }]}>
                    {isClosed ? 'Đã đóng' : 'Đang hoạt động'}
                  </Text>
                </View>
                <View style={s.amountsWrapper}>
                  <Text style={[s.heroAmount, { color: c.text }]}>
                    {order.matchedCapital.toLocaleString('vi-VN')} đ
                  </Text>
                  <Text style={[s.heroSub, { color: c.textSecondary }]}>
                    / {order.capital.toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              </View>
            </View>

            {/* Info grid */}
            <View style={[s.infoGrid, { backgroundColor: c.backgroundSecondary }]}>
              <View style={s.gridRow}>
                <InfoItem icon="cash-multiple" label="Vốn đầu tư" value={`${order.capital.toLocaleString('vi-VN')} đ`} c={c} />
                <InfoItem icon="chart-line-variant" label="Max/khoản" value={`${order.maxCapital.toLocaleString('vi-VN')} đ`} c={c} />
              </View>
              <View style={s.gridRow}>
                <InfoItem icon="percent-outline" label="Lãi suất" value={`${order.interestRange.min}% — ${order.interestRange.max}%`} c={c} />
                <InfoItem icon="calendar-range" label="Kỳ hạn" value={`${order.periodRange.min} — ${order.periodRange.max} tháng`} c={c} />
              </View>
              <View style={s.gridRow}>
                <InfoItem icon="tag-outline" label="Mục đích" value={order.purpose.join(', ')} c={c} />
                <InfoItem icon="lan" label="Nodes" value={`${order.matchedNodes} / ${order.totalNodes}`} c={c} />
              </View>
            </View>

            {/* Close button */}
            {!isClosed && (
              <TouchableOpacity
                style={[s.closeBtn, { backgroundColor: theme.mode === 'dark' ? 'rgba(211, 47, 47, 0.15)' : 'rgba(211, 47, 47, 0.04)' }]}
                onPress={handleClose} disabled={closing}
                activeOpacity={0.7}
              >
                {closing ? <ActivityIndicator color="#D32F2F" size="small" /> : (
                  <>
                    <Ionicons name="stop-circle" size={18} color="#D32F2F" />
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
                <MaterialCommunityIcons name="file-document-outline" size={18} color={c.textSecondary} />
                <Text style={[s.loanId, { color: c.text }]} numberOfLines={1}>
                  #{item.loanId.slice(-8)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textSecondary} />
            </View>
            <View style={s.loanInfoRow}>
              <Text style={[s.loanLabel, { color: c.textSecondary }]}>Nodes ghép</Text>
              <Text style={[s.loanValue, { color: c.text }]}>{item.nodeMatch}</Text>
            </View>
            <View style={s.loanInfoRow}>
              <Text style={[s.loanLabel, { color: c.textSecondary }]}>Trạng thái Cấp vốn</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons
                  name={item.isInvested ? 'check-circle' : 'alert-circle-outline'}
                  size={16}
                  color={item.isInvested ? '#2C5D53' : '#F59E0B'}
                />
                <Text style={{ fontSize: 14, fontWeight: '600', color: item.isInvested ? '#2C5D53' : '#F59E0B' }}>
                  {item.isInvested ? 'Đã thanh toán' : 'Chờ thanh toán'}
                </Text>
              </View>
            </View>

            {/* Borrower Signature Status */}
            <View style={s.loanInfoRow}>
              <Text style={[s.loanLabel, { color: c.textSecondary }]}>Trạng thái Người vay ký</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons
                  name={item.borrowerSignedVerified ? 'file-check-outline' : 'file-clock-outline'}
                  size={16}
                  color={item.borrowerSignedVerified ? '#10B981' : '#6B7280'}
                />
                <Text style={{ fontSize: 14, fontWeight: '600', color: item.borrowerSignedVerified ? '#10B981' : '#6B7280' }}>
                  {item.borrowerSignedVerified ? 'Đã ký hợp đồng' : 'Chờ người vay ký'}
                </Text>
              </View>
            </View>

            {/* Prompt to pay if not invested */}
            {!item.isInvested && (
              <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 12, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '500' }}>Cần thanh toán để tạo hợp đồng</Text>
                <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Thanh toán</Text>
                </View>
              </View>
            )}

            {/* Prompt to sign if invested but pending signature */}
            {item.isInvested && item.contract_id && (!item.smartCASignatureVerified && item.contractStatus !== 'signed' && item.contractStatus !== 'active') && (
              <TouchableOpacity
                style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: 12, borderRadius: 12, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => (navigation as any).navigate('InvestmentContractDetail', { contractId: item.contract_id })}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#8B5CF6', fontSize: 13, fontWeight: '500' }}>Cần ký hợp đồng đầu tư</Text>
                <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Ký ngay</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Prompt to view contract if signed */}
            {item.isInvested && item.contract_id && (item.smartCASignatureVerified || item.contractStatus === 'signed' || item.contractStatus === 'active') && (
              <TouchableOpacity
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 12, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => (navigation as any).navigate('InvestmentContractDetail', { contractId: item.contract_id })}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                   <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                   <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '500' }}>Hợp đồng đã ký</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#10B981" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.emptyLoans}>
            <Ionicons name="layers-outline" size={32} color={c.textMuted || c.textSecondary} />
            <Text style={{ color: c.textSecondary, marginTop: 8 }}>Chưa có khoản vay nào được ghép</Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}
      />
    </View>
  );
}

/* ── InfoItem ── */
function InfoItem({ icon, label, value, c }: { icon?: string; label: string; value: string; c: any }) {
  return (
    <View style={s.infoItem}>
      <View style={s.infoLabelRow}>
        {icon && <MaterialCommunityIcons name={icon as any} size={15} color={c.textSecondary} style={{ marginRight: 4 }} />}
        <Text style={[s.infoLabel, { color: c.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[s.infoValue, { color: c.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  headerSection: { paddingTop: 24 },

  // Hero
  heroCard: { borderRadius: 24, padding: 24, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 24 },
  heroInfo: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '500' },
  amountsWrapper: { flexDirection: 'column', gap: 4 },
  heroAmount: { fontSize: 24, fontWeight: '700' },
  heroSub: { fontSize: 14 },

  // Info grid
  infoGrid: { borderRadius: 24, padding: 24, gap: 24, marginBottom: 24 },
  gridRow: { flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  infoItem: { flex: 1, flexDirection: 'column', gap: 4 },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 13, fontWeight: '400' },
  infoValue: { fontSize: 15, fontWeight: '600' },

  // Close
  closeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 16, paddingVertical: 16, marginBottom: 24,
    borderWidth: 1, borderColor: '#D32F2F',
  },
  closeBtnText: { color: '#D32F2F', fontWeight: '600', fontSize: 16 },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },

  // Loan cards
  loanCard: { borderRadius: 20, padding: 20, marginBottom: 16, gap: 12 },
  loanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loanId: { fontSize: 16, fontWeight: '600' },
  loanInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanLabel: { fontSize: 14 },
  loanValue: { fontSize: 14, fontWeight: '600' },

  // Empty
  emptyLoans: { alignItems: 'center', paddingVertical: 40 },
});
