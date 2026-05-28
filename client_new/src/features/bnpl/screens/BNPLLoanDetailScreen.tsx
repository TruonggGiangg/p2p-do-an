import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard, useConfirmModal } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import { bnplAPI } from '../api/bnpl.api';
import type { BnplLoan, BnplTransaction } from '../api/bnpl.api';

type RouteParams = { loan: BnplLoan };

/** strip trailing ₫/đ from Intl output so we append our own */
const fmt = (n: number) => formatCurrency(n).replace(/\s*[₫đ]/g, '').trim();

export default function BNPLLoanDetailScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const modal = useConfirmModal();
    const { loan: routeLoan } = (route.params || {}) as RouteParams;
    const c = theme.colors;
    const [menuVisible, setMenuVisible] = useState(false);
    const [loading, setLoading] = useState(Boolean(routeLoan));
    const [detail, setDetail] = useState<BnplLoan | null>(routeLoan || null);
    const [transactions, setTransactions] = useState<BnplTransaction[]>([]);

    useEffect(() => {
        if (!routeLoan?.id) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        const loadLoanDetail = async () => {
            setLoading(true);
            try {
                const [freshLoan, txResponse] = await Promise.all([
                    bnplAPI.getLoanDetails(routeLoan.id),
                    bnplAPI.getTransactions(100),
                ]);

                if (cancelled) {
                    return;
                }

                setDetail(freshLoan);
                setTransactions(
                    txResponse.transactions.filter(
                        (tx) => tx.loanId === routeLoan.id || tx.fineractLoanId === routeLoan.fineractLoanId,
                    ),
                );
            } catch {
                if (!cancelled) {
                    setDetail(routeLoan);
                    setTransactions([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadLoanDetail();

        return () => {
            cancelled = true;
        };
    }, [routeLoan?.id, routeLoan?.fineractLoanId]);

    const loan = detail || routeLoan;

    if (!loan) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Chi tiết khoản vay" showBack />
            </View>
        );
    }

    if (loading && !detail) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Chi tiáº¿t khoáº£n vay" showBack />
                <View style={styles.loadingWrap}>
                    <Text style={{ color: c.textSecondary }}>Đang tải dữ liệu khoản BNPL...</Text>
                </View>
            </View>
        );
    }

    const isClosed = loan.status?.toLowerCase() === 'closed';
    const scheduleItems = loan.repaymentSchedule || [];
    const paidCount = scheduleItems.filter(s => (s as any).status === 'paid' || (s as any).paid).length;
    const totalDue = scheduleItems
        .filter(s => !((s as any).status === 'paid' || (s as any).paid))
        .reduce((sum, s) => sum + s.total, 0);

    const paymentHistory = transactions
        .filter((tx) => ['repayment', 'prepayment', 'fee', 'adjustment'].includes(tx.type))
        .sort((a, b) => {
            const left = new Date(a.date || a.createdAt || 0).getTime();
            const right = new Date(b.date || b.createdAt || 0).getTime();
            return right - left;
        });

    /** Nice date string — never breaks across lines */
    const formatDueDate = (raw: string) => {
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) return raw;
        try {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        } catch { }
        return raw;
    };

    const statusLabel = (s: string) => {
        switch (s.toLowerCase()) {
            case 'active': return 'Hoạt động';
            case 'closed': return 'Đã tất toán';
            case 'pending': return 'Chờ duyệt';
            default: return s;
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                title="Chi tiết khoản vay"
                showBack
                rightComponents={
                    <TouchableOpacity onPress={() => setMenuVisible(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <MaterialCommunityIcons name="dots-vertical" size={22} color={c.textPrimary} />
                    </TouchableOpacity>
                }
            />

            {/* Dropdown */}
            {menuVisible && (
                <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
                    <View style={[styles.menuBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                        {!isClosed && (
                            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); navigation.navigate('BNPLEarlyRepay', { loan }); }}>
                                <MaterialCommunityIcons name="credit-card-fast-outline" size={18} color={c.primary} />
                                <Text style={[styles.menuItemText, { color: c.textPrimary }]}>Trả nợ trước hạn</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); modal.alert('Thông tin', `Mã: #${loan.fineractLoanId}\nTrạng thái: ${statusLabel(loan.status)}`); }}>
                            <MaterialCommunityIcons name="information-outline" size={18} color={c.textSecondary} />
                            <Text style={[styles.menuItemText, { color: c.textPrimary }]}>Thông tin chi tiết</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            )}

            <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 20 }} showsVerticalScrollIndicator={false}>

                {/* ═══ Hero ═══ */}
                <View style={[styles.hero, { backgroundColor: c.primaryGlass, borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                    <Text style={[styles.heroLabel, { color: c.textSecondary }]}>Số tiền vay</Text>
                    <Text style={[styles.heroAmount, { color: c.textPrimary }]}>{fmt(loan.principal)} đ</Text>
                    {isClosed ? (
                        <View style={[styles.closedBadge, { backgroundColor: '#0ECB8120' }]}>
                            <MaterialCommunityIcons name="check-circle" size={15} color="#0ECB81" />
                            <Text style={[styles.closedText, { color: '#0ECB81' }]}>Khoản vay đã tất toán</Text>
                        </View>
                    ) : (
                        <Text style={[styles.heroSub, { color: c.textSecondary }]}>Bạn đã thanh toán {paidCount}/{scheduleItems.length || loan.numberOfRepayments} kỳ</Text>
                    )}
                </View>

                {/* ═══ Repayment Schedule ═══ */}
                <View style={styles.section}>
                    {scheduleItems.length > 0 ? scheduleItems.map((item, idx) => {
                        const paid = (item as any).status === 'paid' || (item as any).paid;
                        const dateStr = formatDueDate(item.dueDate);
                        return (
                            <View key={idx} style={[styles.scheduleItem, { borderLeftColor: paid ? '#0ECB81' : c.primary }]}>
                                {/* Left timeline dot */}
                                <View style={[styles.timelineDot, { backgroundColor: paid ? '#0ECB81' : c.primary }]}>
                                    {paid && <MaterialCommunityIcons name="check" size={10} color="#fff" />}
                                </View>

                                {/* Period info */}
                                <View style={styles.periodInfo}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={[styles.periodPill, { backgroundColor: paid ? '#0ECB8118' : c.primaryGlass }]}>
                                            <Text style={[styles.periodPillText, { color: paid ? '#0ECB81' : c.primary }]}>Kỳ {item.period}</Text>
                                        </View>
                                        <Text style={[styles.periodDateText, { color: c.textSecondary }]}>{dateStr}</Text>
                                    </View>
                                    <Text style={[styles.scheduleLabel, { color: c.textSecondary }]}>Gốc và lãi phải trả</Text>
                                </View>

                                {/* Right side */}
                                <View style={styles.scheduleRight}>
                                    <Text style={[styles.scheduleAmt, { color: paid ? c.textDim : c.textPrimary, textDecorationLine: paid ? 'line-through' : 'none' }]}>
                                        {fmt(item.total)} đ
                                    </Text>
                                    {paid && (
                                        <View style={[styles.paidBadge, { backgroundColor: '#0ECB8118' }]}>
                                            <Text style={styles.paidBadgeText}>Đã thanh toán</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    }) : (
                        [
                            { label: 'Tổng phải trả', value: loan.totalRepayment },
                            { label: 'Đã trả', value: loan.paidAmount },
                            { label: 'Còn nợ', value: loan.outstandingBalance },
                        ].map((row, idx) => (
                            <View key={idx} style={[styles.fallbackRow, { borderBottomColor: c.border }]}>
                                <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                <Text style={[styles.infoValue, { color: c.textPrimary }]}>{fmt(row.value)} đ</Text>
                            </View>
                        ))
                    )}

                    {/* Total outstanding */}
                    {!isClosed && (
                        <View style={[styles.totalRow, { backgroundColor: c.primaryGlass }]}>
                            <Text style={[styles.totalLabel, { color: c.textSecondary }]}>Tổng đến hạn chưa trả:</Text>
                            <Text style={[styles.totalValue, { color: c.textPrimary }]}>{fmt(totalDue || loan.outstandingBalance)} đ</Text>
                        </View>
                    )}

                    {/* Notice */}
                    <View style={[styles.notice, { backgroundColor: c.glassLight }]}>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color={c.primary} />
                        <Text style={[styles.noticeText, { color: c.textDim }]}>
                            Nợ sẽ được tự động trừ trước 22h30 vào ngày đến hạn, bạn hãy chắc chắn rằng mình có đủ số dư tài khoản.
                        </Text>
                    </View>
                </View>

                {/* ═══ Loan Info ═══ */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Thông tin khoản vay</Text>
                    <CommonCard style={{ padding: 0, overflow: 'hidden' }}>
                        {[
                            { label: 'Số hợp đồng', value: `010BNP${loan.fineractLoanId}.${loan.id?.slice(-6) || '000000'}` },
                            { label: 'Ngày giải ngân', value: loan.disbursedAt ? formatDueDate(new Date(loan.disbursedAt).toLocaleDateString('vi-VN')) : '—' },
                            { label: 'Dư nợ gốc còn lại', value: `${fmt(loan.outstandingBalance)} đ` },
                            { label: 'Lãi suất', value: `${((loan.totalInterest / loan.principal / Math.max(loan.numberOfRepayments / 12, 0.01)) * 100).toFixed(1)}%/năm` },
                        ].map((row, idx, arr) => (
                            <View key={idx} style={[styles.loanInfoRow, { borderBottomColor: c.border }, idx < arr.length - 1 && { borderBottomWidth: 1 }]}>
                                <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                <Text style={[styles.infoValue, { color: c.textPrimary }]}>{row.value}</Text>
                            </View>
                        ))}
                    </CommonCard>
                </View>

                {/* ═══ Payment history ═══ */}
                {paymentHistory.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Lịch sử thanh toán</Text>
                        {paymentHistory.map((p, idx) => (
                            <View key={idx} style={[styles.paymentRow, { borderColor: c.border, backgroundColor: c.surface }]}>
                                <View style={[styles.paymentIcon, { backgroundColor: c.primaryGlass }]}>
                                    <MaterialCommunityIcons name="credit-card-check-outline" size={20} color={c.primary} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[styles.paymentDesc, { color: c.textPrimary }]}>{p.type}</Text>
                                    <Text style={[styles.paymentNote, { color: c.textDim }]}>{p.date}</Text>
                                </View>
                                <Text style={[styles.paymentAmt, { color: '#F6465D' }]}>-{fmt(p.amount)} đ</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Contact */}
                <View style={styles.contactSection}>
                    <MaterialCommunityIcons name="phone-outline" size={16} color={c.textDim} />
                    <Text style={{ color: c.textDim, fontSize: 12 }}>
                        Mọi thắc mắc xin vui lòng liên hệ Hotline: <Text style={{ color: c.primary }}>19006954</Text>
                    </Text>
                </View>

                {/* Early repay button (yellow) */}
                {!isClosed && (
                    <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                        <TouchableOpacity
                            style={[styles.earlyRepayBtn, { backgroundColor: c.primary }]}
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('BNPLEarlyRepay', { loan })}
                        >
                            <MaterialCommunityIcons name="credit-card-fast-outline" size={18} color={c.onPrimary} />
                            <Text style={[styles.earlyRepayBtnText, { color: c.onPrimary }]}>Trả nợ trước hạn</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 },
    heroLabel: { fontSize: 13, marginBottom: 6 },
    heroAmount: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
    heroSub: { fontSize: 13, marginTop: 6 },
    closedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 8 },
    closedText: { fontSize: 13, fontWeight: '700' },
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },

    // ── Timeline schedule items
    scheduleItem: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingVertical: 14, paddingLeft: 20, borderLeftWidth: 2, marginLeft: 10, gap: 12,
        position: 'relative',
    },
    timelineDot: {
        position: 'absolute', left: -7, top: 18,
        width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center',
    },
    periodInfo: { flex: 1, gap: 4 },
    periodPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    periodPillText: { fontSize: 11, fontWeight: '700' },
    periodDateText: { fontSize: 12 },
    scheduleLabel: { fontSize: 13, marginTop: 2 },
    scheduleRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    scheduleAmt: { fontSize: 14, fontWeight: '700' },
    paidBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    paidBadgeText: { color: '#0ECB81', fontSize: 10, fontWeight: '700' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 10, marginTop: 14 },
    totalLabel: { fontSize: 14, fontWeight: '600' },
    totalValue: { fontSize: 14, fontWeight: '700' },
    notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10, marginTop: 12 },
    noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },
    fallbackRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1 },
    loanInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
    infoLabel: { fontSize: 13 },
    infoValue: { fontSize: 13, fontWeight: '600' },
    paymentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
    paymentIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    paymentDesc: { fontSize: 13, fontWeight: '600' },
    paymentNote: { fontSize: 11, marginTop: 2 },
    paymentAmt: { fontSize: 14, fontWeight: '700', flexShrink: 0, marginLeft: 8 },
    contactSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20 },
    earlyRepayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14 },
    earlyRepayBtnText: { fontSize: 15, fontWeight: '700' },
    menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
    menuBox: { position: 'absolute', top: 60, right: 16, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 10, minWidth: 200 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
    menuItemText: { fontSize: 14, fontWeight: '500' },
});
