/**
 * LoanDetailScreen.tsx - Chi tiết khoản vay với 3 tabs
 * Redesign theo reference p2p/client HistoryDetail.js
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import { loanService, LoanHistoryItem } from '../services/loan.service';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

// ---- Type Helpers ----
interface OutstandingInfo {
    totalOutstanding: number;
    principalOutstanding: number;
    interestOutstanding: number;
    penaltyOutstanding?: number;
    totalOverdue?: number;
    delinquentDays?: number;
    delinquencyClassification?: string | null;
}

interface ScheduleData {
    periods: Array<{
        period: number;
        dueDate?: any;
        totalDue?: number;
        principalDue?: number;
        principalPaid?: number;
        interestDue?: number;
        interestPaid?: number;
        totalPaid?: number;
        complete?: boolean;
    }>;
    totalRepaymentExpected?: number;
    totalRepayment?: number;
    totalPrincipalExpected?: number;
    totalPrincipalPaid?: number;
    totalInterestCharged?: number;
    totalInterestPaid?: number;
    totalOutstanding?: number;
}

interface TransactionItem {
    id: number;
    date: string;
    amount: number;
    type: string;
    typeIcon: string;
    typeColor: string;
    isDisbursement: boolean;
}

// ---- Format Helpers ----
const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const formatDate = (dateString?: any) => {
    if (!dateString) return 'N/A';
    if (Array.isArray(dateString) && dateString.length >= 3) {
        const [y, m, d] = dateString;
        return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
    return new Date(dateString).toLocaleDateString('vi-VN');
};

/** Trạng thái từng kỳ (giống Mifos): paid | overdue | current | upcoming */
const getInstallmentStatus = (period: any): 'paid' | 'overdue' | 'current' | 'upcoming' => {
    const complete = period?.complete === true || (period?.obligationsMetOnDate != null && Array.isArray(period.obligationsMetOnDate));
    if (complete) return 'paid';
    const toYMD = (v: any): string | null => {
        if (!v) return null;
        if (Array.isArray(v) && v.length >= 3) {
            const [y, m, d] = v;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        if (typeof v === 'string') return v;
        return null;
    };
    const today = new Date().toISOString().split('T')[0];
    const dueStr = toYMD(period?.dueDate);
    const fromStr = toYMD(period?.fromDate);
    if (!dueStr) return 'upcoming';
    if (dueStr < today) return 'overdue';
    if (fromStr && fromStr <= today && today < dueStr) return 'current';
    return 'upcoming';
};

const formatInputVND = (text: string) => {
    const number = text.replace(/[^0-9]/g, '');
    if (!number) return '';
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const getStatusInfo = (statusObj: any, status: string) => {
    if (statusObj) {
        if (statusObj.active) return { text: 'Đang vay', color: '#3B82F6', bgColor: '#3B82F615' };
        if (statusObj.closedObligationsMet) return { text: 'Đã tất toán', color: '#10B981', bgColor: '#10B98115' };
        if (statusObj.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B', bgColor: '#F59E0B15' };
        if (statusObj.waitingForDisbursal) return { text: 'Chờ giải ngân', color: '#8B5CF6', bgColor: '#8B5CF615' };
        if (statusObj.approved) return { text: 'Chờ ký hợp đồng', color: '#F59E0B', bgColor: '#F59E0B15' };
        if (statusObj.rejected || statusObj.withdrawnByClient) return { text: 'Thất bại', color: '#EF4444', bgColor: '#EF444415' };
    }
    if (status === 'clean' || status === 'closed') return { text: 'Đã tất toán', color: '#10B981', bgColor: '#10B98115' };
    if (status === 'success' || status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6', bgColor: '#3B82F615' };
    if (status === 'approved') return { text: 'Chờ ký hợp đồng', color: '#F59E0B', bgColor: '#F59E0B15' };
    if (status === 'waiting' || status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B', bgColor: '#F59E0B15' };
    return { text: status || 'N/A', color: '#6B7280', bgColor: '#6B728015' };
};

const getTxTypeInfo = (typeObj: any): { text: string; icon: any; color: string } => {
    if (!typeObj) return { text: 'Giao dịch', icon: 'swap-horizontal' as any, color: '#6B7280' };
    if (typeObj.disbursement || typeObj.code?.includes('disbursement')) return { text: 'Giải ngân', icon: 'arrow-down-circle' as any, color: '#10B981' };
    if (typeObj.repayment || typeObj.code?.includes('repayment')) return { text: 'Trả nợ', icon: 'arrow-up-circle' as any, color: '#3B82F6' };
    return { text: typeObj.value || 'Giao dịch', icon: 'swap-horizontal' as any, color: '#6B7280' };
};

// ============================= MAIN SCREEN ==============================
interface RouteParams {
    loan: LoanHistoryItem;
    autoOpenRepay?: boolean;
}

const LoanDetailScreen = ({ route }: { route: { params: RouteParams } }) => {
    const { loan: rawLoan, autoOpenRepay } = route.params;
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const { theme } = useTheme();
    const colors = theme.colors;

    // Normalize loan data
    const loan = useMemo(() => ({
        id: rawLoan?.id,
        fineractLoanId: rawLoan?.fineractLoanId,
        status: rawLoan?.status || 'waiting',
        fineractStatus: (rawLoan?.fineractDetails as any)?.status || rawLoan?.statusInfo || null,
        capital: rawLoan?.capital || 0,
        periodMonth: rawLoan?.periodMonth || 1,
        rate: rawLoan?.rate || 0,
        monthlyPay: rawLoan?.monthlyPay || 0,
        entirelyPay: rawLoan?.entirelyPay || 0,
        willing: rawLoan?.willing || rawLoan?.productName || 'Chi tiêu cá nhân',
        disbursementDate: rawLoan?.disbursementDate || rawLoan?.createdAt,
        createdAt: rawLoan?.createdAt,
    }), [rawLoan]);

    // States
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [outstanding, setOutstanding] = useState<OutstandingInfo | null>(null);
    const [schedule, setSchedule] = useState<ScheduleData | null>(null);
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [totalPaid, setTotalPaid] = useState(0);
    const [prepayAmount, setPrepayAmount] = useState<{ amount: number; principalPortion: number; interestPortion: number } | null>(null);
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'schedule' | 'history'>('info');
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [repaymentAmount, setRepaymentAmount] = useState('');
    const [fineractDetails, setFineractDetails] = useState<any>(null);

    // Support Request States
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [supportType, setSupportType] = useState<'WAIVE_PENALTY' | 'RESCHEDULE' | null>(null);
    const [supportReason, setSupportReason] = useState('');
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [submittingSupport, setSubmittingSupport] = useState(false);

    const isActive = useMemo(() =>
        fineractDetails?.status?.active === true ||
        loan.status === 'success' ||
        loan.status === 'disbursed',
        [fineractDetails, loan.status]);

    const isClean = useMemo(() =>
        loan.status === 'clean' ||
        loan.status === 'closed' ||
        fineractDetails?.status?.closedObligationsMet === true,
        [loan.status, fineractDetails]);

    const hasAutoOpenedRef = useRef(false);

    // Fetch data
    const fetchData = useCallback(async () => {
        if (!loan.id) return;
        try {
            setLoading(true);

            // Try to load Fineract details via loan service
            const scheduleRes = await loanService.getRepaymentSchedule(loan.id);
            const scheduleData = (scheduleRes as any)?.data || scheduleRes;
            if (scheduleData?.periods) {
                setSchedule(scheduleData);
                const periods: any[] = scheduleData.periods || [];

                // Tính dư nợ từ các kỳ chưa hoàn thành
                const incompletePeriods = periods.filter((p: any) => p.period > 0 && !p.complete);
                const principalFromPeriods = incompletePeriods.reduce((s: number, p: any) => s + ((p.principalDue || 0) - (p.principalPaid || 0)), 0);
                const interestFromPeriods = incompletePeriods.reduce((s: number, p: any) => s + ((p.interestDue || 0) - (p.interestPaid || 0)), 0);

                // Ưu tiên dùng totalOutstanding từ Fineract schedule, fallback tính từ periods
                const totalOut = scheduleData.totalOutstanding || (principalFromPeriods + interestFromPeriods);
                const principalOut = (scheduleData.totalPrincipalExpected || 0) - (scheduleData.totalPrincipalPaid || 0) || principalFromPeriods;
                const interestOut = ((scheduleData.totalInterestCharged || 0) - (scheduleData.totalInterestPaid || 0)) || interestFromPeriods;

                setOutstanding({
                    totalOutstanding: totalOut,
                    principalOutstanding: principalOut,
                    interestOutstanding: interestOut,
                });

                // Tổng đã trả
                const paid = periods.filter((p: any) => p.period > 0).reduce((s: number, p: any) => s + (p.totalPaid || 0), 0);
                setTotalPaid(paid || scheduleData.totalRepayment || 0);
            }

            // Lấy outstanding từ API riêng (Fineract summary)
            try {
                const outRes = await loanService.getOutstanding(loan.id);
                const outData = (outRes as any)?.data || outRes;
                if (outData?.totalOutstanding != null && outData.totalOutstanding > 0) {
                    setOutstanding({
                        totalOutstanding: outData.totalOutstanding,
                        principalOutstanding: outData.principalOutstanding || 0,
                        interestOutstanding: outData.interestOutstanding || 0,
                        penaltyOutstanding: outData.penaltyOutstanding || 0,
                        totalOverdue: outData.totalOverdue ?? 0,
                        delinquentDays: outData.delinquentDays ?? 0,
                        delinquencyClassification: outData.delinquencyClassification ?? null,
                    });
                }
            } catch (outErr) {
                console.warn('[LoanDetail] getOutstanding failed, using schedule data', outErr);
            }

            if (isActive) {
                const prepayRes = await loanService.getPrepayAmount(loan.id);
                const prepayData = (prepayRes as any)?.data || prepayRes;
                if (prepayData) setPrepayAmount(prepayData);
            }
        } catch (err) {
            console.error('[LoanDetail] Error:', err);
        } finally {
            setLoading(false);
        }
    }, [loan.id, isActive]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-open repay modal
    useEffect(() => {
        if (autoOpenRepay && isActive && !loading && outstanding && !hasAutoOpenedRef.current) {
            hasAutoOpenedRef.current = true;
            let amount = loan.monthlyPay || 0;
            if (amount === 0 && schedule?.periods) {
                const firstUnpaid = schedule.periods.find((p: any) => p.period > 0 && !p.complete);
                if (firstUnpaid) {
                    amount = firstUnpaid.totalDue || 0;
                }
            }
            setRepaymentAmount(formatMoney(amount));
            setShowRepayModal(true);
        }
    }, [autoOpenRepay, isActive, loading, outstanding, schedule]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    // Repayment handler
    const processRepayment = async () => {
        const amount = parseFloat(repaymentAmount.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }
        if (outstanding && amount > outstanding.totalOutstanding) {
            Alert.alert('Lỗi', `Số tiền không được vượt quá dư nợ: ${formatMoney(outstanding.totalOutstanding)} đ`);
            return;
        }
        Alert.alert(
            'Xác nhận trả nợ',
            `Bạn muốn trả ${formatInputVND(String(amount))} đ?`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xác nhận', onPress: async () => {
                        try {
                            setPaymentLoading(true);
                            setShowRepayModal(false);
                            const result = await loanService.makeRepayment(
                                loan.id!,
                                amount,
                                new Date().toISOString().split('T')[0],
                            );
                            const ok = (result as any)?.data?.success || (result as any)?.success;
                            if (ok) {
                                Alert.alert('Thành công', `Đã trả ${formatMoney(amount)} đ`, [{ text: 'OK', onPress: fetchData }]);
                            } else {
                                throw new Error((result as any)?.message || 'Trả nợ thất bại');
                            }
                        } catch (err: any) {
                            Alert.alert('Lỗi', err.message || 'Không thể trả nợ. Vui lòng thử lại.');
                        } finally {
                            setPaymentLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // Prepayment handler
    const handlePrepayment = () => {
        if (!isActive || !prepayAmount) {
            Alert.alert('Thông báo', 'Dữ liệu tất toán chưa sẵn sàng.');
            return;
        }
        const total = prepayAmount.amount;
        Alert.alert(
            'Tất toán sớm',
            `Tổng tất toán: ${formatMoney(total)} đ\n(Gốc + Lãi + Phí)`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Tất toán ngay', style: 'destructive', onPress: async () => {
                        try {
                            setPaymentLoading(true);
                            const result = await loanService.prepayLoan(
                                loan.id!,
                                new Date().toISOString().split('T')[0],
                            );
                            const ok = (result as any)?.data?.success || (result as any)?.success;
                            if (ok) {
                                Alert.alert('Tất toán thành công', 'Khoản vay đã được tất toán!', [{ text: 'OK', onPress: () => navigation.goBack() }]);
                            } else {
                                throw new Error((result as any)?.message || 'Tất toán thất bại');
                            }
                        } catch (err: any) {
                            Alert.alert('Lỗi', err.message || 'Không thể tất toán. Vui lòng thử lại.');
                        } finally {
                            setPaymentLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // Submitting Support Request handler
    const handleSupportSubmit = async () => {
        if (!supportType) return;
        if (!supportReason.trim()) {
            Alert.alert('Chưa nhập lý do', 'Vui lòng nhập lý do/yêu cầu của bạn');
            return;
        }
        if (supportType === 'RESCHEDULE' && !rescheduleDate.trim()) {
            Alert.alert('Chưa nhập ngày', 'Vui lòng nhập ngày bạn muốn dời lịch trả nợ (VD: YYYY-MM-DD)');
            return;
        }

        try {
            setSubmittingSupport(true);
            const res = await loanService.submitSupportRequest({
                loanId: loan.id!,
                requestType: supportType,
                reason: supportReason,
                proposedRescheduleDate: supportType === 'RESCHEDULE' ? rescheduleDate : undefined
            });
            if (res.success) {
                Alert.alert('Gửi yêu cầu thành công', 'Chúng tôi sẽ xem xét và phản hồi sớm nhất.', [{ text: 'OK', onPress: () => setShowSupportModal(false) }]);
            } else {
                Alert.alert('Gửi thất bại', res.message || 'Đã có lỗi xảy ra');
            }
        } catch (error: any) {
            Alert.alert('Lỗi', error.response?.data?.message || 'Đã có lỗi hệ thống xảy ra');
        } finally {
            setSubmittingSupport(false);
        }
    };

    // ---- Render Tabs ----
    const renderInfoTab = () => {
        const statusDisplay = getStatusInfo(fineractDetails?.status || rawLoan?.statusInfo, loan.status);
        return (
            <>
                {/* Loan Info Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardTitleRow}>
                        <View style={[styles.cardTitleDot, { backgroundColor: '#14342B' }]} />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>THÔNG TIN CHUNG</Text>
                    </View>
                    <InfoRow label="Mục đích vay" value={loan.willing} colors={colors} />
                    <InfoRow label="Ngày giải ngân" value={formatDate(loan.disbursementDate)} colors={colors} />
                    <InfoRow label="Lãi suất" value={`${loan.rate}%/năm`} colors={colors} />
                    <InfoRow label="Thời hạn" value={`${loan.periodMonth} tháng`} colors={colors} />
                    <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
                    <View style={styles.statusRow}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Trạng thái</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusDisplay.bgColor }]}>
                            <Text style={[styles.statusPillText, { color: statusDisplay.color }]}>{statusDisplay.text}</Text>
                        </View>
                    </View>
                </View>

                {/* Finance Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardTitleRow}>
                        <View style={[styles.cardTitleDot, { backgroundColor: '#10B981' }]} />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>TÀI CHÍNH</Text>
                    </View>
                    <View style={styles.financeRow}>
                        <View style={[styles.financeCol, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Text style={[styles.financeLabel, { color: colors.textMuted }]}>Gốc vay</Text>
                            <Text style={[styles.financeValue, { color: colors.text }]}>{formatMoney(loan.capital)} đ</Text>
                        </View>
                        <View style={[styles.financeCol, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Text style={[styles.financeLabel, { color: colors.textMuted }]}>Đã thanh toán</Text>
                            <Text style={[styles.financeValue, { color: '#10B981' }]}>{formatMoney(totalPaid)} đ</Text>
                        </View>
                    </View>

                    {outstanding && (
                        <View style={[styles.outstandingBox, { backgroundColor: '#14342B' }]}>
                            <Text style={[styles.outstandingLabel, { color: 'rgba(255,255,255,0.6)' }]}>DƯ NỢ CÒN LẠI</Text>
                            <Text style={[styles.outstandingValue, { color: '#FFFFFF' }]}>{formatMoney(outstanding.totalOutstanding)} đ</Text>
                            <View style={styles.outstandingDetail}>
                                <Text style={[styles.outstandingDetailText, { color: 'rgba(255,255,255,0.5)' }]}>Gốc: {formatMoney(outstanding.principalOutstanding)}</Text>
                                <Text style={[styles.outstandingDetailText, { color: 'rgba(255,255,255,0.5)' }]}>Lãi: {formatMoney(outstanding.interestOutstanding)}</Text>
                            </View>
                        </View>
                    )}
                    {(outstanding?.totalOverdue ?? 0) > 0 && (
                        <View style={[styles.outstandingBox, { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#FECACA', marginTop: 12 }]}>
                            <Text style={[styles.outstandingLabel, { color: '#EF4444' }]}>NỢ QUÁ HẠN</Text>
                            <Text style={[styles.outstandingValue, { color: '#EF4444', fontSize: 18 }]}>{formatMoney(outstanding!.totalOverdue)} đ</Text>
                            {(outstanding!.delinquentDays ?? 0) > 0 && (
                                <Text style={[styles.outstandingDetailText, { color: '#EF4444', marginTop: 4 }]}>
                                    Quá hạn {outstanding!.delinquentDays} ngày
                                    {outstanding!.delinquencyClassification ? ` • ${outstanding!.delinquencyClassification}` : ''}
                                </Text>
                            )}
                        </View>
                    )}
                </View>

                {/* Overdue Alerts & Support Actions */}
                {outstanding && isActive && ((outstanding.penaltyOutstanding && outstanding.penaltyOutstanding > 0) || fineractDetails?.isOverdue) && (
                    <View style={[styles.card, { backgroundColor: colors.errorGlass, borderColor: colors.errorBorder }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Ionicons name="warning" size={20} color={colors.error} />
                            <Text style={[styles.cardTitle, { color: colors.error, marginBottom: 0, marginLeft: 8 }]}>CẢNH BÁO QUÁ HẠN</Text>
                        </View>
                        <Text style={{ color: colors.error, fontSize: 13, marginBottom: 14 }}>
                            Khoản vay của bạn đã trễ hạn quá mức quy định. Vui lòng thanh toán sớm để tránh ảnh hưởng đến điểm tín dụng.
                        </Text>

                        {/* Support buttons */}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity
                                style={[styles.actionBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary }]}
                                onPress={() => { setSupportType('WAIVE_PENALTY'); setShowSupportModal(true); setSupportReason(''); }}
                            >
                                <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary, marginLeft: 4 }}>Xin Xóa Phạt</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionBtn, { flex: 1, backgroundColor: colors.primary }]}
                                onPress={() => { setSupportType('RESCHEDULE'); setShowSupportModal(true); setSupportReason(''); setRescheduleDate(''); }}
                            >
                                <Ionicons name="calendar-outline" size={16} color="#000" />
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#000', marginLeft: 4 }}>Xin Cơ Cấu Nợ</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Contract Button */}
                <TouchableOpacity
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', padding: 16 }]}
                    onPress={() => navigation.navigate('LoanContractDetail' as any, { loanId: loan.id, fineractLoanId: loan.fineractLoanId })}
                    activeOpacity={0.7}
                >
                    <View style={[styles.contractIcon, { backgroundColor: '#14342B10' }]}>
                        <MaterialCommunityIcons name="file-document-check-outline" size={20} color="#14342B" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text }]}>Hợp đồng vay</Text>
                        <Text style={[{ fontSize: 12, color: colors.textMuted, marginTop: 2 }]}>Xem và ký hợp đồng vay</Text>
                    </View>
                    <View style={[styles.contractChevron, { backgroundColor: colors.background }]}>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </View>
                </TouchableOpacity>
            </>
        );
    };

    const renderScheduleTab = () => {
        const periods = schedule?.periods?.filter(p => p.period > 0) || [];
        const statusConfig = {
            paid: { label: 'Đã trả', color: colors.success, bg: colors.success + '10' },
            overdue: { label: 'Quá hạn', color: '#EF4444', bg: '#FFF0F0' },
            current: { label: 'Đang đến hạn', color: '#CDEA2D', bg: '#F5FFD6' },
            upcoming: { label: 'Chưa đến hạn', color: '#9CA3AF', bg: '#F9FAFB' },
        };
        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}>
                <Text style={[styles.cardTitle, { color: colors.textSecondary, padding: 16, paddingBottom: 0 }]}>LỊCH TRẢ NỢ</Text>
                {periods.length > 0 ? periods.map((p, i) => {
                    const status = getInstallmentStatus(p);
                    const cfg = statusConfig[status];
                    return (
                        <View key={i} style={[styles.scheduleItem, { borderBottomColor: '#F3F4F6', backgroundColor: cfg.bg }]}>
                            <View style={styles.scheduleLeft}>
                                <View style={[styles.scheduleNumBadge, { backgroundColor: status === 'overdue' ? '#FECACA' : status === 'paid' ? '#D1FAE5' : '#E5E7EB' }]}>
                                    <Text style={[styles.scheduleNumText, { color: status === 'overdue' ? '#EF4444' : status === 'paid' ? '#10B981' : '#6B7280' }]}>{p.period}</Text>
                                </View>
                                <View>
                                    <Text style={[styles.schedulePeriod, { color: '#111827' }]}>Kỳ {p.period}</Text>
                                    <Text style={[styles.scheduleDate, { color: '#6B7280' }]}>{formatDate(p.dueDate)}</Text>
                                    <Text style={[styles.schedulePaidTag, { color: cfg.color, marginTop: 2 }]}>{cfg.label}</Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.scheduleAmount, { color: '#111827' }]}>
                                    {formatMoney(p.totalDue)} đ
                                </Text>
                            </View>
                        </View>
                    );
                }) : (
                    <Text style={[styles.noDataText, { color: colors.textMuted }]}>Chưa có lịch trả nợ</Text>
                )}
            </View>
        );
    };

    const renderHistoryTab = () => (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>LỊCH SỬ GIAO DỊCH</Text>
            {transactions.length > 0 ? transactions.map((tx, i) => (
                <View key={i} style={[styles.txItem, { borderBottomColor: colors.border }]}>
                    <View style={[styles.txIconBox, { backgroundColor: tx.typeColor + '20' }]}>
                        <Ionicons name={tx.typeIcon as any} size={18} color={tx.typeColor} />
                    </View>
                    <View style={styles.txContent}>
                        <Text style={[styles.txType, { color: colors.text }]}>{tx.type}</Text>
                        <Text style={[styles.txDate, { color: colors.textMuted }]}>{tx.date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.isDisbursement ? colors.success : colors.error }]}>
                        {tx.isDisbursement ? '+' : '-'}{formatMoney(tx.amount)} đ
                    </Text>
                </View>
            )) : (
                <Text style={[styles.noDataText, { color: colors.textMuted }]}>Chưa có giao dịch nào</Text>
            )}
        </View>
    );

    const TABS = [
        { key: 'info', label: 'Chi tiết' },
        { key: 'schedule', label: 'Lịch trả' },
        { key: 'history', label: 'Lịch sử' },
    ] as const;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            {/* Shared Header */}
            <BinanceHeader
                mode="standard"
                title="Chi Tiết Khoản Vay"
                showThemeToggle={false}
                rightComponents={<View />}
            />

            {/* Amount Hero */}
            <View style={[styles.heroCard, { backgroundColor: '#14342B' }]}>
                <View style={styles.heroIconRow}>
                    <View style={styles.heroIconCircle}>
                        <MaterialCommunityIcons name="hand-coin-outline" size={20} color="#CDEA2D" />
                    </View>
                    <Text style={[styles.heroLabel, { color: 'rgba(255,255,255,0.6)' }]}>Số tiền vay</Text>
                </View>
                <Text style={styles.heroAmount}>{formatMoney(loan.capital)} <Text style={{ fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.5)' }}>đ</Text></Text>
                {outstanding && isActive && (
                    <View style={styles.heroSub}>
                        <View style={styles.heroSubDot} />
                        <Text style={styles.heroSubText}>Dư nợ: {formatMoney(outstanding.totalOutstanding)} đ</Text>
                    </View>
                )}
            </View>

            {/* Tab Bar */}
            <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tabItem, activeTab === tab.key && [styles.tabItemActive, { borderBottomColor: '#14342B' }]]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === tab.key && { color: '#14342B', fontWeight: '700' }]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: isActive ? 100 : 24 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            >
                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Đang tải chi tiết...</Text>
                    </View>
                ) : (
                    <>
                        {activeTab === 'info' && renderInfoTab()}
                        {activeTab === 'schedule' && renderScheduleTab()}
                        {activeTab === 'history' && renderHistoryTab()}
                    </>
                )}
            </ScrollView>

            {/* Footer Actions */}
            {isActive && (
                <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.btnOutline, { borderColor: '#14342B' }]}
                        onPress={() => {
                            let amount = loan.monthlyPay || 0;
                            if (amount === 0 && schedule?.periods) {
                                const firstUnpaid = schedule.periods.find((p: any) => p.period > 0 && !p.complete);
                                if (firstUnpaid) {
                                    amount = firstUnpaid.totalDue || 0;
                                }
                            }
                            setRepaymentAmount(formatMoney(amount));
                            setShowRepayModal(true);
                        }}
                        disabled={paymentLoading}
                    >
                        <Ionicons name="cash-outline" size={18} color="#14342B" />
                        <Text style={[styles.btnOutlineText, { color: '#14342B' }]}>TRẢ MỘT PHẦN</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.btnPrimary, { backgroundColor: '#14342B' }]}
                        onPress={handlePrepayment}
                        disabled={paymentLoading}
                    >
                        {paymentLoading
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <>
                                <Ionicons name="checkmark-done-circle-outline" size={18} color="#FFFFFF" />
                                <Text style={[styles.btnPrimaryText, { color: '#FFFFFF' }]}>TẤT TOÁN</Text>
                            </>
                        }
                    </TouchableOpacity>
                </View>
            )}

            {/* Repay Modal */}
            <Modal visible={showRepayModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowRepayModal(false)}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowRepayModal(false)} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
                            <Text style={[styles.modalHeader, { color: colors.text }]}>Trả nợ khoản vay</Text>
                            <Text style={[styles.modalSubHeader, { color: colors.textSecondary }]}>Nhập số tiền bạn muốn thanh toán</Text>

                            <View style={[styles.inputContainer, { borderColor: colors.primary, backgroundColor: colors.background }]}>
                                <TextInput
                                    style={[styles.moneyInput, { color: colors.text }]}
                                    value={repaymentAmount}
                                    onChangeText={(t) => setRepaymentAmount(formatInputVND(t))}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                    autoFocus
                                />
                                <Text style={[styles.currencySuffix, { color: colors.textSecondary }]}>VNĐ</Text>
                            </View>

                            <View style={styles.quickOptions}>
                                <TouchableOpacity
                                    style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                                    onPress={() => {
                                        let amount = loan.monthlyPay || 0;
                                        if (amount === 0 && schedule?.periods) {
                                            const firstUnpaid = schedule.periods.find((p: any) => p.period > 0 && !p.complete);
                                            if (firstUnpaid) {
                                                amount = firstUnpaid.totalDue || 0;
                                            }
                                        }
                                        setRepaymentAmount(formatMoney(amount));
                                    }}
                                >
                                    <Text style={[styles.chipText, { color: colors.primary }]}>1 Kỳ hạn</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                                    onPress={() => setRepaymentAmount(formatMoney(outstanding?.totalOutstanding))}
                                >
                                    <Text style={[styles.chipText, { color: colors.primary }]}>Toàn bộ nợ</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1.5 }]} onPress={() => setShowRepayModal(false)}>
                                    <Text style={[styles.btnCancelText, { color: colors.textSecondary }]}>Hủy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={processRepayment}>
                                    <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Xác nhận</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Support Request Modal */}
            <Modal visible={showSupportModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowSupportModal(false)}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowSupportModal(false)} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
                            <Text style={[styles.modalHeader, { color: colors.text }]}>
                                {supportType === 'WAIVE_PENALTY' ? 'Yêu cầu Xóa Phạt' : 'Yêu cầu Cơ cấu nợ'}
                            </Text>
                            <Text style={[styles.modalSubHeader, { color: colors.textSecondary }]}>
                                {supportType === 'WAIVE_PENALTY'
                                    ? 'Xin vui lòng cho biết lý do bạn không thể thanh toán đúng hạn và mức phí phạt mong muốn được miễn giảm.'
                                    : 'Xin vui lòng đề xuất ngày dời lịch thanh toán và lý do khó khăn tài chính hiện tại của bạn.'}
                            </Text>

                            {supportType === 'RESCHEDULE' && (
                                <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 12 }]}>
                                    <TextInput
                                        style={[styles.moneyInput, { color: colors.text, fontSize: 16, fontWeight: '500' }]}
                                        value={rescheduleDate}
                                        onChangeText={setRescheduleDate}
                                        placeholder="Ngày (VD: 2024-12-30)"
                                        placeholderTextColor={colors.textMuted}
                                    />
                                </View>
                            )}

                            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.background, height: 100, padding: 12, alignItems: 'flex-start' }]}>
                                <TextInput
                                    style={[{ color: colors.text, flex: 1, fontSize: 15, width: '100%' }]}
                                    value={supportReason}
                                    onChangeText={setSupportReason}
                                    placeholder="Lý do chi tiết..."
                                    placeholderTextColor={colors.textMuted}
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1.5 }]} onPress={() => setShowSupportModal(false)} disabled={submittingSupport}>
                                    <Text style={[styles.btnCancelText, { color: colors.textSecondary }]}>Hủy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSupportSubmit} disabled={submittingSupport}>
                                    {submittingSupport
                                        ? <ActivityIndicator size="small" color="#000" />
                                        : <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Gửi Yêu Cầu</Text>
                                    }
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
};

