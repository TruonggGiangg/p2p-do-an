import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet, StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import investService, { InvestmentContractItem, LenderScheduleItem } from '../services/invest.service';

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Chờ xử lý', color: '#F59E0B', icon: 'time-outline' },
  active: { label: 'Đang hoạt động', color: '#10B981', icon: 'checkmark-circle-outline' },
  matured: { label: 'Đáo hạn', color: '#3B82F6', icon: 'flag-outline' },
  closed: { label: 'Đã đóng', color: '#6B7280', icon: 'close-circle-outline' },
};

const SCHEDULE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Chờ', color: '#F59E0B' },
  paid: { label: 'Đã trả', color: '#10B981' },
  partial: { label: 'Trả 1 phần', color: '#3B82F6' },
  overdue: { label: 'Quá hạn', color: '#EF4444' },
};

function formatCurrency(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫';
}

export default function InvestmentContractDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const contractId = route.params?.contractId;

  const [contract, setContract] = useState<InvestmentContractItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await investService.getContractById(contractId);
        setContract(data);
      } catch (e: any) {
        console.error('Failed to load contract:', e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [contractId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
        <Text style={[styles.errorText, { color: theme.colors.text }]}>Không tìm thấy hợp đồng</Text>
      </View>
    );
  }

  const statusInfo = STATUS_MAP[contract.status] || STATUS_MAP.pending;
  const loanInfo = contract.loanApplicationId;
  const loanPurpose = typeof loanInfo === 'object' ? loanInfo?.willing : '';

  const renderScheduleRow = (item: LenderScheduleItem, index: number) => {
    const s = SCHEDULE_STATUS[item.status] || SCHEDULE_STATUS.pending;
    return (
      <View key={index} style={[styles.scheduleRow, { borderBottomColor: theme.colors.border || '#E5E7EB' }]}>
        <Text style={[styles.scheduleCell, styles.schedulePeriod, { color: theme.colors.text }]}>
          {item.period}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleDate, { color: theme.colors.textSecondary }]}>
          {item.dueDate}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleAmount, { color: theme.colors.text }]}>
          {(item.total / 1000).toFixed(0)}k
        </Text>
        <View style={[styles.scheduleStatusBadge, { backgroundColor: s.color + '20' }]}>
          <Text style={[styles.scheduleStatusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Chi tiết hợp đồng</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status card */}
        <View style={[styles.section, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <View style={styles.statusRow}>
            <View style={[styles.bigStatusBadge, { backgroundColor: statusInfo.color + '15' }]}>
              <Ionicons name={statusInfo.icon as any} size={20} color={statusInfo.color} />
              <Text style={[styles.bigStatusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
            <Text style={[styles.contractIdLabel, { color: theme.colors.textSecondary }]}>{contract.contractId}</Text>
          </View>
          {loanPurpose ? (
            <Text style={[styles.purpose, { color: theme.colors.text }]}>Mục đích: {loanPurpose}</Text>
          ) : null}
        </View>

        {/* Financial info */}
        <View style={[styles.section, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Thông tin tài chính</Text>
          <View style={styles.infoGrid}>
            <InfoItem label="Vốn đầu tư" value={formatCurrency(contract.capital)} color={theme.colors.text} labelColor={theme.colors.textSecondary} />
            <InfoItem label="Số notes" value={`${contract.numNotes}`} color={theme.colors.text} labelColor={theme.colors.textSecondary} />
            <InfoItem label="Kỳ hạn" value={`${contract.periodMonth} tháng`} color={theme.colors.text} labelColor={theme.colors.textSecondary} />
            <InfoItem label="Lãi suất" value={`${contract.annualRatePercent.toFixed(1)}%/năm`} color={theme.colors.primary} labelColor={theme.colors.textSecondary} />
            <InfoItem label="Thu nhập/tháng" value={formatCurrency(contract.monthlyIncome)} color={theme.colors.text} labelColor={theme.colors.textSecondary} />
            <InfoItem label="Tổng lợi nhuận" value={formatCurrency(contract.entirelyProfit)} color="#10B981" labelColor={theme.colors.textSecondary} />
            <InfoItem label="Tổng nhận" value={formatCurrency(contract.entirelyPay)} color={theme.colors.text} labelColor={theme.colors.textSecondary} />
            <InfoItem label="Đã nhận" value={formatCurrency(contract.totalReceived)} color={theme.colors.primary} labelColor={theme.colors.textSecondary} />
          </View>
        </View>

        {/* Lender Schedule */}
        {contract.lenderSchedule && contract.lenderSchedule.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Lịch nhận tiền ({contract.schedulePeriodCount} kỳ)
            </Text>

            {/* Summary */}
            <View style={[styles.scheduleSummary, { backgroundColor: theme.colors.primary + '08' }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Tổng gốc</Text>
                <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatCurrency(contract.scheduleTotalPrincipal)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Tổng lãi</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(contract.scheduleTotalInterest)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Tổng thu nhập</Text>
                <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>{formatCurrency(contract.scheduleTotalIncome)}</Text>
              </View>
            </View>

            {/* Header row */}
            <View style={[styles.scheduleHeaderRow, { borderBottomColor: theme.colors.border || '#E5E7EB' }]}>
              <Text style={[styles.scheduleHeaderCell, styles.schedulePeriod, { color: theme.colors.textSecondary }]}>Kỳ</Text>
              <Text style={[styles.scheduleHeaderCell, styles.scheduleDate, { color: theme.colors.textSecondary }]}>Ngày</Text>
              <Text style={[styles.scheduleHeaderCell, styles.scheduleAmount, { color: theme.colors.textSecondary }]}>Số tiền</Text>
              <Text style={[styles.scheduleHeaderCell, { color: theme.colors.textSecondary }]}>TT</Text>
            </View>

            {contract.lenderSchedule.map(renderScheduleRow)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoItem({ label, value, color, labelColor }: { label: string; value: string; color: string; labelColor: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.infoValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, marginTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  bigStatusText: { fontSize: 14, fontWeight: '600' },
  contractIdLabel: { fontSize: 11, fontWeight: '500' },
  purpose: { fontSize: 14, marginTop: 8, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  infoItem: { width: '50%', marginBottom: 10 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  scheduleSummary: { flexDirection: 'row', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  scheduleHeaderRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, marginBottom: 4 },
  scheduleHeaderCell: { fontSize: 11, fontWeight: '600' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  scheduleCell: { fontSize: 13 },
  schedulePeriod: { width: 32 },
  scheduleDate: { flex: 1 },
  scheduleAmount: { width: 60, textAlign: 'right', marginRight: 8 },
  scheduleStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  scheduleStatusText: { fontSize: 10, fontWeight: '600' },
});
