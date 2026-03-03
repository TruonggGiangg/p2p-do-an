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
    StatusBar,
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
}

interface ScheduleData {
    periods: Array<{
        period: number;
        dueDate?: any;
        totalDue?: number;
        principalDue?: number;
        interestDue?: number;
        complete?: boolean;
    }>;
    totalRepaymentExpected?: number;
    totalRepayment?: number;
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
        if (statusObj.rejected || statusObj.withdrawnByClient) return { text: 'Thất bại', color: '#EF4444', bgColor: '#EF444415' };
    }
    if (status === 'clean' || status === 'closed') return { text: 'Đã tất toán', color: '#10B981', bgColor: '#10B98115' };
    if (status === 'success' || status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6', bgColor: '#3B82F615' };
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
                const periods = scheduleData.periods || [];
                const totalOut = scheduleData.totalOutstanding ?? 0;
                const principalOut = (scheduleData.totalPrincipalExpected || 0) - (scheduleData.totalPrincipalPaid || 0);
                setOutstanding({
                    totalOutstanding: totalOut,
                    principalOutstanding: principalOut,
                    interestOutstanding: scheduleData.totalInterestCharged || 0,
                });
                setTotalPaid(scheduleData.totalRepayment || 0);
            }

            const outRes = await loanService.getOutstanding(loan.id);
            const outData = (outRes as any)?.data || outRes;
            if (outData?.totalOutstanding != null) {
                setOutstanding(outData);
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
            setRepaymentAmount(formatMoney(loan.monthlyPay));
            setShowRepayModal(true);
        }
    }, [autoOpenRepay, isActive, loading, outstanding]);

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

    // ---- Render Tabs ----
    const renderInfoTab = () => {
        const statusDisplay = getStatusInfo(fineractDetails?.status || rawLoan?.statusInfo, loan.status);
        return (
            <>
                {/* Loan Info Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>THÔNG TIN CHUNG</Text>
                    <InfoRow label="Mục đích vay" value={loan.willing} colors={colors} />
                    <InfoRow label="Ngày giải ngân" value={formatDate(loan.disbursementDate)} colors={colors} />
                    <InfoRow label="Lãi suất" value={`${loan.rate}%/tháng`} colors={colors} />
                    <InfoRow label="Thời hạn" value={`${loan.periodMonth} tháng`} colors={colors} />
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.statusRow}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Trạng thái</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusDisplay.bgColor }]}>
                            <Text style={[styles.statusPillText, { color: statusDisplay.color }]}>{statusDisplay.text}</Text>
                        </View>
                    </View>
                </View>

                {/* Finance Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>TÀI CHÍNH</Text>
                    <View style={styles.financeRow}>
                        <View>
                            <Text style={[styles.financeLabel, { color: colors.textMuted }]}>Gốc vay</Text>
                            <Text style={[styles.financeValue, { color: colors.text }]}>{formatMoney(loan.capital)} đ</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.financeLabel, { color: colors.textMuted }]}>Đã thanh toán</Text>
                            <Text style={[styles.financeValue, { color: colors.success }]}>{formatMoney(totalPaid)} đ</Text>
                        </View>
                    </View>

                    {outstanding && (
                        <View style={[styles.outstandingBox, { backgroundColor: colors.errorGlass, borderColor: colors.errorBorder }]}>
                            <Text style={[styles.outstandingLabel, { color: colors.error }]}>DƯ NỢ CÒN LẠI</Text>
                            <Text style={[styles.outstandingValue, { color: colors.error }]}>{formatMoney(outstanding.totalOutstanding)} đ</Text>
                            <View style={styles.outstandingDetail}>
                                <Text style={[styles.outstandingDetailText, { color: colors.error }]}>Gốc: {formatMoney(outstanding.principalOutstanding)}</Text>
                                <Text style={[styles.outstandingDetailText, { color: colors.error }]}>Lãi: {formatMoney(outstanding.interestOutstanding)}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Contract Button */}
                <TouchableOpacity
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary + '40', flexDirection: 'row', alignItems: 'center', padding: 16 }]}
                    onPress={() => navigation.navigate('LoanContractDetail' as any, { loanId: loan.id })}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="file-document-check-outline" size={24} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text }]}>Hợp đồng vay</Text>
                        <Text style={[{ fontSize: 12, color: colors.textMuted, marginTop: 2 }]}>Xem và ký hợp đồng vay</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            </>
        );
    };

    const renderScheduleTab = () => {
        const periods = schedule?.periods?.filter(p => p.period > 0) || [];
        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>LỊCH TRẢ NỢ</Text>
                {periods.length > 0 ? periods.map((p, i) => (
                    <View key={i} style={[styles.scheduleItem, { borderBottomColor: colors.border }, p.complete && { opacity: 0.5 }]}>
                        <View style={styles.scheduleLeft}>
                            <View style={[styles.scheduleNumBadge, { backgroundColor: p.complete ? colors.success + '20' : colors.primary + '20' }]}>
                                {p.complete
                                    ? <Ionicons name="checkmark" size={12} color={colors.success} />
                                    : <Text style={[styles.scheduleNumText, { color: colors.primary }]}>{p.period}</Text>
                                }
                            </View>
                            <View>
                                <Text style={[styles.schedulePeriod, { color: colors.text }]}>Kỳ {p.period}</Text>
                                <Text style={[styles.scheduleDate, { color: colors.textMuted }]}>{formatDate(p.dueDate)}</Text>
                            </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.scheduleAmount, { color: p.complete ? colors.success : colors.text }]}>
                                {formatMoney(p.totalDue)} đ
                            </Text>
                            {p.complete && <Text style={[styles.schedulePaidTag, { color: colors.success }]}>Đã trả</Text>}
                        </View>
                    </View>
                )) : (
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
            <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

            {/* Shared Header */}
            <BinanceHeader
                mode="standard"
                title="Chi Tiết Khoản Vay"
                showThemeToggle={false}
                rightComponents={<View />}
            />

            {/* Amount Hero */}
            <View style={[styles.heroCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>Số tiền vay</Text>
                <Text style={[styles.heroAmount, { color: colors.text }]}>{formatMoney(loan.capital)} <Text style={{ fontSize: 18 }}>đ</Text></Text>
                {outstanding && isActive && (
                    <View style={styles.heroSub}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.error} />
                        <Text style={[styles.heroSubText, { color: colors.error }]}>Còn lại: {formatMoney(outstanding.totalOutstanding)} đ</Text>
                    </View>
                )}
            </View>

            {/* Tab Bar */}
            <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tabItem, activeTab === tab.key && [styles.tabItemActive, { borderBottomColor: colors.primary }]]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab.key && { color: colors.primary, fontWeight: '700' }]}>
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
                        style={[styles.actionBtn, styles.btnOutline, { borderColor: colors.primary }]}
                        onPress={() => {
                            setRepaymentAmount(formatMoney(loan.monthlyPay));
                            setShowRepayModal(true);
                        }}
                        disabled={paymentLoading}
                    >
                        <Ionicons name="cash-outline" size={18} color={colors.primary} />
                        <Text style={[styles.btnOutlineText, { color: colors.primary }]}>TRẢ MỘT PHẦN</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.btnPrimary, { backgroundColor: colors.primary }]}
                        onPress={handlePrepayment}
                        disabled={paymentLoading}
                    >
                        {paymentLoading
                            ? <ActivityIndicator size="small" color="#000" />
                            : <>
                                <Ionicons name="checkmark-done-circle-outline" size={18} color="#000" />
                                <Text style={styles.btnPrimaryText}>TẤT TOÁN</Text>
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

                            {/* Quick chips */}
                            <View style={styles.quickOptions}>
                                <TouchableOpacity
                                    style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                                    onPress={() => setRepaymentAmount(formatMoney(loan.monthlyPay))}
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
    heroCard: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
    heroLabel: { fontSize: 12, marginBottom: 4 },
    heroAmount: { fontSize: 30, fontWeight: '800' },
    heroSub: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    heroSubText: { fontSize: 13, fontWeight: '500' },

    // Tab Bar
    tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16, marginTop: 4 },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabItemActive: {},
    tabText: { fontSize: 14, fontWeight: '500' },

    content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
    loadingText: { fontSize: 14 },

    // Cards
    card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    cardTitle: { fontSize: 12, fontWeight: '700', marginBottom: 14, letterSpacing: 0.6 },

    // Info rows
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    infoLabel: { fontSize: 14 },
    infoValue: { fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
    divider: { height: 1, marginVertical: 10 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusPillText: { fontSize: 12, fontWeight: '700' },

    // Finance
    financeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    financeLabel: { fontSize: 12, marginBottom: 4 },
    financeValue: { fontSize: 18, fontWeight: '700' },
    outstandingBox: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
    outstandingLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
    outstandingValue: { fontSize: 26, fontWeight: '800' },
    outstandingDetail: { flexDirection: 'row', gap: 16, marginTop: 6 },
    outstandingDetailText: { fontSize: 12, opacity: 0.9 },

    // Schedule
    scheduleItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    scheduleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    scheduleNumBadge: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    scheduleNumText: { fontSize: 12, fontWeight: '700' },
    schedulePeriod: { fontSize: 14, fontWeight: '600' },
    scheduleDate: { fontSize: 12, marginTop: 2 },
    scheduleAmount: { fontSize: 14, fontWeight: '600' },
    schedulePaidTag: { fontSize: 11, marginTop: 2 },
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
