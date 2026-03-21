/**
 * InvestmentStatsScreen — Dashboard thống kê đầu tư cho lender
 * Redesigned: Finesse Wallet theme (Deep Teal + Lime Green)
 * Supports both light & dark mode via useTheme() tokens.
 * Gradient hero card always uses light text since the gradient is dark-teal.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import investService from '../services/invest.service';

interface LenderStats {
  financial: {
    totalInvested: number;
    totalReceived: number;
    totalPrincipalReceived: number;
    totalInterestReceived: number;
    expectedTotalProfit: number;
    actualProfit: number;
  };
  health: {
    active: { count: number; amount: number };
    pending: { count: number; amount: number };
    matured: { count: number; amount: number };
    closed: { count: number; amount: number };
  };
  diversification: Array<{
    label: string;
    count: number;
    amount: number;
    percentage: string;
  }>;
  performance: {
    averageRate: number;
    weightedAverageRate: string;
    totalContracts: number;
    totalOrders: number;
  };
}

interface BalanceInfo {
  walletBalance: number;
  totalInvested: number;
  availableBalance: number;
}

function fmt(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫';
}

export default function InvestmentStatsScreen() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<LenderStats | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, balanceRes] = await Promise.all([
        investService.getStats(),
        investService.getMyBalance(),
      ]);
      setStats(statsRes);
      setBalance(balanceRes);
    } catch (e: any) {
      console.error('Failed to fetch stats:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const fin = stats?.financial || { totalInvested: 0, totalReceived: 0, totalInterestReceived: 0, expectedTotalProfit: 0, actualProfit: 0, totalPrincipalReceived: 0 };
  const health = stats?.health || { active: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 }, matured: { count: 0, amount: 0 }, closed: { count: 0, amount: 0 } };
  const perf = stats?.performance || { averageRate: 0, weightedAverageRate: '0', totalContracts: 0, totalOrders: 0 };
  const div = stats?.diversification || [];

  // Status config using theme tokens
  const statusItems = [
    { key: 'active' as const, label: 'Đang hoạt động', color: theme.colors.primary, icon: 'trending-up' as const },
    { key: 'pending' as const, label: 'Chờ xử lý', color: theme.colors.warning, icon: 'time-outline' as const },
    { key: 'matured' as const, label: 'Đáo hạn', color: theme.colors.success, icon: 'checkmark-circle-outline' as const },
    { key: 'closed' as const, label: 'Đã đóng', color: theme.colors.textMuted, icon: 'lock-closed-outline' as const },
  ];

  // Diversification colors from theme palette
  const divColors = [theme.colors.primary, theme.colors.success, theme.colors.warning, '#8B5CF6', theme.colors.error, '#EC4899'];

  // Hero gradient is always dark-teal, so text must be light
  const HERO_TEXT = '#EAECEF';
  const HERO_TEXT_DIM = '#7A8A82';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Shared Header */}
      <BinanceHeader
        mode="standard"
        title="Tổng quan đầu tư"
        showBack={true}
        rightComponents={
          balance ? (
            <View style={[styles.balanceChip, { backgroundColor: theme.colors.primaryGlass }]}>
              <Ionicons name="wallet" size={16} color={theme.colors.primary} />
              <Text style={[styles.balanceText, { color: theme.colors.primary }]}>
                {fmt(balance.walletBalance)}
              </Text>
            </View>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={theme.colors.primary} />
        }
      >
        {/* ── Financial Summary — Gradient Hero Card ── */}
        {/* gradient.accent is always dark-teal, so force light text */}
        <LinearGradient
          colors={theme.gradients.accent as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryCard}
        >
          <Text style={[styles.summaryLabel, { color: HERO_TEXT_DIM }]}>Tổng đã đầu tư</Text>
          <Text style={[styles.summaryValue, { color: HERO_TEXT }]}>{fmt(fin.totalInvested)}</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryItemLabel, { color: HERO_TEXT_DIM }]}>Đã nhận</Text>
              <Text style={[styles.summaryItemValue, { color: HERO_TEXT }]}>{fmt(fin.totalReceived)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryItemLabel, { color: HERO_TEXT_DIM }]}>Lợi nhuận</Text>
              <Text style={[styles.summaryItemValue, { color: '#CDEA2D' }]}>
                {fmt(fin.actualProfit)}
              </Text>
            </View>
          </View>

          <View style={[styles.expectedRow, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <Text style={[styles.expectedLabel, { color: HERO_TEXT_DIM }]}>Lợi nhuận kỳ vọng</Text>
            <Text style={[styles.expectedValue, { color: '#CDEA2D' }]}>{fmt(fin.expectedTotalProfit)}</Text>
          </View>
        </LinearGradient>

        {/* ── Health Status (2x2 grid) ── */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Trạng thái đầu tư</Text>
        <View style={styles.healthGrid}>
          {statusItems.map(item => (
            <View key={item.key} style={[styles.healthCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <View style={styles.healthHeader}>
                <View style={[styles.healthIconCircle, { backgroundColor: item.color + '18' }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <Text style={[styles.healthCount, { color: theme.colors.textPrimary }]}>
                  {health[item.key].count}
                </Text>
              </View>
              <Text style={[styles.healthLabel, { color: theme.colors.textSecondary }]}>{item.label}</Text>
              <Text style={[styles.healthAmount, { color: item.color }]}>
                {fmt(health[item.key].amount)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Diversification ── */}
        {div.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Đa dạng hóa theo mục đích</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>
              {div.map((item, idx) => (
                <View key={item.label} style={styles.divRow}>
                  <View style={styles.divLabelRow}>
                    <View style={[styles.divDot, { backgroundColor: divColors[idx % divColors.length] }]} />
                    <Text style={[styles.divLabel, { color: theme.colors.textPrimary }]}>{item.label}</Text>
                    <Text style={[styles.divPct, { color: theme.colors.textSecondary }]}>{item.percentage}%</Text>
                  </View>
                  <View style={[styles.divBarOuter, { backgroundColor: theme.colors.surfaceLight }]}>
                    <View style={[styles.divBarInner, {
                      width: `${parseFloat(item.percentage)}%`,
                      backgroundColor: divColors[idx % divColors.length],
                    }]} />
                  </View>
                  <Text style={[styles.divAmount, { color: theme.colors.textSecondary }]}>
                    {item.count} HĐ · {fmt(item.amount)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Performance ── */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Hiệu suất</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <View style={styles.perfRow}>
            <View style={styles.perfItem}>
              <Text style={[styles.perfLabel, { color: theme.colors.textSecondary }]}>Lãi suất TB</Text>
              <Text style={[styles.perfValue, { color: theme.colors.primary }]}>
                {perf.averageRate}%/tháng
              </Text>
            </View>
            <View style={styles.perfItem}>
              <Text style={[styles.perfLabel, { color: theme.colors.textSecondary }]}>Lãi suất trọng số</Text>
              <Text style={[styles.perfValue, { color: theme.colors.primary }]}>
                {perf.weightedAverageRate}%/tháng
              </Text>
            </View>
          </View>
          <View style={[styles.perfRow, { marginTop: 16 }]}>
            <View style={styles.perfItem}>
              <Text style={[styles.perfLabel, { color: theme.colors.textSecondary }]}>Tổng hợp đồng</Text>
              <Text style={[styles.perfValue, { color: theme.colors.textPrimary }]}>{perf.totalContracts}</Text>
            </View>
            <View style={styles.perfItem}>
              <Text style={[styles.perfLabel, { color: theme.colors.textSecondary }]}>Tổng lệnh</Text>
              <Text style={[styles.perfValue, { color: theme.colors.textPrimary }]}>{perf.totalOrders}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  balanceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  balanceText: { fontSize: 14, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Financial Summary — gradient hero, always dark bg → light text
  summaryCard: {
    borderRadius: 20, padding: 20, marginBottom: 24,
  },
  summaryLabel: { fontSize: 13, fontWeight: '500' },
  summaryValue: { fontSize: 32, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  summaryRow: { flexDirection: 'row', marginTop: 20, gap: 16 },
  summaryItem: { flex: 1 },
  summaryItemLabel: { fontSize: 12 },
  summaryItemValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  expectedRow: {
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  expectedLabel: { fontSize: 12 },
  expectedValue: { fontSize: 15, fontWeight: '700' },

  // Section
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 4 },

  // Health Grid — backgroundSecondary for cards
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  healthCard: {
    width: '47%' as any, borderRadius: 16, padding: 16, flexGrow: 1,
  },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthIconCircle: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  healthCount: { fontSize: 26, fontWeight: '800' },
  healthLabel: { fontSize: 12, marginTop: 8 },
  healthAmount: { fontSize: 13, fontWeight: '600', marginTop: 4 },

  // Card — backgroundSecondary
  card: { borderRadius: 16, padding: 16, marginBottom: 24 },

  // Diversification
  divRow: { marginBottom: 16 },
  divLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  divDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  divLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  divPct: { fontSize: 14, fontWeight: '700' },
  divBarOuter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  divBarInner: { height: '100%', borderRadius: 3 },
  divAmount: { fontSize: 11, marginTop: 6 },

  // Performance
  perfRow: { flexDirection: 'row' },
  perfItem: { flex: 1 },
  perfLabel: { fontSize: 12 },
  perfValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
});
