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
  ActivityIndicator, Animated, Dimensions, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, useConfirmModal } from '../../../components';
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
  const modal = useConfirmModal();
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
      modal.error('Lỗi', e?.response?.data?.message || 'Không thể tải lịch trình');
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
      modal.error('Chưa đồng ý', 'Vui lòng đồng ý với điều khoản đầu tư trước khi xác nhận.');
      return;
    }
    try {
      setSubmitting(true);
      const contract = await investService.createContract({
        loanApplicationId: loan._id,
        numNotes,
        ...(otpSessionId ? { otpSessionId } : {}),
      });
      // Nếu hợp đồng cần ký SmartCA (đầu tư trực tiếp) → KHÔNG hiển thị "thành công",
      // điều hướng ngay sang InvestmentContractDetail với autoSign=true để mở SmartCA modal.
      // Tiền sẽ chỉ bị trừ SAU KHI ký xong (server hook finalizeInvestmentAfterSigning).
      const status = String((contract as any)?.status || '');
      if (status === 'pending_signature') {
        (navigation as any).replace('InvestmentContractDetail', {
          contractId: contract._id,
          autoSign: true,
        });
        return;
      }
      // Hợp đồng từ order matching: tự động active + đã trừ tiền → hiển thị màn thành công như cũ.
      setResult({ success: true, contractId: contract.contractId, _id: contract._id });
    } catch (e: any) {
      setResult({ success: false, error: e?.response?.data?.message || e?.message || 'Đầu tư thất bại' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Navigation between steps ──
  const goNext = () => {
    if (step < 4) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    if (step === 1) {
      setStep(2);
      fetchSchedule();
    } else if (step === 2) {
      setStep(3);
      fetchWallets();
    } else if (step === 3) {
      if (!selectedWallet) {
        modal.error('Chưa chọn ví', 'Vui lòng chọn ví thanh toán');
        return;
      }
      if (selectedWallet.balance < investCapital) {
        modal.error('Số dư không đủ', `Cần ${fmt(investCapital)}, hiện có ${fmt(selectedWallet.balance)}`);
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (!agreed) {
        modal.error('Chưa đồng ý', 'Vui lòng đồng ý với điều khoản đầu tư trước khi xác nhận.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPinModal(true);
    }
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  // ═══════════════════════════════════════════════════════════
  //  STEPPER BAR (Linear Styled)
  // ═══════════════════════════════════════════════════════════
  const StepperBar = () => {
    const activeColor = '#1E3A2F'; // Deep Emerald
    const inactiveColor = theme.colors.textMuted + '25';
    
    return (
      <View style={styles.stepperContainer}>
        {[1, 2, 3, 4].map((s, idx) => (
          <View key={s} style={styles.stepSegmentWrapper}>
            <View 
              style={[
                styles.stepSegment, 
                { 
                  backgroundColor: s <= step ? activeColor : inactiveColor,
                  height: s === step ? 4 : 3,
                }
              ]} 
            />
          </View>
        ))}
      </View>
    );
  };

  const stepTitles = ['Chọn số lượng', 'Xem trước lợi nhuận', 'Chọn ví thanh toán', 'Xác nhận đầu tư'];

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: LOAN SELECTOR (Refined)
  // ═══════════════════════════════════════════════════════════
  const Step1 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Modern Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoCardHeader}>
          <View style={styles.loanBadge}>
            <Text style={styles.loanBadgeText}>KHOẢN VAY #{loan?._id?.slice(-4)?.toUpperCase()}</Text>
          </View>
          <View style={styles.verifiedRow}>
            <Ionicons name="shield-checkmark" size={14} color="#059669" />
            <Text style={styles.verifiedText}>Portfolio verified</Text>
          </View>
        </View>

        <Text style={styles.loanTitle}>{loan?.willing || 'Đầu tư khoản vay'}</Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <View style={[styles.metricIconBg, { backgroundColor: '#F0FDF4' }]}>
              <MaterialCommunityIcons name="trending-up" size={16} color="#059669" />
            </View>
            <View>
              <Text style={styles.metricLabel}>LÃI SUẤT</Text>
              <Text style={[styles.metricValue, { color: '#059669' }]}>{annualRate.toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.metricItem}>
            <View style={[styles.metricIconBg, { backgroundColor: '#EFF6FF' }]}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.metricLabel}>KỲ HẠN</Text>
              <Text style={styles.metricValue}>{loan?.periodMonth} tháng</Text>
            </View>
          </View>

          <View style={styles.metricItem}>
            <View style={[styles.metricIconBg, { backgroundColor: '#FFF7ED' }]}>
              <MaterialCommunityIcons name="chart-pie" size={16} color="#D97706" />
            </View>
            <View>
              <Text style={styles.metricLabel}>HUY ĐỘNG</Text>
              <Text style={styles.metricValue}>{Math.round(((nodeMatch + invested) / totalNotes) * 100)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.availableInfo}>
          <View style={styles.availableBarBg}>
            <View 
              style={[
                styles.availableBarFill, 
                { width: `${Math.min(100, ((nodeMatch + invested) / totalNotes) * 100)}%` }
              ]} 
            />
          </View>
          <View style={styles.availableTextRow}>
            <Text style={styles.availableSubText}>Còn lại: <Text style={{ color: '#1E3A2F', fontWeight: '700' }}>{available} phần</Text></Text>
            <Text style={styles.availableSubText}>{invested + nodeMatch}/{totalNotes} phần</Text>
          </View>
        </View>
      </View>

      <View style={styles.counterSection}>
        <Text style={styles.inputLabel}>Số lượng muốn đầu tư</Text>
        
        <View style={styles.counterContainer}>
          <TouchableOpacity
            style={[styles.counterBtn, numNotes <= 1 && styles.counterBtnDisabled]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNumNotes(n => Math.max(1, n - 1));
            }}
            disabled={numNotes <= 1}
          >
            <Ionicons name="remove" size={24} color={numNotes <= 1 ? '#D1D5DB' : '#1E3A2F'} />
          </TouchableOpacity>
          
          <View style={styles.counterValueContainer}>
            <Text style={styles.counterValueText}>{numNotes}</Text>
            <Text style={styles.counterUnitText}>PHẦN</Text>
          </View>

          <TouchableOpacity
            style={[styles.counterBtn, numNotes >= available && styles.counterBtnDisabled]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNumNotes(n => Math.min(available, n + 1));
            }}
            disabled={numNotes >= available}
          >
            <Ionicons name="add" size={24} color={numNotes >= available ? '#D1D5DB' : '#1E3A2F'} />
          </TouchableOpacity>
        </View>

        <View style={styles.quickSelectRow}>
          {[1, 5, 10, available].filter((v, i, arr) => arr.indexOf(v) === i && v > 0).map(n => (
            <TouchableOpacity
              key={n}
              style={[styles.quickSelectChip, numNotes === n && styles.quickSelectChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setNumNotes(Math.min(n, available));
              }}
            >
              <Text style={[styles.quickSelectText, numNotes === n && styles.quickSelectTextActive]}>
                {n === available ? 'MAX' : `+${n}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.investmentPreview}>
        <View style={styles.previewDivider} />
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Vốn đầu tư</Text>
          <Text style={styles.previewValue}>{fmt(investCapital)}</Text>
        </View>
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Lợi nhuận ước tính</Text>
          <Text style={[styles.previewValue, { color: '#059669' }]}>
            +{fmt(Math.round(investCapital * (annualRate / 100) * (loan?.periodMonth || 12) / 12))}
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  //  STEP 2: SCHEDULE PREVIEW (Refined)
  // ═══════════════════════════════════════════════════════════
  const Step2 = () => (
    <View style={{ flex: 1 }}>
      {scheduleLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#1E3A2F" />
          <Text style={styles.loadingText}>Đang xử lý lịch trình...</Text>
        </View>
      ) : (
        <>
          <View style={styles.stepContentNoPadding}>
            {/* Hero Summary */}
            <View style={styles.refinedHeroCard}>
              <Text style={styles.refinedHeroLabel}>TỔNG THU NHẬP DỰ KIẾN</Text>
              <Text style={styles.refinedHeroValue}>{fmt(scheduleSummary?.summary?.totalIncome || 0)}</Text>
              
              <View style={styles.refinedHeroMetrics}>
                <View style={styles.refinedHeroMetric}>
                  <Text style={styles.refinedHeroMetricLabel}>Vốn gốc</Text>
                  <Text style={styles.refinedHeroMetricValue}>{fmt(scheduleSummary?.summary?.totalPrincipal || 0)}</Text>
                </View>
                <View style={styles.refinedHeroMetric}>
                  <Text style={styles.refinedHeroMetricLabel}>Lợi nhuận</Text>
                  <Text style={[styles.refinedHeroMetricValue, { color: '#BCF50E' }]}>+{fmt(scheduleSummary?.summary?.totalInterest || 0)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.scheduleHeaderRow}>
              <Text style={styles.scheduleHeaderTitle}>Chi tiết các kỳ thu nhập</Text>
              <Text style={styles.scheduleHeaderSub}>{schedule.length} kỳ</Text>
            </View>

            <ScrollView 
              style={styles.scheduleList} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {schedule.map((item, idx) => (
                <View key={idx} style={styles.scheduleCardItem}>
                  <View style={styles.scheduleCardLeft}>
                    <View style={styles.periodBadge}>
                      <Text style={styles.periodBadgeText}>{item.period}</Text>
                    </View>
                    <View>
                      <Text style={styles.scheduleDateLabel}>Kỳ thứ {item.period}</Text>
                      <Text style={styles.scheduleTypeLabel}>Gốc + Lãi</Text>
                    </View>
                  </View>
                  <View style={styles.scheduleCardRight}>
                    <Text style={styles.scheduleAmountValue}>{fmt(item.total)}</Text>
                    <Text style={styles.scheduleInterestValue}>Lãi: {fmt(item.interest)}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );

  // ═══════════════════════════════════════════════════════════
  //  STEP 3: WALLET SELECTION (Refined)
  // ═══════════════════════════════════════════════════════════
  const Step3 = () => {
    const getWalletId = (w: Wallet) => w._id || (w as any).id || w.fineractSavingsId || (w as any).fineractId || '';
    const selId = selectedWallet ? getWalletId(selectedWallet) : '';

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.stepContentNoPadding}>
          <Text style={[styles.inputLabel, { paddingHorizontal: 16 }]}>Chọn nguồn vốn thanh toán</Text>

          {walletsLoading ? (
            <ActivityIndicator size="small" color="#1E3A2F" style={{ marginTop: 32 }} />
          ) : (
            <ScrollView 
              style={styles.walletList} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {wallets.map((w, idx) => {
                const wId = getWalletId(w);
                const isSelected = selId === wId;
                const isSufficient = w.balance >= investCapital;
                return (
                  <TouchableOpacity
                    key={wId || idx}
                    style={[
                      styles.refinedWalletCard,
                      isSelected && styles.refinedWalletCardSelected
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedWallet(w);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.walletIconCircle}>
                      <Ionicons name="wallet-outline" size={20} color={isSelected ? '#1E3A2F' : '#6B7280'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.refinedWalletName}>{w.productName || 'Ví MyVND'}</Text>
                      <Text style={styles.refinedWalletAcct}>{w.accountNo}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 24 }}>
                      <Text style={[styles.refinedWalletBalance, !isSufficient && { color: '#EF4444' }]}>{fmt(w.balance)}</Text>
                      <Text style={styles.refinedWalletStatus}>{isSufficient ? 'Đủ số dư' : 'Số dư thấp'}</Text>
                    </View>
                    {isSelected && (
                      <View style={styles.selectedCheck}>
                        <Ionicons name="checkmark-circle" size={20} color="#059669" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.paymentSecurityInfo}>
            <Ionicons name="shield-checkmark" size={14} color="#6B7280" />
            <Text style={styles.paymentSecurityText}>Thanh toán được bảo mật bởi hệ thống P2P</Text>
          </View>
        </View>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════
  //  STEP 4: CONFIRMATION & RESULT (Refined)
  // ═══════════════════════════════════════════════════════════
  const Step4 = () => {
    if (result) {
      return (
        <View style={styles.refinedResultContainer}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color="#FFFFFF" />
          </View>
          <Text style={styles.refinedResultTitle}>Giao dịch thành công</Text>
          <Text style={styles.refinedResultSub}>Chúc mừng bạn đã hoàn tất khoản đầu tư. Hệ thống đang tiến hành khớp lệnh.</Text>
          
          <View style={styles.refinedResultCard}>
            <View style={styles.resultDetailsRow}>
              <Text style={styles.resultDetailsLabel}>Mã hợp đồng</Text>
              <Text style={styles.resultDetailsValue}>#{result.contractId?.slice(-6).toUpperCase()}</Text>
            </View>
            <View style={styles.resultDetailsRow}>
              <Text style={styles.resultDetailsLabel}>Tổng đầu tư</Text>
              <Text style={styles.resultDetailsValue}>{fmt(investCapital)}</Text>
            </View>
            <View style={styles.resultDetailsRow}>
              <Text style={styles.resultDetailsLabel}>Kỳ hạn</Text>
              <Text style={styles.resultDetailsValue}>{loan?.periodMonth} tháng</Text>
            </View>
          </View>

          <TouchableOpacity 
            style={styles.refinedResultCta}
            onPress={() => navigation.navigate('InvestmentContractDetail', { contractId: result._id })}
          >
            <Text style={styles.refinedResultCtaText}>Xem chi tiết hợp đồng</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.refinedResultSecondaryCta}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.refinedResultSecondaryCtaText}>Quay lại danh sách</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <View style={styles.orderSummaryCard}>
          <Text style={styles.orderSummaryTitle}>Tóm tắt đầu tư</Text>
          
          <View style={styles.orderItem}>
            <Text style={styles.orderLabel}>Khoản vay</Text>
            <Text style={styles.orderValue} numberOfLines={1}>{loan?.willing || 'Đầu tư'}</Text>
          </View>
          
          <View style={styles.orderItem}>
            <Text style={styles.orderLabel}>Số phần</Text>
            <Text style={styles.orderValue}>{numNotes} phần</Text>
          </View>

          <View style={styles.orderDivider} />
          
          <View style={styles.orderItem}>
            <Text style={styles.orderLabel}>Hệ số lãi suất</Text>
            <Text style={[styles.orderValue, { color: '#059669' }]}>{annualRate.toFixed(1)}%/năm</Text>
          </View>

          <View style={styles.orderItem}>
            <Text style={styles.orderLabel}>Tổng nhận dự kiến</Text>
            <Text style={styles.orderValue}>{fmt(scheduleSummary?.summary?.totalIncome || 0)}</Text>
          </View>

          <View style={styles.orderTotalRow}>
            <Text style={styles.orderTotalLabel}>TỔNG THANH TOÁN</Text>
            <Text style={styles.orderTotalValue}>{fmt(investCapital)}</Text>
          </View>
        </View>

        <View style={styles.refinedTermsBox}>
          <TouchableOpacity 
            style={styles.refinedCheckboxRow}
            onPress={() => {
              Haptics.selectionAsync();
              setAgreed(!agreed);
            }}
          >
            <View style={[styles.refinedCheckbox, agreed && styles.refinedCheckboxActive]}>
              {agreed && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={styles.refinedTermsText}>
              Tôi đã đọc và đồng ý với <Text style={{ color: '#1E3A2F', fontWeight: '600' }}>Điều khoản đầu tư</Text> & <Text style={{ color: '#1E3A2F', fontWeight: '600' }}>Chính sách bảo mật</Text> của P2P.
            </Text>
          </TouchableOpacity>
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
        onForgotPin={() => { setShowPinModal(false); (navigation as any).navigate('PinChange', { resetMode: true }); }}
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


// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  stepIndicator: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: '#1E3A2F' },
  stepContent: { flex: 1, paddingHorizontal: 16 },

  // Stepper
  stepperContainer: {
    flexDirection: 'row',
    height: 4,
    marginHorizontal: 16,
    marginVertical: 8,
    gap: 4,
  },
  stepSegmentWrapper: { flex: 1 },
  stepSegment: { borderRadius: 2 },

  // Step 1: Modern Info Card
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginTop: 12,
    shadowColor: '#1E3A2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  infoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  loanBadge: {
    backgroundColor: '#1E3A2F10',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6
  },
  loanBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E3A2F',
    letterSpacing: 0.5
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669'
  },
  loanTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A2F',
    marginBottom: 20,
    lineHeight: 28
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  metricIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E3A2F'
  },
  availableInfo: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 16
  },
  availableBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 10,
    overflow: 'hidden'
  },
  availableBarFill: {
    height: '100%',
    backgroundColor: '#1E3A2F',
    borderRadius: 3
  },
  availableTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  availableSubText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500'
  },

  // Counter Section
  counterSection: {
    marginTop: 32,
    alignItems: 'center'
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A2F',
    marginBottom: 24
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    padding: 8,
    gap: 12
  },
  counterBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  counterBtnDisabled: {
    opacity: 0.5
  },
  counterValueContainer: {
    width: 100,
    alignItems: 'center'
  },
  counterValueText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1E3A2F'
  },
  counterUnitText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    marginTop: -2
  },
  quickSelectRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24
  },
  quickSelectChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB'
  },
  quickSelectChipActive: {
    backgroundColor: '#1E3A2F',
    borderColor: '#1E3A2F'
  },
  quickSelectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280'
  },
  quickSelectTextActive: {
    color: '#FFFFFF'
  },

  // Investment Preview
  investmentPreview: {
    marginTop: 32,
    paddingHorizontal: 8
  },
  previewDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 20
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280'
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E3A2F'
  },

  // Step 2: Schedule
  stepContentNoPadding: { flex: 1 },
  refinedHeroCard: { backgroundColor: '#1E3A2F', padding: 28, borderRadius: 24, marginHorizontal: 16, marginTop: 12 },
  refinedHeroLabel: { fontSize: 10, fontWeight: '700', color: '#FFFFFF80', letterSpacing: 1 },
  refinedHeroValue: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginTop: 8 },
  refinedHeroMetrics: { flexDirection: 'row', marginTop: 24, gap: 32 },
  refinedHeroMetric: { flex: 1 },
  refinedHeroMetricLabel: { fontSize: 11, fontWeight: '600', color: '#FFFFFF60' },
  refinedHeroMetricValue: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
  scheduleHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  scheduleHeaderTitle: { fontSize: 15, fontWeight: '700', color: '#1E3A2F' },
  scheduleHeaderSub: { fontSize: 12, color: '#6B7280' },
  scheduleList: { flex: 1, paddingHorizontal: 16 },
  scheduleCardItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#F3F4F6' },
  scheduleCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  periodBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1E3A2F10', justifyContent: 'center', alignItems: 'center' },
  periodBadgeText: { fontSize: 13, fontWeight: '800', color: '#1E3A2F' },
  scheduleDateLabel: { fontSize: 13, fontWeight: '700', color: '#1E3A2F' },
  scheduleTypeLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  scheduleCardRight: { alignItems: 'flex-end' },
  scheduleAmountValue: { fontSize: 14, fontWeight: '700', color: '#1E3A2F' },
  scheduleInterestValue: { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 2 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },

  // Step 3: Wallet
  walletList: { flex: 1, paddingHorizontal: 16 },
  refinedWalletCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, marginBottom: 10, gap: 12, borderWidth: 1.5, borderColor: 'transparent' },
  refinedWalletCardSelected: { borderColor: '#1E3A2F', backgroundColor: '#FFFFFF' },
  walletIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' },
  refinedWalletName: { fontSize: 15, fontWeight: '700', color: '#1E3A2F' },
  refinedWalletAcct: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  refinedWalletBalance: { fontSize: 15, fontWeight: '800', color: '#1E3A2F' },
  refinedWalletStatus: { fontSize: 10, fontWeight: '700', color: '#6B7280', marginTop: 4 },
  selectedCheck: { position: 'absolute', top: 12, right: 12 },
  paymentSecurityInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  paymentSecurityText: { fontSize: 11, color: '#9CA3AF' },

  // Step 4: Confirm
  orderSummaryCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginTop: 12, marginHorizontal: 16 },
  orderSummaryTitle: { fontSize: 15, fontWeight: '800', color: '#1E3A2F', marginBottom: 20 },
  orderItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  orderLabel: { fontSize: 14, color: '#6B7280' },
  orderValue: { fontSize: 14, fontWeight: '700', color: '#1E3A2F', flex: 1, textAlign: 'right', marginLeft: 16 },
  orderDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
  orderTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  orderTotalLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 1 },
  orderTotalValue: { fontSize: 22, fontWeight: '800', color: '#1E3A2F' },
  refinedTermsBox: { paddingHorizontal: 24, marginTop: 24 },
  refinedCheckboxRow: { flexDirection: 'row', gap: 12 },
  refinedCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  refinedCheckboxActive: { backgroundColor: '#1E3A2F', borderColor: '#1E3A2F' },
  refinedTermsText: { fontSize: 13, color: '#6B7280', lineHeight: 18, flex: 1 },

  // Result
  refinedResultContainer: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  refinedResultTitle: { fontSize: 24, fontWeight: '800', color: '#1E3A2F', marginBottom: 12 },
  refinedResultSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  refinedResultCard: { width: '100%', backgroundColor: '#F9FAFB', borderRadius: 20, padding: 20, gap: 12, marginBottom: 32 },
  resultDetailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultDetailsLabel: { fontSize: 14, color: '#6B7280' },
  resultDetailsValue: { fontSize: 14, fontWeight: '700', color: '#1E3A2F' },
  refinedResultCta: { width: '100%', backgroundColor: '#1E3A2F', paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
  refinedResultCtaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  refinedResultSecondaryCta: { marginTop: 16 },
  refinedResultSecondaryCtaText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },

  // Generic Buttons
  bottomCta: { padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  primaryBtn: { height: 56, borderRadius: 18, backgroundColor: '#1E3A2F', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
