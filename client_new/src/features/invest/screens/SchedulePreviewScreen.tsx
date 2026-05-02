/**
 * SchedulePreviewScreen — Preview lịch nhận tiền trước khi đầu tư
 * Redesigned: Finesse Wallet theme (Deep Teal + Lime Green)
 * Supports both light & dark mode. Gradient hero uses forced light text.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, useConfirmModal } from '../../../components';
import investService from '../services/invest.service';

interface ScheduleItem {
  period: number;
  principal: number;
  interest: number;
  total: number;
  dueDate?: string;
}

interface PreviewData {
  capital: number;
  numNotes: number;
  periodMonth: number;
  monthlyRatePercent: number;
  annualRatePercent: number;
  monthlyIncome: number;
  entirelyProfit: number;
  entirelyPay: number;
  schedule: ScheduleItem[];
  summary: {
    totalPrincipal: number;
    totalInterest: number;
    totalIncome: number;
    periodCount: number;
  };
}

function fmt(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫';
}

function fmtShort(n: number): string {
  return n.toLocaleString('vi-VN');
}

// Hero gradient is always dark-teal, so text must be forced-light
const HERO_TEXT = '#EAECEF';
const HERO_TEXT_DIM = '#7A8A82';
const HERO_ACCENT = '#CDEA2D';

export default function SchedulePreviewScreen() {
  const { theme } = useTheme();
  const modal = useConfirmModal();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { loanApplicationId, numNotes, loanTitle, readonly, investmentOrderId } = route.params || {};

  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [investing, setInvesting] = useState(false);

  useEffect(() => {
    loadPreview();
  }, []);

  const loadPreview = async () => {
    try {
      const result = await investService.getSchedulePreview(loanApplicationId, numNotes, investmentOrderId);
      setData(result);
    } catch (e: any) {
      modal.error('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tải dữ liệu', () => navigation.goBack());
    } finally {
      setLoading(false);
    }
  };

  const handleInvest = () => {
    if (!data) return;
    modal.confirm({
      title: 'Xác nhận đầu tư',
      message: `Bạn muốn đầu tư ${fmt(data.capital)} vào khoản vay này?\n\nLợi nhuận kỳ vọng: ${fmt(data.entirelyProfit)}`,
      confirmText: 'Đầu tư',
      variant: 'default',
      onConfirm: async () => {
        setInvesting(true);
        try {
          const contract = await investService.createContract({
            loanApplicationId,
            numNotes,
            investmentOrderId,
          });
          if (String((contract as any)?.status || '') === 'pending_signature') {
            navigation.replace('InvestmentContractDetail', { contractId: contract._id, autoSign: true });
            return;
          }
          modal.success('Thành công!', `Hợp đồng ${contract.contractId} đã tạo`, () => {
            navigation.navigate('InvestmentContractDetail', { contractId: contract._id });
          });
        } catch (e: any) {
          modal.error('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tạo hợp đồng');
        } finally {
          setInvesting(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          Đang tính toán lịch trình...
        </Text>
      </View>
    );
  }

  if (!data) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Shared Header */}
      <BinanceHeader mode="standard" title="Xem trước lịch nhận tiền" showBack={true} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Hero Summary Card — Teal gradient, forced light text ── */}
        <LinearGradient
          colors={theme.gradients.accent as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryCard}
        >
          {loanTitle && (
            <Text style={[styles.summaryPurpose, { color: HERO_TEXT_DIM }]}>{loanTitle}</Text>
          )}
          <Text style={[styles.summaryMainLabel, { color: HERO_TEXT_DIM }]}>Vốn đầu tư</Text>
          <Text style={[styles.summaryMainValue, { color: HERO_TEXT }]}>{fmt(data.capital)}</Text>

          <View style={styles.summaryMeta}>
            <Text style={[styles.summaryMetaText, { color: HERO_TEXT_DIM }]}>
              {data.periodMonth} tháng · Lãi suất đầu tư: {data.annualRatePercent}%/năm · {data.numNotes} notes
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryItemLabel, { color: HERO_TEXT_DIM }]}>Tổng nhận</Text>
              <Text style={[styles.summaryItemValue, { color: HERO_TEXT }]}>{fmt(data.entirelyPay)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryItemLabel, { color: HERO_TEXT_DIM }]}>Lợi nhuận</Text>
              <Text style={[styles.summaryItemValue, { color: HERO_ACCENT }]}>
                +{fmt(data.entirelyProfit)}
              </Text>
            </View>
          </View>

          <View style={[styles.monthlyRow, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <Ionicons name="calendar-outline" size={14} color={HERO_TEXT_DIM} />
            <Text style={[styles.monthlyText, { color: HERO_TEXT }]}>
              Thu nhập hàng tháng: ~{fmt(data.monthlyIncome)}
            </Text>
          </View>
        </LinearGradient>

        {/* ── Schedule Table ── */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Lịch nhận tiền ({data.summary.periodCount} kỳ)
        </Text>

        <View style={[styles.tableCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
          {/* Table Header — surfaceLight for tonal contrast */}
          <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: theme.colors.surfaceLight }]}>
            <Text style={[styles.thCell, styles.cellKy, { color: theme.colors.textSecondary }]}>KỲ</Text>
            <Text style={[styles.thCell, styles.cellGoc, { color: theme.colors.textSecondary }]}>GỐC</Text>
            <Text style={[styles.thCell, styles.cellLai, { color: theme.colors.textSecondary }]}>LÃI</Text>
            <Text style={[styles.thCell, styles.cellTong, { color: theme.colors.textSecondary }]}>TỔNG</Text>
          </View>

          {/* Table Body — alternating tonal backgrounds */}
          {data.schedule.map((item, idx) => (
            <View
              key={item.period}
              style={[
                styles.tableRow,
                { backgroundColor: idx % 2 === 0 ? 'transparent' : theme.colors.surfaceLight + '40' },
              ]}
            >
              <Text style={[styles.tdCell, styles.cellKy, { color: theme.colors.textSecondary }]}>
                {item.period}
              </Text>
              <Text style={[styles.tdCell, styles.cellGoc, { color: theme.colors.textPrimary }]}>
                {fmtShort(item.principal)}
              </Text>
              <Text style={[styles.tdCell, styles.cellLai, { color: theme.colors.primary }]}>
                {fmtShort(item.interest)}
              </Text>
              <Text style={[styles.tdCell, styles.cellTong, { color: theme.colors.textPrimary, fontWeight: '600' }]}>
                {fmtShort(item.total)}
              </Text>
            </View>
          ))}

          {/* Totals Row — primary glass bg */}
          <View style={[styles.tableRow, styles.totalsRow, { backgroundColor: theme.colors.primaryGlass }]}>
            <Text style={[styles.tdCell, styles.cellKy, { color: theme.colors.primary, fontWeight: '700' }]}>Tổng</Text>
            <Text style={[styles.tdCell, styles.cellGoc, { color: theme.colors.textPrimary, fontWeight: '700' }]}>
              {fmtShort(data.summary.totalPrincipal)}
            </Text>
            <Text style={[styles.tdCell, styles.cellLai, { color: theme.colors.primary, fontWeight: '700' }]}>
              {fmtShort(data.summary.totalInterest)}
            </Text>
            <Text style={[styles.tdCell, styles.cellTong, { color: theme.colors.primary, fontWeight: '700' }]}>
              {fmtShort(data.summary.totalIncome)}
            </Text>
          </View>
        </View>

        {/* ── CTA Button / Readonly State ── */}
        {readonly ? (
          <View style={[styles.ctaButton, { backgroundColor: theme.colors.surfaceLight }]}>
            <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.ctaText, { color: theme.colors.textSecondary }]}>Đang chờ giải ngân</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: theme.colors.primary, opacity: investing ? 0.6 : 1 }]}
            onPress={handleInvest}
            disabled={investing}
            activeOpacity={0.7}
          >
            {investing ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={20} color={theme.colors.onPrimary} />
                <Text style={[styles.ctaText, { color: theme.colors.onPrimary }]}>Đầu tư ngay</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Summary — gradient bg, forced light text
  summaryCard: {
    borderRadius: 20, padding: 20, marginBottom: 24,
  },
  summaryPurpose: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  summaryMainLabel: { fontSize: 12 },
  summaryMainValue: { fontSize: 22, fontWeight: '700', marginTop: 2, letterSpacing: -0.5 },
  summaryMeta: { marginTop: 8 },
  summaryMetaText: { fontSize: 13 },
  summaryRow: { flexDirection: 'row', marginTop: 20, gap: 16 },
  summaryItem: { flex: 1 },
  summaryItemLabel: { fontSize: 12 },
  summaryItemValue: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  monthlyRow: {
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  monthlyText: { fontSize: 13, fontWeight: '600' },

  // Table — backgroundSecondary with tonal alternation
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  tableCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  tableRow: {
    flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 14,
  },
  tableHeader: { paddingVertical: 12 },
  totalsRow: { paddingVertical: 14 },
  thCell: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tdCell: { fontSize: 13 },
  cellKy: { width: 36, textAlign: 'center' },
  cellGoc: { flex: 1, textAlign: 'right' },
  cellLai: { flex: 1, textAlign: 'right' },
  cellTong: { flex: 1, textAlign: 'right' },

  // CTA — Lime green, black text (correct contrast for both modes)
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
  },
  ctaText: { color: '#000', fontSize: 14, fontWeight: '700' },
});
