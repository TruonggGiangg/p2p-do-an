/**
 * InvestmentFlowScreen — 4-step investment wizard
 * Step 1: Choose number of notes
 * Step 2: Preview earnings schedule
 * Step 3: Select payment wallet
 * Step 4: Confirm & submit
 *
 * Design: Finesse Wallet — Deep Teal + Lime Green
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Animated, Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import { PinVerifyModal } from '../../../components/common/PinVerifyModal';
import { OTPVerifyModal } from '../../../components/common/OTPVerifyModal';
import { CommonButton } from '../../../components/common/CommonButton';
import investService, { AvailableLoanItem, LenderScheduleItem } from '../services/invest.service';
import { walletAPI } from '../../wallet/api/wallet.api';
import type { Wallet } from '../../../types/auth.types';
import { OtpActionType } from '../../../types/otp.types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_UNIT_PRICE = 500_000;

function fmt(n: number): string { return n.toLocaleString('vi-VN') + ' ₫'; }

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function InvestmentFlowScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const loan: AvailableLoanItem = route.params?.loan;
  const insets = useSafeAreaInsets();

  // ── State ──
  const [step, setStep] = useState(1);
  const [numNotes, setNumNotes] = useState(1);
  const [schedule, setSchedule] = useState<LenderScheduleItem[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<any>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [result, setResult] = useState<{ success: boolean; contractId?: string; _id?: string; error?: string } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);

  // ── Derived ──
  const totalNotes = loan?.totalNotes || Math.ceil((loan?.capital || 0) / BASE_UNIT_PRICE);
  const nodeMatch = loan?.nodeMatch || 0;
  const invested = loan?.investedNotes || 0;
  const available = Math.max(0, totalNotes - nodeMatch - invested);
  const investCapital = numNotes * BASE_UNIT_PRICE;
  const annualRate = loan?.fdInterestRate || (loan?.monthlyRatePercent || 0) * 12;

  // ── Animation ──
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(progressAnim, { toValue: step, useNativeDriver: false }).start();
  }, [step]);

  // ══════════════════════════════════════════
  //  STEP 2: Fetch schedule preview
  // ══════════════════════════════════════════
  const fetchSchedule = async () => {
    try {
      setScheduleLoading(true);
      const res = await investService.getSchedulePreview(loan._id, numNotes);
      setSchedule(res.schedule || []);
      setScheduleSummary(res);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || 'Không thể tải lịch trình');
    } finally {
      setScheduleLoading(false);
    }
  };

  // ══════════════════════════════════════════
  //  STEP 3: Fetch wallets
  // ══════════════════════════════════════════
  const fetchWallets = async () => {
    try {
      setWalletsLoading(true);
      const res = await walletAPI.getWallets();
      const active = (res.wallets || []).filter((w: any) => !w.status || w.status.toString().toLowerCase() !== 'closed');
      setWallets(active);
      const defaultW = active.find((w: any) => w.isDefault) || active[0];
      setSelectedWallet(defaultW || null);
    } catch (e: any) {
      setWallets([]);
    } finally {
      setWalletsLoading(false);
    }
  };

  // ══════════════════════════════════════════
  //  STEP 4: Submit investment
  // ══════════════════════════════════════════
  const handleSubmit = async (otpSessionId?: string) => {
    if (!agreed) {
      Alert.alert('Chưa đồng ý', 'Vui lòng đồng ý với điều khoản đầu tư trước khi xác nhận.');
      return;
    }
    try {
      setSubmitting(true);
      const contract = await investService.createContract({
        loanApplicationId: loan._id,
        numNotes,
        ...(otpSessionId ? { otpSessionId } : {}),
      });
      setResult({ success: true, contractId: contract.contractId, _id: contract._id });
    } catch (e: any) {
      setResult({ success: false, error: e?.response?.data?.message || e?.message || 'Đầu tư thất bại' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Navigation between steps ──
  const goNext = () => {
    if (step === 1) {
      setStep(2);
      fetchSchedule();
    } else if (step === 2) {
      setStep(3);
      fetchWallets();
    } else if (step === 3) {
      if (!selectedWallet) {
        Alert.alert('Chưa chọn ví', 'Vui lòng chọn ví thanh toán');
        return;
      }
      if (selectedWallet.balance < investCapital) {
        Alert.alert('Số dư không đủ', `Cần ${fmt(investCapital)}, hiện có ${fmt(selectedWallet.balance)}`);
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (!agreed) {
        Alert.alert('Chưa đồng ý', 'Vui lòng đồng ý với điều khoản đầu tư trước khi xác nhận.');
        return;
      }
      setShowPinModal(true);
    }
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  // ═══════════════════════════════════════════════════════════
  //  STEPPER BAR
  // ═══════════════════════════════════════════════════════════
  const StepperBar = () => (
    <View style={styles.stepperContainer}>
      {[1, 2, 3, 4].map((s, idx) => (
        <React.Fragment key={s}>
          <View style={[
            styles.stepDot,
            {
              backgroundColor: s <= step ? theme.colors.primary : theme.colors.textMuted + '40',
              ...(s <= step ? { shadowColor: theme.colors.primary, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 } : {}),
            },
          ]}>
            {s < step ? (
              <Ionicons name="checkmark" size={10} color={theme.colors.onPrimary} />
            ) : (
              <Text style={[styles.stepDotText, { color: s <= step ? theme.colors.onPrimary : theme.colors.textMuted }]}>{s}</Text>
            )}
          </View>
          {idx < 3 && (
            <View style={[styles.stepLine, { backgroundColor: s < step ? theme.colors.primary : theme.colors.textMuted + '25' }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const stepTitles = ['Chọn số lượng', 'Xem trước lợi nhuận', 'Chọn ví thanh toán', 'Xác nhận đầu tư'];

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: NODE SELECTOR
  // ═══════════════════════════════════════════════════════════
  const Step1 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Loan Info Card */}
      <View style={[styles.infoCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <View style={styles.infoHeader}>
          <LinearGradient colors={[theme.colors.primary + '30', theme.colors.success + '18']} style={styles.infoIcon}>
            <MaterialCommunityIcons name="file-document-outline" size={20} color={theme.colors.primary} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: theme.colors.text }]} numberOfLines={1}>{loan?.willing || 'Khoản vay'}</Text>
            <Text style={[styles.infoSub, { color: theme.colors.textMuted }]}>Mã #{loan?._id?.slice(-4)?.toUpperCase()} • Đã thẩm định</Text>
          </View>
          <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.success + '20' }]}>
            <Ionicons name="shield-checkmark" size={11} color={theme.colors.success} />
            <Text style={[styles.verifiedText, { color: theme.colors.success }]}>Đã xác minh</Text>
          </View>
        </View>
        <View style={[styles.metricsGrid, { backgroundColor: theme.colors.surfaceLight }]}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>GIÁ TRỊ KHOẢN VAY</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(loan?.capital || 0)}</Text>
          </View>
          <View style={[styles.metricItem, styles.metricRight]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>LÃI SUẤT FD</Text>
            <Text style={[styles.metricValue, { color: theme.colors.primary }]}>{annualRate.toFixed(1)}%/năm</Text>
          </View>
          <View style={[styles.metricItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.textMuted + '15' }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>KỲ HẠN</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{loan?.periodMonth} tháng</Text>
          </View>
          <View style={[styles.metricItem, styles.metricRight, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.textMuted + '15' }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>TỔNG THU NHẬN</Text>
            <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{fmt(loan?.entirelyPay || 0)}</Text>
          </View>
        </View>
        {/* Progress */}
        <View style={[styles.progressSection, { backgroundColor: theme.colors.surfaceLight }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>TIẾN ĐỘ HUY ĐỘNG</Text>
            <Text style={[styles.progressValue, { color: theme.colors.primary }]}>{nodeMatch + invested}/{totalNotes} phần</Text>
          </View>
          <View style={styles.progressBar}>
            {invested > 0 && <View style={[styles.progressSeg, { width: `${(invested / totalNotes) * 100}%`, backgroundColor: theme.colors.success, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />}
            {nodeMatch > 0 && <View style={[styles.progressSeg, { width: `${(nodeMatch / totalNotes) * 100}%`, backgroundColor: theme.colors.warning || '#FBBF24' }]} />}
            <View style={[styles.progressSeg, { flex: 1, backgroundColor: theme.colors.textMuted + '30', borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />
          </View>
        </View>
      </View>

      {/* Node Selector */}
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Số lượng phần đầu tư</Text>
      <View style={[styles.counterContainer, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <TouchableOpacity
          style={[styles.counterBtn, { backgroundColor: theme.colors.primaryGlass }]}
          onPress={() => setNumNotes(n => Math.max(1, n - 1))}
          disabled={numNotes <= 1}
        >
          <Ionicons name="remove" size={24} color={numNotes <= 1 ? theme.colors.textMuted : theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.counterCenter}>
          <Text style={[styles.counterValue, { color: theme.colors.text }]}>{numNotes}</Text>
          <Text style={[styles.counterLabel, { color: theme.colors.textSecondary }]}>phần</Text>
        </View>
        <TouchableOpacity
          style={[styles.counterBtn, { backgroundColor: theme.colors.primaryGlass }]}
          onPress={() => setNumNotes(n => Math.min(available, n + 1))}
          disabled={numNotes >= available}
        >
          <Ionicons name="add" size={24} color={numNotes >= available ? theme.colors.textMuted : theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Quick Select */}
      <View style={styles.quickRow}>
        {[1, 5, 10, available].filter((v, i, arr) => arr.indexOf(v) === i && v > 0).map(n => (
          <TouchableOpacity
            key={n}
            style={[
              styles.quickChip,
              { borderColor: numNotes === n ? theme.colors.primary : theme.colors.textMuted + '30' },
              numNotes === n && { backgroundColor: theme.colors.primaryGlass },
            ]}
            onPress={() => setNumNotes(Math.min(n, available))}
          >
            <Text style={[styles.quickText, { color: numNotes === n ? theme.colors.primary : theme.colors.textSecondary }]}>
              {n === available ? 'Tối đa' : `${n} phần`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={[styles.summaryCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <Text style={[styles.summaryBigLabel, { color: theme.colors.textSecondary }]}>Tổng vốn đầu tư</Text>
        <Text style={[styles.summaryBigValue, { color: theme.colors.text }]}>{fmt(investCapital)}</Text>
        <View style={styles.summarySmallRow}>
          <MaterialCommunityIcons name="trending-up" size={16} color={theme.colors.primary} />
          <Text style={[styles.summarySmallText, { color: theme.colors.primary }]}>
            Lợi nhuận kỳ vọng: ~{fmt(Math.round(investCapital * (annualRate / 100) * (loan?.periodMonth || 12) / 12))}
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  //  STEP 2: SCHEDULE PREVIEW
  // ═══════════════════════════════════════════════════════════
  const Step2 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {scheduleLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Đang tính toán lịch trình...</Text>
        </View>
      ) : (
        <>
          {/* Hero Summary */}
          <LinearGradient
            colors={[theme.colors.backgroundSecondary, theme.colors.primary + '10']}
            style={styles.heroCard}
          >
            <Text style={[styles.heroLabel, { color: theme.colors.textSecondary }]}>VỐN ĐẦU TƯ</Text>
            <Text style={[styles.heroValue, { color: theme.colors.text }]}>{fmt(scheduleSummary?.capital || investCapital)}</Text>
            <Text style={[styles.heroMeta, { color: theme.colors.textMuted }]}>
              {loan?.periodMonth} tháng · Lãi suất: {annualRate.toFixed(1)}%/năm · {numNotes} phần
            </Text>
            <View style={styles.heroColumns}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroColLabel, { color: theme.colors.textMuted }]}>Tổng nhận</Text>
                <Text style={[styles.heroColValue, { color: theme.colors.text }]}>{fmt(scheduleSummary?.summary?.totalIncome || scheduleSummary?.entirelyPay || 0)}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.heroColLabel, { color: theme.colors.textMuted }]}>Lợi nhuận</Text>
                <Text style={[styles.heroColValue, { color: theme.colors.primary }]}>+{fmt(scheduleSummary?.summary?.totalInterest || scheduleSummary?.entirelyProfit || 0)}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Schedule Table */}
          <View style={[styles.tableCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <View style={[styles.tableHeader, { borderBottomColor: theme.colors.textMuted + '15' }]}>
              <Text style={[styles.tableHeaderText, { color: theme.colors.textMuted, flex: 0.5 }]}>KỲ</Text>
              <Text style={[styles.tableHeaderText, { color: theme.colors.textMuted, flex: 1, textAlign: 'right' }]}>GỐC</Text>
              <Text style={[styles.tableHeaderText, { color: theme.colors.textMuted, flex: 1, textAlign: 'right' }]}>LÃI</Text>
              <Text style={[styles.tableHeaderText, { color: theme.colors.textMuted, flex: 1, textAlign: 'right' }]}>TỔNG</Text>
            </View>
            {schedule.map((item, idx) => (
              <View key={idx} style={[styles.tableRow, idx % 2 === 0 && { backgroundColor: theme.colors.surfaceLight }]}>
                <Text style={[styles.tableCell, { color: theme.colors.textSecondary, flex: 0.5 }]}>{item.period}</Text>
                <Text style={[styles.tableCell, { color: theme.colors.textPrimary, flex: 1, textAlign: 'right' }]}>{fmt(item.principal)}</Text>
                <Text style={[styles.tableCell, { color: theme.colors.primary, flex: 1, textAlign: 'right' }]}>{fmt(item.interest)}</Text>
                <Text style={[styles.tableCellBold, { color: theme.colors.text, flex: 1, textAlign: 'right' }]}>{fmt(item.total)}</Text>
              </View>
            ))}
            {/* Total */}
            <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: theme.colors.primary + '30' }]}>
              <Text style={[styles.tableCellBold, { color: theme.colors.primary, flex: 0.5 }]}>Σ</Text>
              <Text style={[styles.tableCellBold, { color: theme.colors.textPrimary, flex: 1, textAlign: 'right' }]}>{fmt(scheduleSummary?.summary?.totalPrincipal || 0)}</Text>
              <Text style={[styles.tableCellBold, { color: theme.colors.primary, flex: 1, textAlign: 'right' }]}>{fmt(scheduleSummary?.summary?.totalInterest || 0)}</Text>
              <Text style={[styles.tableCellBold, { color: theme.colors.primary, flex: 1, textAlign: 'right' }]}>{fmt(scheduleSummary?.summary?.totalIncome || 0)}</Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  //  STEP 3: WALLET SELECTION
  // ═══════════════════════════════════════════════════════════
  const Step3 = () => {
    const getWalletId = (w: Wallet) => w._id || (w as any).id || w.fineractSavingsId || (w as any).fineractId || '';
    const selId = selectedWallet ? getWalletId(selectedWallet) : '';

    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        {/* Mini Summary */}
        <View style={[styles.miniSummary, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
          <Text style={[styles.miniSummaryText, { color: theme.colors.text }]} numberOfLines={1}>
            {loan?.willing || 'Khoản vay'} · {numNotes} phần · {fmt(investCapital)}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Chọn ví để thanh toán</Text>

        {walletsLoading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 32 }} />
        ) : wallets.length === 0 ? (
          <View style={[styles.emptyWallet, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <Ionicons name="alert-circle-outline" size={24} color={theme.colors.error} />
            <Text style={[styles.emptyWalletText, { color: theme.colors.error }]}>Không tìm thấy ví nào</Text>
          </View>
        ) : (
          wallets.map((w, idx) => {
            const wId = getWalletId(w);
            const isSelected = selId === wId;
            const isSufficient = w.balance >= investCapital;
            return (
              <TouchableOpacity
                key={wId || idx}
                style={[
                  styles.walletCard,
                  {
                    backgroundColor: isSelected ? theme.colors.primaryGlass : theme.colors.backgroundSecondary,
                    borderColor: isSelected ? theme.colors.primary : 'transparent',
                  },
                ]}
                onPress={() => setSelectedWallet(w)}
                activeOpacity={0.7}
              >
                <View style={styles.walletLeft}>
                  <View style={[styles.walletIcon, { backgroundColor: isSelected ? theme.colors.primary + '20' : theme.colors.surfaceLight }]}>
                    <Ionicons name="wallet" size={20} color={isSelected ? theme.colors.primary : theme.colors.textSecondary} />
                  </View>
                  <View>
                    <Text style={[styles.walletName, { color: isSelected ? theme.colors.primary : theme.colors.text }]}>
                      {w.productName || (w as any).metadata?.productName || 'Ví điện tử'}
                    </Text>
                    <Text style={[styles.walletAcct, { color: theme.colors.textMuted }]}>{w.accountNo || (w as any).metadata?.accountNo}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.walletBalance, { color: isSufficient ? theme.colors.success : theme.colors.error }]}>{fmt(w.balance)}</Text>
                  <View style={[styles.walletStatus, { backgroundColor: isSufficient ? theme.colors.success + '15' : theme.colors.error + '15' }]}>
                    <Ionicons name={isSufficient ? 'checkmark-circle' : 'close-circle'} size={10} color={isSufficient ? theme.colors.success : theme.colors.error} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: isSufficient ? theme.colors.success : theme.colors.error }}>
                      {isSufficient ? 'Đủ số dư' : 'Không đủ'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Balance Check */}
        {selectedWallet && (
          <View style={[styles.balanceCheck, { backgroundColor: theme.colors.primaryGlass }]}>
            <Ionicons name="information-circle" size={16} color={theme.colors.primary} />
            <Text style={[styles.balanceCheckText, { color: theme.colors.textSecondary }]}>
              Cần thanh toán: <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{fmt(investCapital)}</Text>
              {' · '}Số dư: <Text style={{ color: selectedWallet.balance >= investCapital ? theme.colors.success : theme.colors.error, fontWeight: '700' }}>{fmt(selectedWallet.balance)}</Text>
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  // ═══════════════════════════════════════════════════════════
  //  STEP 4: CONFIRMATION
  // ═══════════════════════════════════════════════════════════
  const Step4 = () => {
    if (result) {
      return (
        <View style={[styles.resultContainer, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.resultBgCircle1, { backgroundColor: theme.colors.primary + '18' }]} />
          <View style={[styles.resultBgCircle2, { backgroundColor: theme.colors.primary + '12' }]} />

          <View style={[styles.resultIcon, { backgroundColor: result.success ? theme.colors.primary + '18' : theme.colors.error + '18' }]}>
            <View style={[styles.resultIconInner, { backgroundColor: result.success ? theme.colors.primary : theme.colors.error }]}>
              <Ionicons
                name={result.success ? 'checkmark' : 'close'}
                size={36}
                color={result.success ? theme.colors.onPrimary : '#fff'}
              />
            </View>
          </View>
          <Text style={[styles.resultTitle, { color: theme.colors.text }]}>
            {result.success ? 'Đầu tư thành công!' : 'Đầu tư thất bại'}
          </Text>
          <Text style={[styles.resultSub, { color: theme.colors.textSecondary }]}>
            {result.success
              ? 'Hợp đồng đầu tư đã được tạo thành công.'
              : result.error || 'Đã xảy ra lỗi'}
          </Text>

          {result.success && (
            <View style={[styles.resultCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary + '30' }]}>
              <View style={styles.resultCardRow}>
                <MaterialCommunityIcons name="file-document-check" size={16} color={theme.colors.primary} />
                <Text style={[styles.resultCardText, { color: theme.colors.text }]}>Mã HĐ: {result.contractId}</Text>
              </View>
              <View style={[styles.resultCardDivider, { backgroundColor: theme.colors.primary + '20' }]} />
              <View style={styles.resultCardRow}>
                <MaterialCommunityIcons name="cash-multiple" size={16} color={theme.colors.primary} />
                <Text style={[styles.resultCardText, { color: theme.colors.text }]}>Vốn đầu tư: {fmt(investCapital)}</Text>
              </View>
              <View style={[styles.resultCardDivider, { backgroundColor: theme.colors.primary + '20' }]} />
              <View style={styles.resultCardRow}>
                <MaterialCommunityIcons name="chart-line" size={16} color={theme.colors.primary} />
                <Text style={[styles.resultCardText, { color: theme.colors.text }]}>Theo dõi lợi nhuận trong danh sách hợp đồng</Text>
              </View>
            </View>
          )}

          <View style={styles.resultActions}>
            {result.success && (
              <CommonButton
                title="Xem hợp đồng"
                variant="primary"
                size="lg"
                icon="file-document-outline"
                onPress={() => navigation.navigate('InvestmentContractDetail', { contractId: result._id })}
              />
            )}
            <CommonButton
              title="Quay lại danh sách"
              variant={result.success ? 'outline' : 'primary'}
              size="md"
              onPress={() => navigation.goBack()}
            />
          </View>
        </View>
      );
    }

    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        {/* Review Card */}
        <View style={[styles.reviewCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <Text style={[styles.reviewSectionTitle, { color: theme.colors.textMuted }]}>THÔNG TIN KHOẢN VAY</Text>
          <ReviewRow label="Mục đích vay" value={loan?.willing || '—'} theme={theme} />
          <ReviewRow label="Mã khoản vay" value={`#${loan?._id?.slice(-4)?.toUpperCase()}`} theme={theme} />
          <ReviewRow label="Kỳ hạn" value={`${loan?.periodMonth} tháng`} theme={theme} />

          <View style={[styles.reviewDivider, { backgroundColor: theme.colors.textMuted + '15' }]} />

          <Text style={[styles.reviewSectionTitle, { color: theme.colors.textMuted }]}>CHI TIẾT ĐẦU TƯ</Text>
          <ReviewRow label="Số phần đầu tư" value={`${numNotes} phần`} theme={theme} />
          <ReviewRow label="Vốn đầu tư" value={fmt(investCapital)} theme={theme} accent />
          <ReviewRow label="Lãi suất FD" value={`${annualRate.toFixed(1)}%/năm`} theme={theme} />
          <ReviewRow label="Lợi nhuận kỳ vọng" value={`+${fmt(scheduleSummary?.summary?.totalInterest || 0)}`} theme={theme} accent />
          <ReviewRow label="Tổng thu nhận" value={fmt(scheduleSummary?.summary?.totalIncome || 0)} theme={theme} />

          <View style={[styles.reviewDivider, { backgroundColor: theme.colors.textMuted + '15' }]} />

          <Text style={[styles.reviewSectionTitle, { color: theme.colors.textMuted }]}>THANH TOÁN</Text>
          <ReviewRow label="Ví thanh toán" value={selectedWallet?.productName || (selectedWallet as any)?.metadata?.productName || 'Ví điện tử'} theme={theme} />
          <ReviewRow label="Số dư sau đầu tư" value={fmt((selectedWallet?.balance || 0) - investCapital)} theme={theme} />
        </View>

        {/* Terms */}
        <TouchableOpacity
          style={styles.termsRow}
          onPress={() => setAgreed(!agreed)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, {
            borderColor: agreed ? theme.colors.primary : theme.colors.textMuted,
            backgroundColor: agreed ? theme.colors.primary : 'transparent',
          }]}>
            {agreed && <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />}
          </View>
          <Text style={[styles.termsText, { color: theme.colors.textSecondary }]}>
            Tôi đồng ý với <Text style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}>điều khoản đầu tư</Text>
          </Text>
        </TouchableOpacity>

        {/* Security */}
        <View style={styles.securityRow}>
          <Ionicons name="lock-closed" size={14} color={theme.colors.textMuted} />
          <Text style={[styles.securityText, { color: theme.colors.textMuted }]}>Giao dịch được bảo mật bởi hệ thống</Text>
        </View>
      </ScrollView>
    );
  };

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  const stepComponents = [Step1, Step2, Step3, Step4];
  const CurrentStep = stepComponents[step - 1];
  const ctaLabels = ['Tiếp tục', 'Tiếp tục', 'Tiếp tục', 'Xác nhận đầu tư'];
  const ctaIcons: any[] = ['arrow-forward', 'arrow-forward', 'arrow-forward', 'shield-checkmark'];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <BinanceHeader
        mode="standard"
        title={stepTitles[step - 1]}
        showBack
        rightComponents={
          <Text style={[styles.stepIndicator, { color: theme.colors.textMuted }]}>{step}/4</Text>
        }
      />
      <StepperBar />
      <CurrentStep />

      {/* Bottom CTA */}
      {!result && (
        <View style={[styles.bottomCta, { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: (step === 4 && !agreed) ? theme.colors.textMuted + '40' : theme.colors.primary,
                opacity: submitting ? 0.7 : 1,
              },
              // Chỉ apply Neon shadow khi nút không bị disable
              (!submitting && !(step === 4 && !agreed)) && {
                shadowColor: theme.colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 6,
              }
            ]}
            onPress={goNext}
            disabled={submitting || (step === 4 && !agreed)}
            activeOpacity={0.7}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
              <>
                <Ionicons name={ctaIcons[step - 1]} size={18} color={theme.colors.onPrimary} />
                <Text style={[styles.primaryBtnText, { color: theme.colors.onPrimary }]}>{ctaLabels[step - 1]}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* PIN Verification */}
      <PinVerifyModal
        visible={showPinModal}
        onSuccess={() => { setShowPinModal(false); setShowOTPModal(true); }}
        onCancel={() => setShowPinModal(false)}
        dismissable
        title="Xác thực mã PIN"
        subtitle="Nhập mã PIN để xác nhận đầu tư"
      />

      {/* OTP Verification */}
      <OTPVerifyModal
        visible={showOTPModal}
        actionType={OtpActionType.INVESTMENT}
        actionData={{ loanId: loan?._id, numNotes, capital: investCapital }}
        title="Xác thực Smart OTP"
        description={`Xác nhận đầu tư ${fmt(investCapital)} vào khoản vay`}
        onSuccess={(data) => { setShowOTPModal(false); handleSubmit(data.sessionId); }}
        onCancel={() => setShowOTPModal(false)}
      />
    </View>
  );
}

// ── Helper Component ──
function ReviewRow({ label, value, theme, accent }: { label: string; value: string; theme: any; accent?: boolean }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={[styles.reviewLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: accent ? theme.colors.primary : theme.colors.text }, accent && { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1 },
  stepContent: { flex: 1, paddingHorizontal: 16 },

  // Stepper
  stepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 40 },
  stepDot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  stepDotText: { fontSize: 11, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, borderRadius: 1 },
  stepIndicator: { fontSize: 14, fontWeight: '600' },

  // Info Card
  infoCard: { borderRadius: 20, padding: 16, marginBottom: 20 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  infoIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  infoTitle: { fontSize: 15, fontWeight: '700' },
  infoSub: { fontSize: 11, marginTop: 2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  verifiedText: { fontSize: 10, fontWeight: '700' },

  // Metrics
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  metricItem: { width: '50%', paddingVertical: 12, paddingHorizontal: 14 },
  metricRight: {},
  metricLabel: { fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
  metricValue: { fontSize: 15, fontWeight: '700' },

  // Progress
  progressSection: { borderRadius: 14, padding: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  progressValue: { fontSize: 12, fontWeight: '700' },
  progressBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressSeg: { height: '100%' },

  // Counter
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, marginTop: 4 },
  counterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 18, padding: 20, gap: 28, marginBottom: 16 },
  counterBtn: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  counterCenter: { alignItems: 'center' },
  counterValue: { fontSize: 22, fontWeight: '700' },
  counterLabel: { fontSize: 12, marginTop: 2 },

  // Quick Select
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 20, justifyContent: 'center' },
  quickChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  quickText: { fontSize: 13, fontWeight: '600' },

  // Summary
  summaryCard: { borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 20 },
  summaryBigLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  summaryBigValue: { fontSize: 20, fontWeight: '700', letterSpacing: 0.3 },
  summarySmallRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  summarySmallText: { fontSize: 13, fontWeight: '600' },

  // Schedule
  loadingBox: { alignItems: 'center', paddingTop: 60 },
  loadingText: { fontSize: 14, marginTop: 12 },
  heroCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  heroLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  heroMeta: { fontSize: 12, marginTop: 6 },
  heroColumns: { flexDirection: 'row', marginTop: 16, gap: 16 },
  heroColLabel: { fontSize: 11, fontWeight: '500' },
  heroColValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  tableCard: { borderRadius: 18, overflow: 'hidden', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tableHeaderText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  tableCell: { fontSize: 12, fontWeight: '500' },
  tableCellBold: { fontSize: 12, fontWeight: '700' },

  // Wallet
  miniSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, marginBottom: 16 },
  miniSummaryText: { fontSize: 14, fontWeight: '600', flex: 1 },
  walletCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 16, padding: 16, borderWidth: 1.5, marginBottom: 10 },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  walletName: { fontSize: 14, fontWeight: '700' },
  walletAcct: { fontSize: 11, marginTop: 2 },
  walletBalance: { fontSize: 15, fontWeight: '700' },
  walletStatus: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  emptyWallet: { alignItems: 'center', padding: 32, borderRadius: 16, gap: 8 },
  emptyWalletText: { fontSize: 14, fontWeight: '600' },
  balanceCheck: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginTop: 8 },
  balanceCheckText: { fontSize: 12, flex: 1 },

  // Confirm
  reviewCard: { borderRadius: 20, padding: 18, marginBottom: 16, marginTop: 4 },
  reviewSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  reviewLabel: { fontSize: 13, fontWeight: '500' },
  reviewValue: { fontSize: 14, fontWeight: '600' },
  reviewDivider: { height: 1, marginVertical: 12, borderRadius: 1 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  termsText: { fontSize: 13, flex: 1 },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 12 },
  securityText: { fontSize: 11 },

  // Result
  resultContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, overflow: 'hidden' },
  resultIcon: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  resultIconInner: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  resultTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  resultSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  resultActions: { gap: 10, marginTop: 24, width: '100%' },
  resultBgCircle1: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -80, right: -80 },
  resultBgCircle2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: -60, left: -60 },
  resultCard: { width: '100%', borderRadius: 16, padding: 16, borderWidth: 1, gap: 10, marginTop: 12 },
  resultCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultCardText: { fontSize: 13, fontWeight: '500', flex: 1 },
  resultCardDivider: { height: 1 },

  // Buttons
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  bottomCta: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12 },
});
