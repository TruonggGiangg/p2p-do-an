/**
 * LoanDetailScreen.tsx - Chi tiết khoản vay - Bank-Grade UI
 * Redesign: Compact hero, detailed repayment modal, success page navigation
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator,
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
import { BinanceHeader, CommonInput, CommonButton, useConfirmModal } from '../../../components';
import { loanService, LoanHistoryItem } from '../services/loan.service';
import type { SigningStatusResponse } from '../services/loan.service';
import { 
    formatMoney, 
    formatDateShort as formatDate, 
    getStatusInfo 
} from '../utils/loanUtils';
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
        feeChargesDue?: number;
        feeChargesPaid?: number;
        penaltyChargesDue?: number;
        totalPaid?: number;
        totalOutstanding?: number;
        complete?: boolean;
    }>;
    totalRepaymentExpected?: number;
    totalRepayment?: number;
    totalPrincipalExpected?: number;
    totalPrincipalPaid?: number;
    totalInterestCharged?: number;
    totalInterestPaid?: number;
    totalOutstanding?: number;
    totalFeeChargesCharged?: number;
    totalPenaltyChargesCharged?: number;
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

const getTxTypeInfo = (typeObj: any): { text: string; icon: any; color: string } => {
    if (!typeObj) return { text: 'Giao dịch', icon: 'swap-horizontal' as any, color: '#6B7280' };
    if (typeObj.disbursement || typeObj.code?.includes('disbursement')) return { text: 'Giải ngân', icon: 'arrow-down-circle' as any, color: '#10B981' };
    if (typeObj.repayment || typeObj.code?.includes('repayment')) return { text: 'Trả nợ', icon: 'arrow-up-circle' as any, color: '#3B82F6' };
    return { text: typeObj.value || 'Giao dịch', icon: 'swap-horizontal' as any, color: '#6B7280' };
};

/** Extract error message from Axios error or plain Error */
const extractErrorMessage = (err: any, fallback: string): string => {
    return err?.response?.data?.message || err?.message || fallback;
};

// ============================= MAIN SCREEN ==============================
interface RouteParams {
    loan: LoanHistoryItem;
    autoOpenRepay?: boolean;
}

