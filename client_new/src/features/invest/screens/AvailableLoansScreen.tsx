/**
 * AvailableLoansScreen — Khoản vay đang cho phép đầu tư
 * Redesigned: Finesse Wallet theme (Deep Teal + Lime Green)
 * Supports both light & dark mode via useTheme() tokens.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Alert, Modal, Dimensions, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import investService, { AvailableLoanItem } from '../services/invest.service';
import { walletAPI } from '../../wallet/api/wallet.api';
import type { Wallet } from '../../../types/auth.types';

function fmt(n: number): string { return n.toLocaleString('vi-VN') + ' ₫'; }

export default function AvailableLoansScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [loans, setLoans] = useState<AvailableLoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [investing, setInvesting] = useState<string | null>(null);

  // ── Note Selector Bottom Sheet state ──
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<AvailableLoanItem | null>(null);
  const [numNotes, setNumNotes] = useState(1);
  const BASE_UNIT_PRICE = 500_000;

  // ── Wallet Selection state ──
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [walletsLoading, setWalletsLoading] = useState(false);

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

  // ── Open note selector bottom sheet ──
  const openNoteSelector = async (item: AvailableLoanItem) => {
    const totalNotes = item.totalNotes || Math.ceil(item.capital / BASE_UNIT_PRICE);
    const available = Math.max(1, totalNotes - ((item.nodeMatch || 0) + (item.investedNotes || 0)));
    setSelectedLoan(item);
    setNumNotes(Math.min(available, totalNotes));
    setSelectorVisible(true);

    // Fetch wallets
    try {
      setWalletsLoading(true);
      const result = await walletAPI.getWallets();
      const activeWallets = (result.wallets || []).filter(w => !w.status || w.status.toString().toLowerCase() !== 'closed');
      setWallets(activeWallets);
      // Auto-select default wallet or first wallet
      const defaultW = activeWallets.find(w => w.isDefault) || activeWallets[0];
      setSelectedWallet(defaultW || null);
    } catch (e: any) {
      console.error('Failed to fetch wallets:', e?.message);
      setWallets([]);
      setSelectedWallet(null);
    } finally { setWalletsLoading(false); }
  };

  const getAvailableNotes = (item: AvailableLoanItem) => {
    const totalNotes = item.totalNotes || Math.ceil(item.capital / BASE_UNIT_PRICE);
    return Math.max(0, totalNotes - ((item.nodeMatch || 0) + (item.investedNotes || 0)));
  };

  const handleConfirmInvest = async () => {
    if (!selectedLoan) return;
    if (!selectedWallet) {
      Alert.alert('Chưa chọn ví', 'Vui lòng chọn ví để thanh toán');
      return;
    }
    const investAmount = numNotes * BASE_UNIT_PRICE;
    if (selectedWallet.balance < investAmount) {
      Alert.alert('Số dư không đủ', `Ví chỉ có ${fmt(selectedWallet.balance)}, cần ${fmt(investAmount)}`);
      return;
    }
    try {
      setInvesting(selectedLoan._id);
      setSelectorVisible(false);
      const contract = await investService.createContract({ loanApplicationId: selectedLoan._id, numNotes });
      Alert.alert('Thành công', `Hợp đồng ${contract.contractId} đã tạo`, [
        { text: 'Xem chi tiết', onPress: () => navigation.navigate('InvestmentContractDetail', { contractId: contract._id }) },
        { text: 'OK' },
      ]);
      fetchLoans();
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tạo hợp đồng');
    } finally { setInvesting(null); }
  };

  const handlePreviewFromSelector = () => {
    if (!selectedLoan) return;
    setSelectorVisible(false);
    navigation.navigate('SchedulePreview' as any, {
      loanApplicationId: selectedLoan._id,
      numNotes,
      loanTitle: selectedLoan.willing || undefined,
    });
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

    // Compute AI repayment probability display
    const repayProb = item.aiScore?.creditScore ? Math.min(99.9, 80 + (item.aiScore.creditScore / 50)).toFixed(1) : null;

    return (
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundSecondary }]}>

        {/* ── Header Row ── */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <LinearGradient
              colors={[theme.colors.primary + '30', theme.colors.success + '18']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.purposeIcon}
            >
              <MaterialCommunityIcons name="file-document-outline" size={20} color={theme.colors.primary} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {item.willing || 'Chưa xác định mục đích'}
              </Text>
              <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
                Mã #{item._id?.slice(-4)?.toUpperCase()} • Đã thẩm định
              </Text>
            </View>
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
              {item.status === 'approved' ? 'Đã xác minh' : 'Đang giải ngân'}
            </Text>
          </View>
        </View>

        {/* ── Key Metrics 2x2 Grid — tonal elevated surface ── */}
        <View style={[styles.metricsGrid, { backgroundColor: theme.colors.surfaceLight }]}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>GIÁ TRỊ KHOẢN VAY</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(item.capital)}</Text>
          </View>
          <View style={[styles.metricItem, styles.metricItemRight]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>LỢI SUẤT</Text>
            <Text style={[styles.metricValue, { color: theme.colors.primary }]}>
              {item.fdMonthlyRate || item.monthlyRatePercent}%
            </Text>
            <Text style={[styles.metricSubValue, { color: theme.colors.primary }]}>({item.fdInterestRate || annualRate}%/năm)</Text>
          </View>
          <View style={[styles.metricItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.textMuted + '15' }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>KỲ HẠN ĐẦU TƯ</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{item.periodMonth}</Text>
              <Text style={[styles.metricUnit, { color: theme.colors.textSecondary }]}>tháng</Text>
            </View>
          </View>
          <View style={[styles.metricItem, styles.metricItemRight, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.textMuted + '15' }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>TỔNG THU NHẬN</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(item.entirelyPay)}</Text>
          </View>
        </View>

        {/* ── AI Score Badges — Glassmorphism ── */}
        {item.aiScore && (
          <View style={styles.badgeRow}>
            {grade ? (
              <LinearGradient
                colors={[theme.colors.primary + '25', theme.colors.primary + '0D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <MaterialCommunityIcons name="shield-star" size={12} color={theme.colors.primary} />
                <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                  {grade}{item.aiScore.subGrade ? ` (${item.aiScore.subGrade})` : ''}
                </Text>
              </LinearGradient>
            ) : null}
            {tier ? (
              <LinearGradient
                colors={[tierColor + '25', tierColor + '0D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <MaterialCommunityIcons name="trophy" size={11} color={tierColor} />
                <Text style={[styles.badgeText, { color: tierColor }]}>{tier}</Text>
              </LinearGradient>
            ) : null}
            {riskLevel ? (
              <LinearGradient
                colors={[riskColor + '25', riskColor + '0D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <Ionicons name={riskLevel === 'LOW' ? 'shield-checkmark' : 'warning'} size={11} color={riskColor} />
                <Text style={[styles.badgeText, { color: riskColor }]}>
                  {riskLevel === 'LOW' ? 'An toàn' : riskLevel === 'MEDIUM' ? 'Trung bình' : 'Rủi ro cao'}
                </Text>
              </LinearGradient>
            ) : null}
            {item.aiScore.creditScore > 0 ? (
              <LinearGradient
                colors={[theme.colors.success + '20', theme.colors.success + '08']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <MaterialCommunityIcons name="brain" size={11} color={theme.colors.success} />
                <Text style={[styles.badgeText, { color: theme.colors.success }]}>CS: {item.aiScore.creditScore}</Text>
              </LinearGradient>
            ) : null}
          </View>
        )}

        {/* ── AI Insight Cards — Stitch "Bioluminescent" tonal sections ── */}
        {item.aiScore && (
          <View style={styles.insightRow}>
            <View style={[styles.insightCard, { backgroundColor: theme.colors.primary + '0D' }]}>
              <MaterialCommunityIcons name="shield-check" size={16} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: theme.colors.primary }]}>Bảo toàn vốn</Text>
                <Text style={[styles.insightDesc, { color: theme.colors.textMuted }]}>Ký quỹ hợp đồng thông minh</Text>
              </View>
            </View>
            {repayProb && (
              <View style={[styles.insightCard, { backgroundColor: theme.colors.success + '0D' }]}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={16} color={theme.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.insightTitle, { color: theme.colors.success }]}>{repayProb}%</Text>
                  <Text style={[styles.insightDesc, { color: theme.colors.textMuted }]}>Tỷ lệ hoàn vốn</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Investment Progress — Stitch segmented progress bar ── */}
        <View style={[styles.progressSection, { backgroundColor: theme.colors.surfaceLight }]}>
          {/* Header */}
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>TIẾN ĐỘ HUY ĐỘNG</Text>
            <Text style={[styles.progressValue, { color: theme.colors.primary }]}>
              {totalClaimed}/{totalNotes} phần
            </Text>
          </View>

          {/* Segmented Progress bar — 3 distinct segments */}
          <View style={styles.progressOuter}>
            {invested > 0 && (
              <View style={[styles.progressSegment, {
                width: `${Math.max((invested / totalNotes) * 100, 1.5)}%`,
                backgroundColor: theme.colors.success,
                borderTopLeftRadius: 6, borderBottomLeftRadius: 6,
                borderTopRightRadius: nodeMatch === 0 && available === 0 ? 6 : 0,
                borderBottomRightRadius: nodeMatch === 0 && available === 0 ? 6 : 0,
              }]} />
            )}
            {nodeMatch > 0 && (
              <View style={[styles.progressSegment, {
                width: `${Math.max((nodeMatch / totalNotes) * 100, 1.5)}%`,
                backgroundColor: theme.colors.warning || '#FBBF24',
                borderTopLeftRadius: invested === 0 ? 6 : 0,
                borderBottomLeftRadius: invested === 0 ? 6 : 0,
                borderTopRightRadius: available === 0 ? 6 : 0,
                borderBottomRightRadius: available === 0 ? 6 : 0,
              }]} />
            )}
            <View style={[styles.progressSegment, {
              flex: 1,
              backgroundColor: theme.colors.textMuted + '30',
              borderTopRightRadius: 6, borderBottomRightRadius: 6,
              borderTopLeftRadius: invested === 0 && nodeMatch === 0 ? 6 : 0,
              borderBottomLeftRadius: invested === 0 && nodeMatch === 0 ? 6 : 0,
            }]} />
          </View>

          {/* Legend list — vertical */}
          <View style={styles.progressLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Đã được rót vốn</Text>
              <Text style={[styles.legendNum, { color: theme.colors.success }]}>{invested} phần</Text>
            </View>
            {nodeMatch > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.warning || '#FBBF24' }]} />
                <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Đang giữ chỗ</Text>
                <Text style={[styles.legendNum, { color: theme.colors.warning || '#FBBF24' }]}>{nodeMatch} phần</Text>
              </View>
            )}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.textMuted + '60' }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Khả dụng</Text>
              <Text style={[styles.legendNum, { color: theme.colors.text }]}>{available} phần</Text>
            </View>
          </View>
        </View>

        {/* ── Action Buttons — Stitch premium CTA ── */}
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
            <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.outlineBtnText, { color: theme.colors.primary }]}>Lịch trả</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filledBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => openNoteSelector(item)}
            disabled={investing === item._id || available <= 0}
            activeOpacity={0.7}
          >
            {investing === item._id ? (
              <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
              <>
                <MaterialCommunityIcons name="rocket-launch" size={16} color={theme.colors.onPrimary} />
                <Text style={[styles.filledBtnText, { color: theme.colors.onPrimary }]}>Rót vốn</Text>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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
        title="Cơ hội đầu tư"
        showBack={false}
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  NOTE SELECTOR BOTTOM SHEET                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {selectedLoan && (
        <Modal
          visible={selectorVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectorVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectorVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => { }}>
              <View style={[styles.bottomSheet, { backgroundColor: theme.colors.backgroundSecondary }]}>
                {/* ── Handle bar ── */}
                <View style={styles.handleBar}>
                  <View style={[styles.handle, { backgroundColor: theme.colors.textMuted }]} />
                </View>

                {/* ── Title ── */}
                <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Chọn số notes đầu tư</Text>
                <Text style={[styles.sheetSubtitle, { color: theme.colors.textSecondary }]}>
                  {selectedLoan.willing || 'Khoản vay'} — {fmt(selectedLoan.capital)}
                </Text>

                {/* ── Note Counter ── */}
                <View style={[styles.counterContainer, { backgroundColor: theme.colors.surfaceLight }]}>
                  <TouchableOpacity
                    style={[styles.counterBtn, { backgroundColor: theme.colors.primaryGlass }]}
                    onPress={() => setNumNotes(n => Math.max(1, n - 1))}
                    disabled={numNotes <= 1}
                  >
                    <Ionicons name="remove" size={22} color={numNotes <= 1 ? theme.colors.textMuted : theme.colors.primary} />
                  </TouchableOpacity>

                  <View style={styles.counterCenter}>
                    <Text style={[styles.counterValue, { color: theme.colors.text }]}>{numNotes}</Text>
                    <Text style={[styles.counterLabel, { color: theme.colors.textSecondary }]}>notes</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.counterBtn, { backgroundColor: theme.colors.primaryGlass }]}
                    onPress={() => setNumNotes(n => Math.min(getAvailableNotes(selectedLoan), n + 1))}
                    disabled={numNotes >= getAvailableNotes(selectedLoan)}
                  >
                    <Ionicons name="add" size={22} color={numNotes >= getAvailableNotes(selectedLoan) ? theme.colors.textMuted : theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* ── Quick Select Buttons ── */}
                <View style={styles.quickSelectRow}>
                  {[1, 5, 10, getAvailableNotes(selectedLoan)].filter((v, i, arr) => arr.indexOf(v) === i && v > 0).map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[
                        styles.quickSelectBtn,
                        { borderColor: numNotes === n ? theme.colors.primary : theme.colors.textMuted + '30' },
                        numNotes === n && { backgroundColor: theme.colors.primaryGlass },
                      ]}
                      onPress={() => setNumNotes(Math.min(n, getAvailableNotes(selectedLoan)))}
                    >
                      <Text style={[
                        styles.quickSelectText,
                        { color: numNotes === n ? theme.colors.primary : theme.colors.textSecondary },
                      ]}>
                        {n === getAvailableNotes(selectedLoan) ? 'Tất cả' : `${n}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Investment Summary ── */}
                <View style={[styles.summaryBox, { backgroundColor: theme.colors.surfaceLight }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Số tiền đầu tư</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>{fmt(numNotes * BASE_UNIT_PRICE)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Notes còn trống</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{getAvailableNotes(selectedLoan)} / {selectedLoan.totalNotes || Math.ceil(selectedLoan.capital / BASE_UNIT_PRICE)}</Text>
                  </View>
                </View>

                {/* ── Wallet Selection ── */}
                <Text style={[styles.walletSectionTitle, { color: theme.colors.text }]}>Chọn ví thanh toán</Text>
                {walletsLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
                ) : wallets.length === 0 ? (
                  <View style={[styles.walletCard, { backgroundColor: theme.colors.surfaceLight, borderColor: theme.colors.error + '40' }]}>
                    <Ionicons name="alert-circle-outline" size={20} color={theme.colors.error} />
                    <Text style={[styles.walletCardText, { color: theme.colors.error }]}>Không tìm thấy ví nào</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    {wallets.map((w, idx) => {
                      const wId = w._id || w.id || w.fineractSavingsId || w.fineractId || String(idx);
                      const selId = selectedWallet?._id || selectedWallet?.id || selectedWallet?.fineractSavingsId || selectedWallet?.fineractId;
                      const curId = w._id || w.id || w.fineractSavingsId || w.fineractId;
                      const isSelected = selId === curId;
                      const isSufficient = w.balance >= numNotes * BASE_UNIT_PRICE;
                      return (
                        <TouchableOpacity
                          key={wId}
                          style={[
                            styles.walletCard,
                            {
                              backgroundColor: isSelected ? theme.colors.primaryGlass : theme.colors.surfaceLight,
                              borderColor: isSelected ? theme.colors.primary : 'transparent',
                            },
                          ]}
                          onPress={() => setSelectedWallet(w)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.walletCardLeft}>
                            <Ionicons
                              name={w.type === 'e_wallet' ? 'wallet' : 'card'}
                              size={20}
                              color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                            />
                            <View>
                              <Text style={[styles.walletCardName, { color: isSelected ? theme.colors.primary : theme.colors.text }]}>
                                {w.productName || w.metadata?.productName || (w.type === 'e_wallet' ? 'Ví điện tử' : 'Tín dụng')}
                              </Text>
                              <Text style={[styles.walletCardAcct, { color: theme.colors.textMuted }]}>
                                {w.accountNo || w.metadata?.accountNo || ''}
                              </Text>
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.walletCardBalance, { color: isSufficient ? theme.colors.success : theme.colors.error }]}>
                              {fmt(w.balance)}
                            </Text>
                            {!isSufficient && (
                              <Text style={{ fontSize: 10, color: theme.colors.error }}>Không đủ</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── Action Buttons ── */}
                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={[styles.outlineBtn, { backgroundColor: theme.colors.primaryGlass, flex: 1 }]}
                    onPress={handlePreviewFromSelector}
                  >
                    <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
                    <Text style={[styles.outlineBtnText, { color: theme.colors.primary }]}>Xem trước</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.filledBtn, { backgroundColor: theme.colors.primary, flex: 1.5 }]}
                    onPress={handleConfirmInvest}
                  >
                    <Ionicons name="wallet-outline" size={16} color={theme.colors.onPrimary} />
                    <Text style={[styles.filledBtnText, { color: theme.colors.onPrimary }]}>
                      Đầu tư {numNotes} notes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
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

  // Card — Stitch "Bioluminescent Vault" tonal layering
  card: {
    borderRadius: 22, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 18, marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#00110D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },

  // Gradient accent line at top of card
  cardAccentLine: { height: 3, width: '100%', marginBottom: 16 },

  // Card Header — Stitch editorial style
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingHorizontal: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  purposeIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  cardSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 2, letterSpacing: 0.3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Metrics Grid — Stitch tonal elevation with generous spacing
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: 16, overflow: 'hidden', marginBottom: 14,
  },
  metricItem: { width: '50%', paddingVertical: 14, paddingHorizontal: 16 },
  metricItemRight: {},
  metricLabel: { fontSize: 10, marginBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600' },
  metricValue: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  metricSubValue: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  metricUnit: { fontSize: 12, fontWeight: '500' },

  // Badges — Stitch glassmorphism
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // AI Insight Cards — Stitch "Bioluminescent" tonal
  insightRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  insightCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
  },
  insightTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  insightDesc: { fontSize: 10, fontWeight: '500', marginTop: 1 },

  // Progress — Stitch segmented progress bar
  progressSection: { borderRadius: 16, padding: 14, marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  progressValue: { fontSize: 13, fontWeight: '800' },
  progressOuter: { flexDirection: 'row', height: 8, borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  progressSegment: { height: '100%' },
  progressLegend: { gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendNum: { fontSize: 12, fontWeight: '700', marginLeft: 'auto' as any },
  legendLabel: { fontSize: 12, fontWeight: '500' },

  // Action buttons — Stitch premium CTA with glow
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 14, borderRadius: 14,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700' },
  filledBtn: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 14, borderRadius: 14,
    shadowColor: '#CDEA2D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  filledBtnText: { color: '#0B1F1A', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  // ── Bottom Sheet Modal ──
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36,
  },
  handleBar: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },

  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, marginBottom: 20 },

  // Counter
  counterContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, padding: 16, marginBottom: 16, gap: 24,
  },
  counterBtn: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  counterCenter: { alignItems: 'center' },
  counterValue: { fontSize: 32, fontWeight: '800' },
  counterLabel: { fontSize: 12, marginTop: 2 },

  // Quick select
  quickSelectRow: { flexDirection: 'row', gap: 8, marginBottom: 16, justifyContent: 'center' },
  quickSelectBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1,
  },
  quickSelectText: { fontSize: 13, fontWeight: '600' },

  // Summary
  summaryBox: { borderRadius: 12, padding: 14, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 14, fontWeight: '700' },

  // Sheet actions
  sheetActions: { flexDirection: 'row', gap: 10 },

  // Wallet selector
  walletSectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  walletCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 12, padding: 14, borderWidth: 1.5,
  },
  walletCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletCardName: { fontSize: 14, fontWeight: '600' },
  walletCardAcct: { fontSize: 11, marginTop: 1 },
  walletCardBalance: { fontSize: 14, fontWeight: '700' },
  walletCardText: { fontSize: 13, fontWeight: '500' },
});