// ---- InfoRow helper ----
const InfoRow = ({ label, value, colors }: { label: string; value: string; colors: any }) => (
    <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 12, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    headerSubtitle: { fontSize: 12, marginTop: 2 },

    // Hero
    heroCard: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 20, borderRadius: 18, alignItems: 'center' },
    heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    heroIconCircle: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(205,234,45,0.15)', justifyContent: 'center', alignItems: 'center' },
    heroLabel: { fontSize: 12, fontWeight: '500' },
    heroAmount: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
    heroSub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    heroSubDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CDEA2D' },
    heroSubText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },

    // Tab Bar
    tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16, marginTop: 4 },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
    tabItemActive: {},
    tabText: { fontSize: 14, fontWeight: '600' },

    content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
    loadingText: { fontSize: 14 },

    // Cards
    card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    cardTitleDot: { width: 4, height: 16, borderRadius: 2 },
    cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },

    // Info rows
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    infoLabel: { fontSize: 14 },
    infoValue: { fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
    divider: { height: 1, marginVertical: 10 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    statusPillText: { fontSize: 12, fontWeight: '700' },

    // Finance
    financeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    financeCol: { flex: 1, borderRadius: 12, padding: 12, borderWidth: 1 },
    financeLabel: { fontSize: 11, marginBottom: 6, fontWeight: '500' },
    financeValue: { fontSize: 17, fontWeight: '700' },
    outstandingBox: { padding: 16, borderRadius: 14, alignItems: 'center' },
    outstandingLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
    outstandingValue: { fontSize: 26, fontWeight: '800' },
    outstandingDetail: { flexDirection: 'row', gap: 16, marginTop: 8 },
    outstandingDetailText: { fontSize: 12 },

    // Contract button
    contractIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    contractChevron: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

    // Schedule
    scheduleItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
    scheduleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    scheduleNumBadge: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    scheduleNumText: { fontSize: 13, fontWeight: '700' },
    schedulePeriod: { fontSize: 15, fontWeight: '600' },
    scheduleDate: { fontSize: 12, marginTop: 4 },
    scheduleAmount: { fontSize: 15, fontWeight: '600' },
    schedulePaidTag: { fontSize: 12, marginTop: 4 },
    noDataText: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },

    // Transactions
    txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    txIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    txContent: { flex: 1 },
    txType: { fontSize: 14, fontWeight: '600' },
    txDate: { fontSize: 12, marginTop: 2 },
    txAmount: { fontSize: 14, fontWeight: '700' },

    // Footer
    footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 30 : 16 },
    actionBtn: { flex: 1, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnOutline: { borderWidth: 1.5 },
    btnOutlineText: { fontSize: 14, fontWeight: '700' },
    btnPrimary: {},
    btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#000' },

    // Repay Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalDismiss: { flex: 1 },
    modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalHeader: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    modalSubHeader: { fontSize: 14, marginBottom: 16 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, height: 58, marginBottom: 14 },
    moneyInput: { flex: 1, fontSize: 22, fontWeight: '700' },
    currencySuffix: { fontSize: 16, fontWeight: '600' },
    quickOptions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
    chipText: { fontSize: 13, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnCancelText: { fontSize: 15, fontWeight: '600' },
});

export default LoanDetailScreen;