const LoanDetailScreen = ({ route }: { route: { params: RouteParams } }) => {
    const { loan: rawLoan, autoOpenRepay } = route.params;
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { theme } = useTheme();
    const colors = theme.colors;
    const modal = useConfirmModal();

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
    const [prepayAmount, setPrepayAmount] = useState<any>(null);
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'schedule' | 'history'>('info');
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [repaymentAmount, setRepaymentAmount] = useState('');
    const [fineractDetails, setFineractDetails] = useState<any>(null);

    // Support
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [supportType, setSupportType] = useState<'WAIVE_PENALTY' | 'RESCHEDULE' | null>(null);
    const [supportReason, setSupportReason] = useState('');
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [submittingSupport, setSubmittingSupport] = useState(false);
    const [signingStatus, setSigningStatus] = useState<SigningStatusResponse | null>(null);

    const isActive = useMemo(() =>
        fineractDetails?.status?.active === true ||
        loan.status === 'success' ||
        loan.status === 'disbursed',
        [fineractDetails, loan.status]);

    const isPending = useMemo(() =>
        fineractDetails?.status?.pendingApproval === true ||
        fineractDetails?.status?.waitingForDisbursal === true ||
        loan.status === 'pending' ||
        loan.status === 'waiting' ||
        loan.status === 'approved',
        [fineractDetails, loan.status]);

    const isClean = useMemo(() =>
        loan.status === 'clean' ||
        loan.status === 'closed' ||
        fineractDetails?.status?.closedObligationsMet === true,
        [loan.status, fineractDetails]);

    const hasAutoOpenedRef = useRef(false);

    // Next unpaid period
    const nextUnpaidPeriod = useMemo(() => {
        if (!schedule?.periods) return null;
        return schedule.periods.find((p: any) => p.period > 0 && !p.complete) || null;
    }, [schedule]);

    // Fetch data
    const fetchData = useCallback(async () => {
        if (!loan.id) return;
        try {
            setLoading(true);
            const scheduleRes = await loanService.getRepaymentSchedule(loan.id);
            const scheduleData = (scheduleRes as any)?.data || scheduleRes;
            if (scheduleData?.periods) {
                setSchedule(scheduleData);
                const periods: any[] = scheduleData.periods || [];
                const incompletePeriods = periods.filter((p: any) => p.period > 0 && !p.complete);
                const principalFromPeriods = incompletePeriods.reduce((s: number, p: any) => s + ((p.principalDue || 0) - (p.principalPaid || 0)), 0);
                const interestFromPeriods = incompletePeriods.reduce((s: number, p: any) => s + ((p.interestDue || 0) - (p.interestPaid || 0)), 0);
                const totalOut = scheduleData.totalOutstanding || (principalFromPeriods + interestFromPeriods);
                const principalOut = (scheduleData.totalPrincipalExpected || 0) - (scheduleData.totalPrincipalPaid || 0) || principalFromPeriods;
                const interestOut = ((scheduleData.totalInterestCharged || 0) - (scheduleData.totalInterestPaid || 0)) || interestFromPeriods;
                setOutstanding({
                    totalOutstanding: totalOut,
                    principalOutstanding: principalOut,
                    interestOutstanding: interestOut,
                });
                const paid = periods.filter((p: any) => p.period > 0).reduce((s: number, p: any) => s + (p.totalPaid || 0), 0);
                setTotalPaid(paid || scheduleData.totalRepayment || 0);
            }

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

            try {
                const txRes = await loanService.getTransactions(loan.id);
                const responseBody = (txRes as any)?.data || txRes;
                const actualData = responseBody.data || responseBody;
                const txData = actualData.transactions || [];
                if (Array.isArray(txData)) {
                    const mapped: TransactionItem[] = txData.map((t: any) => {
                        const typeInfo = getTxTypeInfo(t.type);
                        const isDisburs = t.type?.disbursement || t.type?.code?.includes('disbursement');
                        return {
                            id: t.id,
                            date: Array.isArray(t.date) ? `${t.date[2]}/${t.date[1]}/${t.date[0]}` : (t.date || ''),
                            amount: t.amount || 0,
                            type: typeInfo.text,
                            typeIcon: typeInfo.icon,
                            typeColor: typeInfo.color,
                            isDisbursement: !!isDisburs,
                        };
                    });
                    mapped.sort((a, b) => b.id - a.id);
                    setTransactions(mapped);
                }
            } catch (txErr) {
                console.warn('[LoanDetail] getTransactions failed', txErr);
            }
        } catch (err) {
            console.error('[LoanDetail] Error:', err);
        } finally {
            setLoading(false);
        }

        // Fetch signing status for approved/waiting loans
        try {
            const sigStatus = await loanService.getSigningStatus(loan.id);
            setSigningStatus(sigStatus);
        } catch (sigErr) {
            console.warn('[LoanDetail] getSigningStatus failed (optional)', sigErr);
        }
    }, [loan.id, isActive]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (autoOpenRepay && isActive && !loading && outstanding && !hasAutoOpenedRef.current) {
            hasAutoOpenedRef.current = true;
            let amount = loan.monthlyPay || 0;
            if (amount === 0 && nextUnpaidPeriod) {
                amount = nextUnpaidPeriod.totalDue || 0;
            }
            setRepaymentAmount(formatMoney(amount));
            setShowRepayModal(true);
        }
    }, [autoOpenRepay, isActive, loading, outstanding, nextUnpaidPeriod]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    // Repayment handler — navigate to dedicated RepaymentConfirmScreen
    const processRepayment = async () => {
        const amount = parseFloat(repaymentAmount.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) {
            modal.error('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }
        if (outstanding && amount > outstanding.totalOutstanding) {
            modal.error('Lỗi', `Số tiền không được vượt quá dư nợ: ${formatMoney(outstanding.totalOutstanding)} đ`);
            return;
        }
        setShowRepayModal(false);
        navigation.navigate('RepaymentConfirm', {
            loanId: loan.id!,
            loan,
            outstanding,
            nextPeriod: nextUnpaidPeriod,
            suggestedAmount: amount,
        });
    };

    // Prepayment handler — navigate to dedicated PrepaymentConfirmScreen
    const handlePrepayment = () => {
        if (!isActive || !prepayAmount) {
            modal.alert('Thông báo', 'Dữ liệu tất toán chưa sẵn sàng.');
            return;
        }
        navigation.navigate('PrepaymentConfirm', {
            loanId: loan.id!,
            loan,
            prepayAmount,
        });
    };

    // Support handler
    const handleSupportSubmit = async () => {
        if (!supportType) return;
        if (!supportReason.trim()) {
            modal.error('Chưa nhập lý do', 'Vui lòng nhập lý do/yêu cầu của bạn');
            return;
        }
        if (supportType === 'RESCHEDULE' && !rescheduleDate.trim()) {
            modal.error('Chưa nhập ngày', 'Vui lòng nhập ngày bạn muốn dời lịch trả nợ (VD: YYYY-MM-DD)');
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
                modal.success('Gửi yêu cầu thành công', 'Chúng tôi sẽ xem xét và phản hồi sớm nhất.', () => setShowSupportModal(false));
            } else {
                modal.error('Gửi thất bại', res.message || 'Đã có lỗi xảy ra');
            }
        } catch (error: any) {
            modal.error('Lỗi', extractErrorMessage(error, 'Đã có lỗi hệ thống xảy ra'));
        } finally {
            setSubmittingSupport(false);
        }
    };

    // ---- Render Tabs ----
    const renderInfoTab = () => {
        const statusDisplay = getStatusInfo({
            ...rawLoan,
            statusInfo: fineractDetails?.status || rawLoan.statusInfo
        });
        const progressPercent = outstanding && loan.capital > 0
            ? Math.min(100, Math.round((totalPaid / (loan.capital + (outstanding.interestOutstanding + totalPaid - loan.capital > 0 ? outstanding.interestOutstanding + totalPaid - loan.capital : 0))) * 100))
            : 0;

        return (
            <>
                {/* Loan Info Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardTitleRow}>
                        <View style={[styles.cardTitleDot, { backgroundColor: '#14342B' }]} />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>THÔNG TIN KHOẢN VAY</Text>
                    </View>
                    <InfoRow label="Mục đích vay" value={loan.willing} colors={colors} />
                    <InfoRow label="Ngày giải ngân" value={formatDate(loan.disbursementDate)} colors={colors} />
                    <InfoRow label="Lãi suất" value={`${Number(loan.rate).toFixed(2)}%/năm`} colors={colors} />
                    <InfoRow label="Thời hạn" value={`${loan.periodMonth} tháng`} colors={colors} />
                    <InfoRow label="Trả hàng tháng" value={`${formatMoney(loan.monthlyPay)} đ`} colors={colors} />
                    <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
                    <View style={styles.statusRow}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Trạng thái</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusDisplay.bgColor }]}>
                            <Text style={[styles.statusPillText, { color: statusDisplay.color }]}>{statusDisplay.text}</Text>
                        </View>
                    </View>
                </View>

                {/* Signing Status Card (multi-party) */}
                {signingStatus && (isPending || loan.status === 'approved') && (
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.cardTitleRow}>
                            <View style={[styles.cardTitleDot, { backgroundColor: '#8B5CF6' }]} />
                            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>TRẠNG THÁI KÝ HỢP ĐỒNG</Text>
                        </View>
                        {/* Borrower row */}
                        <View style={signingStyles.sigRow}>
                            <View style={[signingStyles.sigIcon, { backgroundColor: signingStatus.borrower.hasSigned ? '#10B981' : '#F59E0B' }]}>
                                <Ionicons name={signingStatus.borrower.hasSigned ? 'checkmark' : 'time-outline'} size={14} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[signingStyles.sigLabel, { color: colors.textPrimary }]}>Người vay (Bạn)</Text>
                                <Text style={[signingStyles.sigSub, { color: colors.textMuted }]}>
                                    {signingStatus.borrower.hasSigned ? 'Đã ký hợp đồng' : 'Chưa ký — Vui lòng ký hợp đồng'}
                                </Text>
                            </View>
                            {!signingStatus.borrower.hasSigned && (
                                <TouchableOpacity
                                    style={signingStyles.signBtn}
                                    onPress={() => navigation.navigate('LoanContractList' as any)}
                                >
                                    <Text style={signingStyles.signBtnText}>Ký ngay</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {/* Investors row */}
                        {signingStatus.investors.total > 0 && (
                            <View style={signingStyles.sigRow}>
                                <View style={[signingStyles.sigIcon, { backgroundColor: signingStatus.investors.allSigned ? '#10B981' : '#F59E0B' }]}>
                                    <Ionicons name={signingStatus.investors.allSigned ? 'checkmark-done' : 'people-outline'} size={14} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[signingStyles.sigLabel, { color: colors.textPrimary }]}>Nhà đầu tư</Text>
                                    <Text style={[signingStyles.sigSub, { color: colors.textMuted }]}>
                                        {signingStatus.investors.allSigned
                                            ? `Tất cả ${signingStatus.investors.total} NĐT đã ký`
                                            : `${signingStatus.investors.signed}/${signingStatus.investors.total} NĐT đã ký · Chờ ${signingStatus.investors.pending} NĐT`
                                        }
                                    </Text>
                                </View>
                            </View>
                        )}
                        {/* Progress bar */}
                        {signingStatus.investors.total > 0 && (
                            <View style={signingStyles.progressWrap}>
                                <View style={[signingStyles.progressBg, { backgroundColor: colors.border + '40' }]}>
                                    <View style={[
                                        signingStyles.progressFill,
                                        {
                                            width: `${Math.round(((signingStatus.borrower.hasSigned ? 1 : 0) + signingStatus.investors.signed) / (1 + signingStatus.investors.total) * 100)}%`,
                                            backgroundColor: signingStatus.readyForDisbursement ? '#10B981' : '#F59E0B',
                                        },
                                    ]} />
                                </View>
                                <Text style={[signingStyles.progressText, { color: colors.textMuted }]}>
                                    {(signingStatus.borrower.hasSigned ? 1 : 0) + signingStatus.investors.signed}/{1 + signingStatus.investors.total} bên đã ký
                                </Text>
                            </View>
                        )}
                        {/* Ready badge */}
                        {signingStatus.readyForDisbursement && (
                            <View style={signingStyles.readyBadge}>
                                <Ionicons name="rocket" size={16} color="#10B981" />
                                <Text style={signingStyles.readyText}>Đủ điều kiện giải ngân — Hệ thống sẽ tự động xử lý</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Finance Overview Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardTitleRow}>
                        <View style={[styles.cardTitleDot, { backgroundColor: '#10B981' }]} />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>TỔNG QUAN TÀI CHÍNH</Text>
                    </View>

                    <View style={styles.miniStatRow}>
                        <View style={[styles.miniStat, { backgroundColor: colors.background }]}>
                            <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Gốc vay</Text>
                            <Text style={[styles.miniStatValue, { color: colors.text }]}>{formatMoney(loan.capital)}</Text>
                        </View>
                        <View style={[styles.miniStat, { backgroundColor: colors.background }]}>
                            <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Đã trả</Text>
                            <Text style={[styles.miniStatValue, { color: '#10B981' }]}>{formatMoney(totalPaid)}</Text>
                        </View>
                        <View style={[styles.miniStat, { backgroundColor: colors.background }]}>
                            <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Còn nợ</Text>
                            <Text style={[styles.miniStatValue, { color: '#EF4444' }]}>{formatMoney(outstanding?.totalOutstanding)}</Text>
                        </View>
                    </View>

                    {outstanding && isActive && (
                        <View style={styles.progressContainer}>
                            <View style={[styles.progressTrack, { backgroundColor: colors.border + '40' }]}>
                                <View style={[styles.progressFill, { width: `${Math.min(progressPercent, 100)}%`, backgroundColor: '#10B981' }]} />
                            </View>
                            <Text style={[styles.progressText, { color: colors.textMuted }]}>Đã hoàn thành {progressPercent}%</Text>
                        </View>
                    )}

                    {outstanding && isActive && (
                        <View style={[styles.outstandingBox, { backgroundColor: '#14342B' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={styles.outstandingLabel}>DƯ NỢ CÒN LẠI</Text>
                                <Text style={styles.outstandingValue}>{formatMoney(outstanding.totalOutstanding)} đ</Text>
                            </View>
                            <View style={[styles.outstandingDetail, { marginTop: 10 }]}>
                                <View style={styles.outstandingDetailItem}>
                                    <Text style={styles.outstandingDetailLabel}>Gốc</Text>
                                    <Text style={styles.outstandingDetailValue}>{formatMoney(outstanding.principalOutstanding)}</Text>
                                </View>
                                <View style={styles.outstandingDetailItem}>
                                    <Text style={styles.outstandingDetailLabel}>Lãi</Text>
                                    <Text style={styles.outstandingDetailValue}>{formatMoney(outstanding.interestOutstanding)}</Text>
                                </View>
                                {(outstanding.penaltyOutstanding || 0) > 0 && (
                                    <View style={styles.outstandingDetailItem}>
                                        <Text style={[styles.outstandingDetailLabel, { color: '#FBBF24' }]}>Phạt</Text>
                                        <Text style={[styles.outstandingDetailValue, { color: '#FBBF24' }]}>{formatMoney(outstanding.penaltyOutstanding)}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {(outstanding?.totalOverdue ?? 0) > 0 && (
                        <View style={styles.overdueBox}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <Ionicons name="warning" size={14} color="#EF4444" />
                                <Text style={styles.overdueTitle}>NỢ QUÁ HẠN</Text>
                            </View>
                            <Text style={styles.overdueAmount}>{formatMoney(outstanding!.totalOverdue)} đ</Text>
                            {(outstanding!.delinquentDays ?? 0) > 0 && (
                                <Text style={styles.overdueDays}>
                                    Quá hạn {outstanding!.delinquentDays} ngày
                                    {outstanding!.delinquencyClassification ? ` · ${outstanding!.delinquencyClassification}` : ''}
                                </Text>
                            )}
                        </View>
                    )}
                </View>

                {/* Overdue Alert */}
                {outstanding && isActive && ((outstanding.penaltyOutstanding && outstanding.penaltyOutstanding > 0) || fineractDetails?.isOverdue) && (
                    <View style={[styles.card, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                            <Ionicons name="warning" size={18} color="#EF4444" />
                            <Text style={[styles.cardTitle, { color: '#EF4444', marginBottom: 0, marginLeft: 8 }]}>CẢNH BÁO QUÁ HẠN</Text>
                        </View>
                        <Text style={{ color: '#991B1B', fontSize: 12, marginBottom: 12, lineHeight: 18 }}>
                            Khoản vay của bạn đã trễ hạn. Vui lòng thanh toán sớm để tránh ảnh hưởng đến điểm tín dụng.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                style={[styles.supportBtn, { backgroundColor: '#FFF', borderColor: '#EF4444' }]}
                                onPress={() => { setSupportType('WAIVE_PENALTY'); setShowSupportModal(true); setSupportReason(''); }}
                            >
                                <Ionicons name="shield-checkmark-outline" size={14} color="#EF4444" />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#EF4444', marginLeft: 4 }}>Xin Xóa Phạt</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.supportBtn, { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}
                                onPress={() => { setSupportType('RESCHEDULE'); setShowSupportModal(true); setSupportReason(''); setRescheduleDate(''); }}
                            >
                                <Ionicons name="calendar-outline" size={14} color="#FFF" />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF', marginLeft: 4 }}>Xin Cơ Cấu Nợ</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Contract Button */}
                <TouchableOpacity
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', padding: 14 }]}
                    onPress={() => navigation.navigate('LoanContractDetail' as any, { loanId: loan.id, fineractLoanId: loan.fineractLoanId })}
                    activeOpacity={0.7}
                >
                    <View style={[styles.contractIcon, { backgroundColor: '#14342B10' }]}>
                        <MaterialCommunityIcons name="file-document-check-outline" size={18} color="#14342B" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Hợp đồng vay</Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>Xem và ký hợp đồng vay</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
            </>
        );
    };

    const renderScheduleTab = () => {
        const periods = schedule?.periods?.filter(p => p.period > 0) || [];
        const statusConfig = {
            paid: { label: 'Đã trả', color: '#10B981', bg: '#F0FDF4', badgeBg: '#D1FAE5' },
            overdue: { label: 'Quá hạn', color: '#EF4444', bg: '#FEF2F2', badgeBg: '#FECACA' },
            current: { label: 'Đến hạn', color: '#F59E0B', bg: '#FFFBEB', badgeBg: '#FEF3C7' },
            upcoming: { label: 'Sắp tới', color: '#9CA3AF', bg: '#FFFFFF', badgeBg: '#F3F4F6' },
        };
        const totalFees = schedule?.totalFeeChargesCharged || 0;
        const totalPenalties = schedule?.totalPenaltyChargesCharged || 0;

        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}>
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                    <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>LỊCH TRẢ NỢ</Text>
                </View>

                {(totalFees > 0 || totalPenalties > 0) && (
                    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}>
                        {totalFees > 0 && (
                            <View style={styles.feeTag}>
                                <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: '600' }}>Tổng phí: {formatMoney(totalFees)} đ</Text>
                            </View>
                        )}
                        {totalPenalties > 0 && (
                            <View style={[styles.feeTag, { backgroundColor: '#FEF3C7' }]}>
                                <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>Tổng phạt: {formatMoney(totalPenalties)} đ</Text>
                            </View>
                        )}
                    </View>
                )}

                {periods.length > 0 ? periods.map((p, i) => {
                    const status = getInstallmentStatus(p);
                    const cfg = statusConfig[status];
                    return (
                        <View key={i} style={[styles.scheduleItem, { borderBottomColor: '#F3F4F6', backgroundColor: cfg.bg }]}>
                            <View style={styles.scheduleLeft}>
                                <View style={[styles.scheduleNumBadge, { backgroundColor: cfg.badgeBg }]}>
                                    <Text style={[styles.scheduleNumText, { color: cfg.color }]}>{p.period}</Text>
                                </View>
                                <View>
                                    <Text style={[styles.schedulePeriod, { color: '#111827' }]}>Kỳ {p.period}</Text>
                                    <Text style={[styles.scheduleDate, { color: '#6B7280' }]}>{formatDate(p.dueDate)}</Text>
                                    <View style={[styles.scheduleStatusBadge, { backgroundColor: cfg.color + '15' }]}>
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: cfg.color }}>{cfg.label}</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.scheduleAmount, { color: '#111827' }]}>{formatMoney(p.totalDue)} đ</Text>
                                <Text style={styles.scheduleBreakdown}>
                                    G: {formatMoney(p.principalDue)} · L: {formatMoney(p.interestDue)}
                                </Text>
                                {((p.feeChargesDue || 0) > 0 || (p.penaltyChargesDue || 0) > 0) && (
                                    <Text style={[styles.scheduleBreakdown, { color: '#D97706' }]}>
                                        {(p.feeChargesDue || 0) > 0 ? `Phí: ${formatMoney(p.feeChargesDue)}` : ''}
                                        {(p.penaltyChargesDue || 0) > 0 ? ` Phạt: ${formatMoney(p.penaltyChargesDue)}` : ''}
                                    </Text>
                                )}
                                {(p.totalOutstanding || 0) > 0 && status !== 'upcoming' && (
                                    <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600', marginTop: 1 }}>
                                        Còn nợ: {formatMoney(p.totalOutstanding)}
                                    </Text>
                                )}
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
                <View key={i} style={[styles.txItem, { borderBottomColor: colors.border + '40' }]}>
                    <View style={[styles.txIconBox, { backgroundColor: tx.typeColor + '15' }]}>
                        <Ionicons name={tx.typeIcon as any} size={16} color={tx.typeColor} />
                    </View>
                    <View style={styles.txContent}>
                        <Text style={[styles.txType, { color: colors.text }]}>{tx.type}</Text>
                        <Text style={[styles.txDate, { color: colors.textMuted }]}>{tx.date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.isDisbursement ? '#10B981' : '#EF4444' }]}>
                        {tx.isDisbursement ? '+' : '-'}{formatMoney(tx.amount)} đ
                    </Text>
                </View>
            )) : (
                <Text style={[styles.noDataText, { color: colors.textMuted }]}>Chưa có giao dịch nào</Text>
            )}
        </View>
    );

    const TABS = [
        { key: 'info', label: 'Chi tiết', icon: 'information-circle-outline' },
        { key: 'schedule', label: 'Lịch trả', icon: 'calendar-outline' },
        { key: 'history', label: 'Lịch sử', icon: 'time-outline' },
    ] as const;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            <BinanceHeader
                mode="standard"
                title="Chi Tiết Khoản Vay"
                showThemeToggle={false}
                rightComponents={<View />}
            />

            {/* Compact Hero Card */}
            <View style={[styles.heroCard, { backgroundColor: '#14342B' }]}>
                <View style={styles.heroRow}>
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={styles.heroLabel}>Số tiền vay</Text>
                        <Text style={styles.heroAmount}>
                            {formatMoney(loan.capital)} <Text style={styles.heroCurrency}>đ</Text>
                        </Text>
                    </View>
                    <View style={styles.heroIconCircle}>
                        <MaterialCommunityIcons name="hand-coin-outline" size={18} color="#CDEA2D" />
                    </View>
                </View>
                {outstanding && isActive && (
                    <View style={styles.heroBottomRow}>
                        <View style={styles.heroPill}>
                            <View style={[styles.heroDot, { backgroundColor: '#CDEA2D' }]} />
                            <Text style={styles.heroPillText}>Dư nợ: {formatMoney(Math.round(outstanding.totalOutstanding * 100) / 100)} đ</Text>
                        </View>
                        <Text style={styles.heroPeriod}>{loan.periodMonth} tháng · {Number(loan.rate).toFixed(2)}%/năm</Text>
                    </View>
                )}
                {/* Overdue alert in hero */}
                {outstanding && isActive && (outstanding.delinquentDays ?? 0) > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.15)', marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, gap: 8 }}>
                        <Ionicons name="warning" size={16} color="#F87171" />
                        <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '700', flex: 1 }}>
                            Quá hạn {outstanding.delinquentDays} ngày
                            {(outstanding.totalOverdue ?? 0) > 0 ? ` · Nợ quá hạn: ${formatMoney(outstanding.totalOverdue)} đ` : ''}
                        </Text>
                    </View>
                )}
                {/* Penalty info in hero */}
                {outstanding && isActive && (outstanding.penaltyOutstanding ?? 0) > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251,191,36,0.15)', marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, gap: 8 }}>
                        <Ionicons name="cash-outline" size={16} color="#FBBF24" />
                        <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: '700', flex: 1 }}>
                            Phí phạt trễ hạn: {formatMoney(outstanding.penaltyOutstanding)} đ
                        </Text>
                    </View>
                )}
                {(!outstanding || !isActive) && (
                    <Text style={styles.heroPeriod}>{loan.periodMonth} tháng · {Number(loan.rate).toFixed(2)}%/năm</Text>
                )}
            </View>

            {/* Tab Bar */}
            <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Ionicons
                            name={tab.icon as any}
                            size={16}
                            color={activeTab === tab.key ? '#14342B' : colors.textMuted}
                            style={{ marginBottom: 2 }}
                        />
                        <Text style={[
                            styles.tabText,
                            { color: colors.textMuted },
                            activeTab === tab.key && { color: '#14342B', fontWeight: '700' }
                        ]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: (isActive || isPending) ? 100 : 24 }}
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
                            if (amount === 0 && nextUnpaidPeriod) {
                                amount = nextUnpaidPeriod.totalDue || 0;
                            }
                            setRepaymentAmount(formatMoney(amount));
                            setShowRepayModal(true);
                        }}
                        disabled={paymentLoading}
                    >
                        <Ionicons name="cash-outline" size={16} color="#14342B" />
                        <Text style={[styles.btnOutlineText, { color: '#14342B' }]}>Trả nợ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.btnPrimary, { backgroundColor: '#14342B' }]}
                        onPress={handlePrepayment}
                        disabled={paymentLoading}
                    >
                        {paymentLoading
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <>
                                <Ionicons name="checkmark-done-circle-outline" size={16} color="#FFFFFF" />
                                <Text style={styles.btnPrimaryText}>Tất toán</Text>
                            </>
                        }
                    </TouchableOpacity>
                </View>
            )}

            {isPending && (
                <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                        onPress={() => {
                            modal.confirm({
                                title: 'Hủy đơn vay',
                                message: 'Bạn chắc chắn muốn hủy đơn vay này?',
                                confirmText: 'Xác nhận hủy',
                                variant: 'danger',
                                onConfirm: async () => {
                                    try {
                                        setPaymentLoading(true);
                                        await loanService.withdrawLoan(loan.id);
                                        modal.success('Thành công', 'Đơn vay đã được hủy.', () => navigation.goBack());
                                    } catch (err: any) {
                                        modal.error('Lỗi', extractErrorMessage(err, 'Không thể hủy đơn vay'));
                                    } finally {
                                        setPaymentLoading(false);
                                    }
                                },
                            });
                        }}
                        disabled={paymentLoading}
                    >
                        {paymentLoading
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <>
                                <Ionicons name="close-circle-outline" size={16} color="#FFFFFF" />
                                <Text style={styles.btnPrimaryText}>Hủy đơn vay</Text>
                            </>
                        }
                    </TouchableOpacity>
                </View>
            )}

            {/* Repay Modal — Bank-Grade with Period Detail */}
            <Modal visible={showRepayModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowRepayModal(false)}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowRepayModal(false)} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
                            <Text style={[styles.modalHeader, { color: colors.text }]}>Trả nợ khoản vay</Text>

                            {/* Current Period Detail */}
                            {nextUnpaidPeriod && (
                                <View style={[styles.periodDetailBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <View style={styles.periodDetailHeader}>
                                        <Ionicons name="calendar" size={14} color="#14342B" />
                                        <Text style={[styles.periodDetailTitle, { color: colors.text }]}>
                                            Kỳ {nextUnpaidPeriod.period} — {formatDate(nextUnpaidPeriod.dueDate)}
                                        </Text>
                                        {getInstallmentStatus(nextUnpaidPeriod) === 'overdue' && (
                                            <View style={styles.overdueBadge}>
                                                <Text style={styles.overdueBadgeText}>Quá hạn</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.periodBreakdown}>
                                        <View style={styles.periodBreakdownRow}>
                                            <Text style={[styles.periodBreakdownLabel, { color: colors.textMuted }]}>Gốc</Text>
                                            <Text style={[styles.periodBreakdownValue, { color: colors.text }]}>{formatMoney(nextUnpaidPeriod.principalDue)} đ</Text>
                                        </View>
                                        <View style={styles.periodBreakdownRow}>
                                            <Text style={[styles.periodBreakdownLabel, { color: colors.textMuted }]}>Lãi</Text>
                                            <Text style={[styles.periodBreakdownValue, { color: colors.text }]}>{formatMoney(nextUnpaidPeriod.interestDue)} đ</Text>
                                        </View>
                                        {(nextUnpaidPeriod.feeChargesDue || 0) > 0 && (
                                            <View style={styles.periodBreakdownRow}>
                                                <Text style={[styles.periodBreakdownLabel, { color: colors.textMuted }]}>Phí</Text>
                                                <Text style={[styles.periodBreakdownValue, { color: '#F59E0B' }]}>{formatMoney(nextUnpaidPeriod.feeChargesDue)} đ</Text>
                                            </View>
                                        )}
                                        {(nextUnpaidPeriod.penaltyChargesDue || 0) > 0 && (
                                            <View style={styles.periodBreakdownRow}>
                                                <Text style={[styles.periodBreakdownLabel, { color: colors.textMuted }]}>Phạt</Text>
                                                <Text style={[styles.periodBreakdownValue, { color: '#EF4444' }]}>{formatMoney(nextUnpaidPeriod.penaltyChargesDue)} đ</Text>
                                            </View>
                                        )}
                                        <View style={[styles.periodBreakdownRow, { borderTopWidth: 1, borderTopColor: colors.border + '60', paddingTop: 8, marginTop: 4 }]}>
                                            <Text style={[styles.periodBreakdownLabel, { color: colors.text, fontWeight: '700' }]}>Tổng kỳ này</Text>
                                            <Text style={[styles.periodBreakdownValue, { color: '#14342B', fontWeight: '800', fontSize: 15 }]}>{formatMoney(nextUnpaidPeriod.totalDue)} đ</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            <Text style={[styles.modalSubLabel, { color: colors.textSecondary }]}>Số tiền thanh toán</Text>
                            <CommonInput
                                value={repaymentAmount}
                                onChangeText={(t) => setRepaymentAmount(formatInputVND(t))}
                                placeholder="0"
                                suffix="VNĐ"
                                keyboardType="numeric"
                                variant="standard"
                                autoFocus
                            />

                            <View style={styles.quickOptions}>
                                <TouchableOpacity
                                    style={[styles.chip, { borderColor: '#14342B', backgroundColor: '#14342B10' }]}
                                    onPress={() => {
                                        let amount = loan.monthlyPay || 0;
                                        if (amount === 0 && nextUnpaidPeriod) {
                                            amount = nextUnpaidPeriod.totalDue || 0;
                                        }
                                        setRepaymentAmount(formatMoney(amount));
                                    }}
                                >
                                    <Text style={[styles.chipText, { color: '#14342B' }]}>1 Kỳ hạn</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.chip, { borderColor: '#14342B', backgroundColor: '#14342B10' }]}
                                    onPress={() => setRepaymentAmount(formatMoney(outstanding?.totalOutstanding))}
                                >
                                    <Text style={[styles.chipText, { color: '#14342B' }]}>Toàn bộ nợ</Text>
                                </TouchableOpacity>
                                {(outstanding?.totalOverdue ?? 0) > 0 && (
                                    <TouchableOpacity
                                        style={[styles.chip, { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}
                                        onPress={() => setRepaymentAmount(formatMoney(outstanding?.totalOverdue))}
                                    >
                                        <Text style={[styles.chipText, { color: '#EF4444' }]}>Nợ quá hạn</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.modalActions}>
                                <CommonButton
                                    title="Hủy"
                                    variant="outline"
                                    size="md"
                                    onPress={() => setShowRepayModal(false)}
                                    style={{ flex: 1 }}
                                    fullWidth={false}
                                />
                                <CommonButton
                                    title="Thanh toán"
                                    variant="primary"
                                    size="md"
                                    onPress={processRepayment}
                                    style={{ flex: 1, backgroundColor: '#14342B' }}
                                    fullWidth={false}
                                />
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Support Modal */}
            <Modal visible={showSupportModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowSupportModal(false)}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowSupportModal(false)} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
                            <Text style={[styles.modalHeader, { color: colors.text }]}>
                                {supportType === 'WAIVE_PENALTY' ? 'Yêu cầu Xóa Phạt' : 'Yêu cầu Cơ cấu nợ'}
                            </Text>
                            <Text style={[styles.modalSubLabel, { color: colors.textSecondary, marginBottom: 12 }]}>
                                {supportType === 'WAIVE_PENALTY'
                                    ? 'Cho biết lý do bạn không thể thanh toán đúng hạn.'
                                    : 'Đề xuất ngày dời lịch và lý do khó khăn tài chính.'}
                            </Text>

                            {supportType === 'RESCHEDULE' && (
                                <CommonInput
                                    value={rescheduleDate}
                                    onChangeText={setRescheduleDate}
                                    placeholder="Ngày (VD: 2024-12-30)"
                                    icon="calendar"
                                    variant="standard"
                                />
                            )}

                            <CommonInput
                                value={supportReason}
                                onChangeText={setSupportReason}
                                placeholder="Lý do chi tiết..."
                                variant="standard"
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                containerStyle={{ marginTop: 8 }}
                            />

                            <View style={styles.modalActions}>
                                <CommonButton
                                    title="Hủy"
                                    variant="outline"
                                    size="md"
                                    onPress={() => setShowSupportModal(false)}
                                    disabled={submittingSupport}
                                    style={{ flex: 1 }}
                                    fullWidth={false}
                                />
                                <CommonButton
                                    title="Gửi Yêu Cầu"
                                    variant="primary"
                                    size="md"
                                    onPress={handleSupportSubmit}
                                    loading={submittingSupport}
                                    disabled={submittingSupport}
                                    style={{ flex: 1, backgroundColor: '#14342B' }}
                                    fullWidth={false}
                                />
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

    // Compact Hero
    heroCard: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
    heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroLabel: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
    heroAmount: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
    heroCurrency: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.4)' },
    heroIconCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(205,234,45,0.15)', justifyContent: 'center', alignItems: 'center' },
    heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    heroPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    heroDot: { width: 5, height: 5, borderRadius: 3 },
    heroPillText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
    heroPeriod: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 },

    // Tab Bar
    tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16, marginTop: 4 },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
    tabItemActive: { borderBottomColor: '#14342B' },
    tabText: { fontSize: 12, fontWeight: '600' },

    content: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
    loadingText: { fontSize: 13 },

    // Cards
    card: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    cardTitleDot: { width: 3, height: 14, borderRadius: 2 },
    cardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

    // Info rows
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    infoLabel: { fontSize: 13 },
    infoValue: { fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
    divider: { height: 1, marginVertical: 8 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
    statusPillText: { fontSize: 11, fontWeight: '700' },

    // Mini stats
    miniStatRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    miniStat: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
    miniStatLabel: { fontSize: 10, fontWeight: '500', marginBottom: 4 },
    miniStatValue: { fontSize: 13, fontWeight: '700' },

    // Progress
    progressContainer: { marginBottom: 12 },
    progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 2 },
    progressText: { fontSize: 10, marginTop: 4, textAlign: 'right' },

    // Outstanding
    outstandingBox: { padding: 14, borderRadius: 12 },
    outstandingLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: 'rgba(255,255,255,0.5)' },
    outstandingValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
    outstandingDetail: { flexDirection: 'row', gap: 12 },
    outstandingDetailItem: { alignItems: 'center' },
    outstandingDetailLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
    outstandingDetailValue: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },

    // Overdue
    overdueBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12, marginTop: 10 },
    overdueTitle: { fontSize: 10, fontWeight: '700', color: '#EF4444', letterSpacing: 0.4 },
    overdueAmount: { fontSize: 16, fontWeight: '800', color: '#EF4444' },
    overdueDays: { fontSize: 11, color: '#EF4444', marginTop: 2 },

    // Support
    supportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },

    // Contract
    contractIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    // Schedule
    scheduleItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
    scheduleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    scheduleNumBadge: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    scheduleNumText: { fontSize: 12, fontWeight: '700' },
    schedulePeriod: { fontSize: 13, fontWeight: '600' },
    scheduleDate: { fontSize: 11, marginTop: 2 },
    scheduleAmount: { fontSize: 13, fontWeight: '600' },
    scheduleBreakdown: { fontSize: 10, color: '#6B7280', marginTop: 2 },
    scheduleStatusBadge: { marginTop: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
    feeTag: { backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    noDataText: { textAlign: 'center', paddingVertical: 20, fontSize: 13 },

    // Transactions
    txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
    txIconBox: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    txContent: { flex: 1 },
    txType: { fontSize: 13, fontWeight: '600' },
    txDate: { fontSize: 11, marginTop: 1 },
    txAmount: { fontSize: 13, fontWeight: '700' },

    // Footer
    footer: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 28 : 14 },
    actionBtn: { flex: 1, height: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    btnOutline: { borderWidth: 1.5 },
    btnOutlineText: { fontSize: 13, fontWeight: '700' },
    btnPrimary: {},
    btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

    // Repay Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalDismiss: { flex: 1 },
    modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
    modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    modalHeader: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    modalSubLabel: { fontSize: 12, marginBottom: 6 },

    // Period detail in modal
    periodDetailBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
    periodDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    periodDetailTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
    overdueBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    overdueBadgeText: { fontSize: 10, fontWeight: '600', color: '#EF4444' },
    periodBreakdown: {},
    periodBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    periodBreakdownLabel: { fontSize: 12 },
    periodBreakdownValue: { fontSize: 12, fontWeight: '600' },

    inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 52, marginBottom: 12 },
    moneyInput: { flex: 1, fontSize: 20, fontWeight: '700' },
    currencySuffix: { fontSize: 14, fontWeight: '600' },
    quickOptions: { flexDirection: 'row', gap: 10, rowGap: 10, marginTop: 8, marginBottom: 24, flexWrap: 'wrap' },
    chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, borderWidth: 1.5, marginRight: 4, marginVertical: 4 },
    chipText: { fontSize: 13, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    modalBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    btnCancelText: { fontSize: 14, fontWeight: '600' },
});

const signingStyles = StyleSheet.create({
    sigRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sigIcon: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    sigLabel: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
    sigSub: { fontSize: 12 },
    signBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    signBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    progressWrap: { marginTop: 4, marginBottom: 12 },
    progressBg: { height: 6, borderRadius: 3, width: '100%', overflow: 'hidden', marginBottom: 6 },
    progressFill: { height: '100%', borderRadius: 3 },
    progressText: { fontSize: 11, textAlign: 'right', fontWeight: '600' },
    readyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', padding: 10, borderRadius: 8, gap: 8 },
    readyText: { color: '#10B981', fontSize: 12, fontWeight: '600', flex: 1 },
});

export default LoanDetailScreen;
