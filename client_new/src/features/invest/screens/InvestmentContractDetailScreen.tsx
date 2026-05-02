/**
 * InvestmentContractDetailScreen.tsx
 * Chi tiết hợp đồng đầu tư — WebView hợp đồng HTML + ký SmartCA
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';
import investService, { InvestmentContractItem, LenderScheduleItem } from '../services/invest.service';
import SmartCASigningModal from '../../loan/components/SmartCASigningModal';

const { width } = Dimensions.get('window');

// ── Helpers ──
const formatMoney = (amount?: number | null) => {
  if (amount == null || isNaN(amount)) return '0';
  return Math.round(amount).toLocaleString('vi-VN');
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const STATUS_MAP: Record<string, { text: string; color: string; bg: string; icon: string }> = {
  pending: { text: 'Chờ xử lý', color: '#F59E0B', bg: '#F59E0B15', icon: 'time-outline' },
  pending_signature: { text: 'Chờ ký số', color: '#8B5CF6', bg: '#8B5CF615', icon: 'create-outline' },
  active: { text: 'Đang hoạt động', color: '#10B981', bg: '#10B98115', icon: 'checkmark-circle-outline' },
  matured: { text: 'Đáo hạn', color: '#3B82F6', bg: '#3B82F615', icon: 'flag-outline' },
  closed: { text: 'Đã đóng', color: '#6B7280', bg: '#6B728015', icon: 'close-circle-outline' },
};

const SCHEDULE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Chờ', color: '#F59E0B' },
  paid: { label: 'Đã trả', color: '#10B981' },
  partial: { label: 'Trả 1 phần', color: '#3B82F6' },
  overdue: { label: 'Quá hạn', color: '#EF4444' },
};

export default function InvestmentContractDetailScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const modal = useConfirmModal();

  const contractId = route.params?.contractId;
  const autoSign = route.params?.autoSign === true;

  const [contract, setContract] = useState<InvestmentContractItem | null>(null);
  const [contractHTML, setContractHTML] = useState('');
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [showSmartCA, setShowSmartCA] = useState(false);
  const [autoSignConsumed, setAutoSignConsumed] = useState(false);
  const [showSignSuccess, setShowSignSuccess] = useState(false);

  const EXPO_PUBLIC_DEV_MODE = process.env.EXPO_PUBLIC_DEV_MODE === 'true';

  // Success animations
  const successPageAnim = useRef(new Animated.Value(0)).current;
  const successCheckAnim = useRef(new Animated.Value(0)).current;
  const successSlideAnim = useRef(new Animated.Value(40)).current;
  const autoSignOpenedRef = useRef(false);

  const fetchContract = useCallback(async () => {
    try {
      setLoading(true);
      const data = await investService.getContractById(contractId);
      setContract(data);

      // Fetch HTML
      if (data) {
        try {
          const html = await investService.getContractHTML(data.contractId || data._id);
          setContractHTML(html);
        } catch {
          console.warn('[InvestContractDetail] Cannot load HTML');
        }
      }
    } catch (err: any) {
      console.error('[InvestContractDetail] Error:', err);
      modal.error('Lỗi', 'Không thể tải hợp đồng đầu tư');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { fetchContract(); }, [fetchContract]);

  useEffect(() => {
    autoSignOpenedRef.current = false;
    setAutoSignConsumed(false);
  }, [contractId]);

  // Tự động mở SmartCA modal nếu được điều hướng từ luồng đầu tư trực tiếp (autoSign=true)
  // và hợp đồng đang ở trạng thái pending_signature.
  useEffect(() => {
    if (
      autoSign &&
      contract?.status === 'pending_signature' &&
      !autoSignOpenedRef.current &&
      !autoSignConsumed &&
      !showSmartCA &&
      !signing
    ) {
      autoSignOpenedRef.current = true;
      setAutoSignConsumed(true);
      navigation.setParams?.({ autoSign: false });
      setShowSmartCA(true);
    }
  }, [autoSign, autoSignConsumed, contract?.status, navigation, showSmartCA, signing]);

  const handleSmartCAClose = useCallback(() => {
    autoSignOpenedRef.current = true;
    setAutoSignConsumed(true);
    navigation.setParams?.({ autoSign: false });
    setShowSmartCA(false);
  }, [navigation]);

  // SmartCA complete callback
  const handleSmartCAComplete = (status: 'signed' | 'failed' | 'rejected') => {
    setShowSmartCA(false);
    if (status === 'signed') {
      fetchContract();
      successPageAnim.setValue(0);
      successCheckAnim.setValue(0);
      successSlideAnim.setValue(40);
      setShowSignSuccess(true);
      Animated.sequence([
        Animated.timing(successPageAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.parallel([
          Animated.spring(successCheckAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
          Animated.timing(successSlideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]),
      ]).start();
    } else if (status === 'rejected') {
      modal.alert('Từ chối ký', 'Bạn đã từ chối ký hợp đồng.');
    }
  };

  const handleDevSign = async () => {
    if (!contract) return;
    setSigning(true);
    try {
      await investService.devSignContract(contract.contractId || contract._id);
      modal.alert('Thành công', 'Đã ký hợp đồng đầu tư qua chế độ DEV_MODE.');
      fetchContract();
    } catch (err: any) {
      modal.error('Lỗi', err?.response?.data?.message || err?.message || 'Không thể ký DEV MODE');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header colors={colors} onBack={() => navigation.goBack()} />
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header colors={colors} onBack={() => navigation.goBack()} />
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-document-remove-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Không tìm thấy hợp đồng</Text>
        </View>
      </View>
    );
  }

  const statusCfg = STATUS_MAP[contract.status] || STATUS_MAP.pending;
  const isPendingSign = contract.status === 'pending_signature';
  const loanInfo = contract.loanApplicationId;
  const loanPurpose = typeof loanInfo === 'object' ? loanInfo?.willing : '';

  const renderScheduleRow = (item: LenderScheduleItem, index: number) => {
    const s = SCHEDULE_STATUS[item.status] || SCHEDULE_STATUS.pending;
    return (
      <View key={index} style={[styles.scheduleRow, { borderBottomColor: colors.border || '#E5E7EB' }]}>
        <Text style={[styles.scheduleCell, styles.schedulePeriod, { color: colors.text }]}>{item.period}</Text>
        <Text style={[styles.scheduleCell, styles.scheduleDate, { color: colors.textSecondary }]}>{item.dueDate}</Text>
        <Text style={[styles.scheduleCell, styles.scheduleAmount, { color: colors.text }]}>
          {(item.total / 1000).toFixed(0)}k
        </Text>
        <View style={[styles.scheduleStatusBadge, { backgroundColor: s.color + '20' }]}>
          <Text style={[styles.scheduleStatusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header colors={colors} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isPendingSign ? 100 + (Platform.OS === 'ios' ? insets.bottom : 0) : 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status + Contract ID Card */}
        <View style={[styles.section, { backgroundColor: colors.backgroundSecondary || colors.surface }]}>
          <View style={styles.statusRow}>
            <View style={[styles.bigStatusBadge, { backgroundColor: statusCfg.bg }]}>
              <Ionicons name={statusCfg.icon as any} size={20} color={statusCfg.color} />
              <Text style={[styles.bigStatusText, { color: statusCfg.color }]}>{statusCfg.text}</Text>
            </View>
            <Text style={[styles.contractIdLabel, { color: colors.textSecondary }]}>{contract.contractId}</Text>
          </View>
          {loanPurpose ? (
            <Text style={[styles.purpose, { color: colors.text }]}>Mục đích: {loanPurpose}</Text>
          ) : null}
        </View>

        {/* Financial Info Card */}
        <View style={[styles.section, { backgroundColor: colors.backgroundSecondary || colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            <MaterialCommunityIcons name="cash-multiple" size={14} /> Thông tin đầu tư
          </Text>

          <View style={[styles.amountBox, { backgroundColor: (colors.primary || '#14342B') + '10' }]}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Vốn đầu tư</Text>
            <Text style={[styles.amountValue, { color: colors.primary }]}>
              {formatMoney(contract.capital)} đ
            </Text>
          </View>

          <View style={styles.infoGrid}>
            <InfoItem label="Số notes" value={`${contract.numNotes}`} color={colors.text} labelColor={colors.textSecondary} />
            <InfoItem label="Kỳ hạn" value={`${contract.periodMonth} tháng`} color={colors.text} labelColor={colors.textSecondary} />
            <InfoItem label="Lãi suất" value={`${contract.annualRatePercent?.toFixed(1) || '0'}%/năm`} color={colors.primary} labelColor={colors.textSecondary} />
            <InfoItem label="Thu nhập/tháng" value={`${formatMoney(contract.monthlyIncome)} đ`} color={colors.text} labelColor={colors.textSecondary} />
            <InfoItem label="Tổng lợi nhuận" value={`${formatMoney(contract.entirelyProfit)} đ`} color="#10B981" labelColor={colors.textSecondary} />
            <InfoItem label="Tổng nhận" value={`${formatMoney(contract.entirelyPay)} đ`} color={colors.text} labelColor={colors.textSecondary} />
            <InfoItem label="Đã nhận" value={`${formatMoney(contract.totalReceived)} đ`} color={colors.primary} labelColor={colors.textSecondary} />
            <InfoItem label="Phí dịch vụ" value={`${formatMoney(contract.serviceFee)} đ`} color={colors.textSecondary} labelColor={colors.textSecondary} />
          </View>
        </View>

        {/* Lender Schedule */}
        {contract.lenderSchedule && contract.lenderSchedule.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.backgroundSecondary || colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="calendar-clock" size={14} /> Lịch nhận tiền ({contract.schedulePeriodCount} kỳ)
            </Text>

            {/* Summary */}
            <View style={[styles.scheduleSummary, { backgroundColor: (colors.primary || '#14342B') + '08' }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Tổng gốc</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{formatMoney(contract.scheduleTotalPrincipal)} đ</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Tổng lãi</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatMoney(contract.scheduleTotalInterest)} đ</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Tổng thu nhập</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatMoney(contract.scheduleTotalIncome)} đ</Text>
              </View>
            </View>

            {/* Header row */}
            <View style={[styles.scheduleHeaderRow, { borderBottomColor: colors.border || '#E5E7EB' }]}>
              <Text style={[styles.scheduleHeaderCell, styles.schedulePeriod, { color: colors.textSecondary }]}>Kỳ</Text>
              <Text style={[styles.scheduleHeaderCell, styles.scheduleDate, { color: colors.textSecondary }]}>Ngày</Text>
              <Text style={[styles.scheduleHeaderCell, styles.scheduleAmount, { color: colors.textSecondary }]}>Số tiền</Text>
              <Text style={[styles.scheduleHeaderCell, { color: colors.textSecondary }]}>TT</Text>
            </View>

            {contract.lenderSchedule.map(renderScheduleRow)}
          </View>
        )}

        {/* View Full Contract Button */}
        {contractHTML ? (
          <TouchableOpacity
            style={[styles.viewContractBtn, { backgroundColor: colors.backgroundSecondary || colors.surface, borderColor: colors.primary }]}
            onPress={() => setShowContract(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="file-eye-outline" size={20} color={colors.primary} />
            <Text style={[styles.viewContractBtnText, { color: colors.primary }]}>
              Xem hợp đồng đầy đủ (PDF)
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Bottom Sign Button */}
      {isPendingSign && (
        <View style={[
          styles.bottomBar,
          {
            paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) + 12 : insets.bottom + 12,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}>
          <TouchableOpacity
            style={[styles.signBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowSignConfirm(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="draw-pen" size={20} color={colors.onPrimary || '#fff'} />
            <Text style={[styles.signBtnText, { color: colors.onPrimary || '#fff' }]}>
              Ký xác nhận hợp đồng đầu tư
            </Text>
          </TouchableOpacity>

          {EXPO_PUBLIC_DEV_MODE && (
            <TouchableOpacity
              style={[
                styles.signBtn,
                { backgroundColor: '#FF6B6B', marginTop: 8 },
                signing && { opacity: 0.6 },
              ]}
              onPress={handleDevSign}
              disabled={signing}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="bug-outline" size={20} color="#FFFFFF" />
              <Text style={[styles.signBtnText, { color: '#FFFFFF' }]}>
                Ký (DEV MODE)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Full Contract WebView Modal */}
      <Modal visible={showContract} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[
            styles.modalHeader,
            { backgroundColor: colors.backgroundSecondary || colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 },
          ]}>
            <TouchableOpacity onPress={() => setShowContract(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Hợp đồng đầu tư</Text>
            <View style={{ width: 40 }} />
          </View>
          <WebView
            source={{
              html: `<style>
                body { background: ${colors.background}; color: ${colors.text}; }
                table { border-color: ${colors.border} !important; }
                th { background-color: ${colors.primary}15 !important; color: ${colors.text} !important; }
                td { color: ${colors.text} !important; }
                .highlight { background-color: ${colors.primary}08 !important; border-color: ${colors.primary}30 !important; }
                h1, h2, h3, h4 { color: ${colors.text} !important; }
              </style>${contractHTML}`
            }}
            style={styles.webView}
            originWhitelist={['*']}
            scalesPageToFit={Platform.OS === 'android'}
            javaScriptEnabled={false}
            showsVerticalScrollIndicator={true}
          />

          {isPendingSign && (
            <View style={[styles.signatureArea, { backgroundColor: colors.backgroundSecondary || colors.surface, borderTopColor: colors.border }]}>
              <View style={[styles.signaturePlaceholder, { borderColor: colors.border }]}>
                <MaterialCommunityIcons name="draw-pen" size={32} color={colors.textSecondary} />
                <Text style={[styles.signaturePlaceholderText, { color: colors.textSecondary }]}>
                  Chữ ký điện tử{'\n'}Nhấn nút bên dưới để ký xác nhận
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.signBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                onPress={() => { setShowContract(false); setShowSignConfirm(true); }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="draw-pen" size={20} color={colors.onPrimary || '#fff'} />
                <Text style={[styles.signBtnText, { color: colors.onPrimary || '#fff' }]}>
                  Ký xác nhận hợp đồng
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Sign Confirmation Modal */}
      <Modal visible={showSignConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { backgroundColor: colors.backgroundSecondary || colors.surface }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: (colors.primary || '#14342B') + '15' }]}>
              <MaterialCommunityIcons name="shield-check" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>
              Xác nhận ký hợp đồng đầu tư
            </Text>
            <Text style={[styles.confirmDesc, { color: colors.textSecondary }]}>
              Bạn xác nhận đã đọc và đồng ý với toàn bộ nội dung hợp đồng đầu tư số{' '}
              <Text style={{ fontWeight: '700', color: colors.text }}>{contract.contractId}</Text>
              . Vốn đầu tư{' '}
              <Text style={{ fontWeight: '700', color: colors.primary }}>{formatMoney(contract.capital)} đ</Text>
              , kỳ hạn{' '}
              <Text style={{ fontWeight: '700' }}>{contract.periodMonth} tháng</Text>.
            </Text>

            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowSignConfirm(false)}
              >
                <Text style={[styles.confirmCancelBtnText, { color: colors.textSecondary }]}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmSignBtn, { backgroundColor: colors.primary }]}
                onPress={() => { setShowSignConfirm(false); setShowSmartCA(true); }}
              >
                <MaterialCommunityIcons name="draw-pen" size={18} color={colors.onPrimary || '#fff'} />
                <Text style={[styles.confirmSignBtnText, { color: colors.onPrimary || '#fff' }]}>Ký xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SmartCA Digital Signing Modal */}
      <SmartCASigningModal
        visible={showSmartCA}
        contractId={contract.contractId || contract._id}
        onClose={handleSmartCAClose}
        onSigningComplete={handleSmartCAComplete}
      />

      {/* Signing Success Overlay */}
      <Modal visible={showSignSuccess} transparent animationType="none" statusBarTranslucent>
        <Animated.View style={[styles.successPage, { opacity: successPageAnim, backgroundColor: colors.background }]}>
          <View style={[styles.successBgCircle1, { backgroundColor: (colors.primary || '#14342B') + '18' }]} />
          <View style={[styles.successBgCircle2, { backgroundColor: (colors.primary || '#14342B') + '12' }]} />

          <Animated.View style={[styles.successBody, { transform: [{ translateY: successSlideAnim }], opacity: successPageAnim }]}>
            <Animated.View style={[styles.successCheckWrap, { transform: [{ scale: successCheckAnim }] }]}>
              <View style={[styles.successCheckRing, { borderColor: (colors.primary || '#14342B') + '40' }]} />
              <View style={[styles.successCheckCircle, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
                <Ionicons name="checkmark" size={52} color={colors.onPrimary || '#fff'} />
              </View>
            </Animated.View>

            <Text style={[styles.successTitle, { color: colors.text }]}>Ký số thành công, hợp đồng đang hoạt động</Text>
            <Text style={[styles.successDesc, { color: colors.textSecondary }]}>
              Hợp đồng đầu tư đã được ký số bằng chứng thư VNPT SmartCA, tiền đã được ghi nhận và FD đã được tạo.
            </Text>

            <View style={[styles.successInfoCard, { backgroundColor: (colors.primary || '#14342B') + '10', borderColor: (colors.primary || '#14342B') + '30' }]}>
              <View style={styles.successInfoRow}>
                <Text style={[styles.successInfoLabel, { color: colors.textSecondary }]}>Mã hợp đồng</Text>
                <Text style={[styles.successInfoValue, { color: colors.text }]}>{contract.contractId}</Text>
              </View>
              <View style={styles.successInfoRow}>
                <Text style={[styles.successInfoLabel, { color: colors.textSecondary }]}>Vốn đầu tư</Text>
                <Text style={[styles.successInfoValue, { color: colors.primary }]}>{formatMoney(contract.capital)} đ</Text>
              </View>
              <View style={styles.successInfoRow}>
                <Text style={[styles.successInfoLabel, { color: colors.textSecondary }]}>Kỳ hạn</Text>
                <Text style={[styles.successInfoValue, { color: colors.text }]}>{contract.periodMonth} tháng</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.successBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setShowSignSuccess(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.successBtnText, { color: colors.onPrimary || '#fff' }]}>Xem hợp đồng</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

// ── Sub-components ──

function Header({ colors, onBack }: { colors: any; onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: colors.backgroundSecondary || colors.surface }]}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Chi tiết hợp đồng đầu tư</Text>
      <View style={{ width: 24 }} />
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

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, marginTop: 8 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },

  scrollContent: { padding: 16 },

  // Sections
  section: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  bigStatusText: { fontSize: 14, fontWeight: '600' },
  contractIdLabel: { fontSize: 11, fontWeight: '500' },
  purpose: { fontSize: 14, marginTop: 8, fontWeight: '500' },

  // Amount Box
  amountBox: {
    borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12,
  },
  amountLabel: { fontSize: 12, marginBottom: 4 },
  amountValue: { fontSize: 22, fontWeight: '800' },

  // Info Grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  infoItem: { width: '50%', marginBottom: 10 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 14, fontWeight: '600', marginTop: 2 },

  // Schedule
  scheduleSummary: { flexDirection: 'row', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  scheduleHeaderRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, marginBottom: 4 },
  scheduleHeaderCell: { fontSize: 11, fontWeight: '600' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  scheduleCell: { fontSize: 13 },
  schedulePeriod: { width: 32 },
  scheduleDate: { flex: 1 },
  scheduleAmount: { width: 60, textAlign: 'right', marginRight: 8 },
  scheduleStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  scheduleStatusText: { fontSize: 10, fontWeight: '600' },

  // View Contract
  viewContractBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 14, padding: 14,
    marginBottom: 8,
  },
  viewContractBtnText: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Bottom Bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 12, paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  signBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  signBtnText: { fontSize: 16, fontWeight: '700' },

  // Contract WebView Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  webView: { flex: 1 },
  signatureArea: { padding: 16, borderTopWidth: 1 },
  signaturePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 20,
  },
  signaturePlaceholderText: { textAlign: 'center', fontSize: 13, marginTop: 8 },

  // Confirm Modal
  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 },
  confirmCard: { borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center' },
  confirmIconWrap: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  confirmTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  confirmDesc: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  confirmBtns: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  confirmCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmCancelBtnText: { fontSize: 15, fontWeight: '600' },
  confirmSignBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  confirmSignBtnText: { fontSize: 15, fontWeight: '700' },

  // Success overlay
  successPage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successBgCircle1: { position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -50, right: -80 },
  successBgCircle2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: -30, left: -50 },
  successBody: { alignItems: 'center', paddingHorizontal: 32 },
  successCheckWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  successCheckRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3 },
  successCheckCircle: {
    width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    elevation: 12, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  successTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  successDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  successInfoCard: { borderWidth: 1, borderRadius: 16, padding: 16, width: '100%', marginBottom: 24 },
  successInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  successInfoLabel: { fontSize: 13 },
  successInfoValue: { fontSize: 14, fontWeight: '700' },
  successBtn: { paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14 },
  successBtnText: { fontSize: 16, fontWeight: '700' },
});
