import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard, CommonButton } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import type { BnplLoan } from '../api/bnpl.api';

type RouteParams = { loan: BnplLoan };

export default function BNPLLoanDetailScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { loan } = (route.params || {}) as RouteParams;
    const c = theme.colors;
    const [menuVisible, setMenuVisible] = useState(false);

    if (!loan) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Chi tiết khoản vay" showBack />
            </View>
        );
    }

    const isClosed = loan.status?.toLowerCase() === 'closed';
    const scheduleItems = loan.repaymentSchedule || [];
    const paidCount = scheduleItems.filter(s => (s as any).status === 'paid' || (s as any).paid).length;
    const totalDue = scheduleItems
        .filter(s => !((s as any).status === 'paid' || (s as any).paid))
        .reduce((sum, s) => sum + s.total, 0);

    // Mock payment history from paidAmount
    const mockPayments = loan.paidAmount > 0 ? [
        {
            id: '1',
            date: new Date().toLocaleDateString('vi-VN'),
            amount: loan.paidAmount,
            transactionId: `TX${loan.fineractLoanId}001`,
            type: 'Thanh toán dư nợ',
        },
    ] : [];

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                title="Chi tiết khoản vay"
                showBack
                rightComponents={
                    <TouchableOpacity
                        onPress={() => setMenuVisible(v => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ marginRight: 16 }}
                    >
                        <MaterialCommunityIcons name="dots-vertical" size={22} color={c.textPrimary} />
                    </TouchableOpacity>
                }
            />
            {/* Dropdown menu */}
            {menuVisible && (
                <TouchableOpacity
                    style={[styles.menuOverlay]}
                    activeOpacity={1}
                    onPress={() => setMenuVisible(false)}
                >
                    <View style={[styles.menuBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                        {!isClosed && (
                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setMenuVisible(false);
                                    navigation.navigate('BNPLEarlyRepay', { loan });
                                }}
                            >
                                <MaterialCommunityIcons name="credit-card-fast-outline" size={18} color={c.primary} />
                                <Text style={[styles.menuItemText, { color: c.textPrimary }]}>Trả nợ trước hạn</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                                setMenuVisible(false);
                                Alert.alert('Thông tin', `Mã khoản vay: #${loan.fineractLoanId}`);
                            }}
                        >
                            <MaterialCommunityIcons name="information-outline" size={18} color={c.textSecondary} />
                            <Text style={[styles.menuItemText, { color: c.textPrimary }]}>Thông tin chi tiết</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            )}

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* Hero */}
                <View style={[styles.hero, { backgroundColor: c.primaryGlass, borderBottomColor: c.primaryBorder, borderBottomWidth: 1 }]}>
                    <Text style={[styles.heroLabel, { color: c.textSecondary }]}>Số tiền vay</Text>
                    <Text style={[styles.heroAmount, { color: c.textPrimary }]}>
                        {formatCurrency(loan.principal)}
                    </Text>
                    {isClosed ? (
                        <View style={[styles.closedBadge, { backgroundColor: '#0ECB8125', borderColor: '#0ECB81' }]}>
                            <MaterialCommunityIcons name="check-circle" size={15} color="#0ECB81" />
                            <Text style={[styles.closedText, { color: '#0ECB81' }]}>Khoản vay đã tất toán</Text>
                        </View>
                    ) : (
                        <Text style={[styles.heroSub, { color: c.textSecondary }]}>
                            Bạn đã thanh toán {paidCount}/{scheduleItems.length || loan.numberOfRepayments} kỳ
                        </Text>
                    )}
                </View>

                {/* Repayment Schedule */}
                <View style={styles.section}>
                    {scheduleItems.length > 0 ? (
                        scheduleItems.map((item, idx) => {
                            const paid = (item as any).status === 'paid' || (item as any).paid;
                            return (
                                <View key={idx} style={[styles.scheduleItem, { borderBottomColor: c.border }]}>
                                    <View style={[styles.periodBadge, {
                                        backgroundColor: paid ? c.successGlass : c.primaryGlass,
                                    }]}>
                                        <Text style={[styles.periodNum, { color: paid ? c.success : c.primary }]}>
                                            Kỳ {item.period}
                                        </Text>
                                        <Text style={[styles.periodDate, { color: paid ? c.success : c.primary }]}>
                                            {item.dueDate}
                                        </Text>
                                    </View>
                                    <View style={styles.scheduleMiddle}>
                                        <Text style={[styles.scheduleLabel, { color: c.textSecondary }]}>
                                            Gốc và lãi phải trả
                                        </Text>
                                        {paid && (
                                            <Text style={[styles.paidLabel, { color: c.success }]}>
                                                ✓ Đã thanh toán thành công
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.scheduleRight}>
                                        <Text style={[styles.scheduleAmt, { color: c.textPrimary }]}>
                                            {formatCurrency(item.total)} đ
                                        </Text>
                                        {paid && (
                                            <Text style={[styles.scheduleAmt, { color: c.textDim, fontSize: 12 }]}>
                                                {formatCurrency(item.total)} đ
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    ) : (
                        // Fallback: show loan summary rows
                        [
                            { label: 'Tổng phải trả', value: loan.totalRepayment },
                            { label: 'Đã trả', value: loan.paidAmount },
                            { label: 'Còn nợ', value: loan.outstandingBalance },
                        ].map((row, idx) => (
                            <View key={idx} style={[styles.infoRow, { borderBottomColor: c.border }]}>
                                <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                <Text style={[styles.infoValue, { color: c.textPrimary }]}>{formatCurrency(row.value)} đ</Text>
                            </View>
                        ))
                    )}

                    {/* Total outstanding */}
                    {!isClosed && (
                        <View style={[styles.totalRow, { backgroundColor: c.primaryGlass }]}>
                            <Text style={[styles.totalLabel, { color: c.textSecondary }]}>Tổng đến hạn chưa trả:</Text>
                            <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                                {formatCurrency(totalDue || loan.outstandingBalance)} đ
                            </Text>
                        </View>
                    )}

                    {/* Notice */}
                    <View style={[styles.notice, { backgroundColor: c.glassLight }]}>
                        <MaterialCommunityIcons name="information-outline" size={14} color={c.textDim} />
                        <Text style={[styles.noticeText, { color: c.textDim }]}>
                            Nợ sẽ được tự động trừ trước 22h30 vào ngày đến hạn, bạn hãy chắc chắn rằng mình có đủ số dư tài khoản.
                        </Text>
                    </View>
                </View>

                {/* Loan Info */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Thông tin khoản vay</Text>
                    <CommonCard style={{ padding: 0 }}>
                        {[
                            { label: 'Số hợp đồng', value: `010${loan.fineractLoanId}.${loan.id?.slice(-6) || '000000'}` },
                            { label: 'Ngày giải ngân', value: loan.disbursedAt ? new Date(loan.disbursedAt).toLocaleDateString('vi-VN') : '—' },
                            { label: 'Dư nợ gốc còn lại', value: `${formatCurrency(loan.outstandingBalance)} đ` },
                            { label: 'Lãi suất', value: `${((loan.totalInterest / loan.principal / (loan.numberOfRepayments / 12)) * 100).toFixed(1)}%/năm` },
                        ].map((row, idx, arr) => (
                            <View key={idx} style={[
                                styles.loanInfoRow,
                                { borderBottomColor: c.border },
                                idx < arr.length - 1 && { borderBottomWidth: 1 },
                            ]}>
                                <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                <Text style={[styles.infoValue, { color: c.textPrimary }]}>{row.value}</Text>
                            </View>
                        ))}
                    </CommonCard>
                </View>

                {/* Payment history */}
                {mockPayments.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Lịch sử thanh toán</Text>
                        <Text style={[styles.dateGroup, { color: c.textDim }]}>
                            {mockPayments[0]?.date}
                        </Text>
                        {mockPayments.map((p, idx) => (
                            <View key={idx} style={[styles.paymentRow, { borderColor: c.border }]}>
                                <View style={[styles.paymentIcon, { backgroundColor: c.primaryGlass }]}>
                                    <MaterialCommunityIcons name="credit-card-check-outline" size={22} color={c.primary} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[styles.paymentDesc, { color: c.textPrimary }]}>
                                        Mã giao dịch {p.transactionId}
                                    </Text>
                                    <Text style={[styles.paymentNote, { color: c.textDim }]}>
                                        Mọi thắc mắc xin vui lòng liên hệ Hotline: 19006954
                                    </Text>
                                </View>
                                <Text style={[styles.paymentAmt, { color: '#F6465D' }]}>
                                    -{formatCurrency(p.amount)} đ
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Contact */}
                <View style={{ padding: 20, alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="phone-outline" size={16} color={c.textDim} />
                    <Text style={[{ color: c.textDim, fontSize: 12 }]}>Mọi thắc mắc xin vui lòng liên hệ Hotline: 19006954</Text>
                </View>

                {/* Early repay button (only for active loans) */}
                {!isClosed && (
                    <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
                        <CommonButton
                            title="Trả nợ trước hạn"
                            variant="secondary"
                            icon="credit-card-fast-outline"
                            onPress={() => navigation.navigate('BNPLEarlyRepay', { loan })}
                        />
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 },
    heroLabel: { fontSize: 13, marginBottom: 6 },
    heroAmount: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
    heroSub: { fontSize: 13 },
    closedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginTop: 4,
    },
    closedText: { fontSize: 13, fontWeight: '700' },
    section: { padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    scheduleItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, borderBottomWidth: 1, gap: 12,
    },
    periodBadge: {
        width: 48, borderRadius: 8, alignItems: 'center',
        paddingVertical: 6, justifyContent: 'center',
    },
    periodNum: { fontSize: 9, fontWeight: '700' },
    periodDate: { fontSize: 12, fontWeight: '800', marginTop: 2 },
    scheduleMiddle: { flex: 1 },
    scheduleLabel: { fontSize: 13 },
    paidLabel: { fontSize: 11, marginTop: 3 },
    scheduleRight: { alignItems: 'flex-end' },
    scheduleAmt: { fontSize: 14, fontWeight: '700' },
    totalRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        padding: 14, borderRadius: 8, marginTop: 12,
    },
    totalLabel: { fontSize: 14, fontWeight: '600' },
    totalValue: { fontSize: 14, fontWeight: '700' },
    notice: {
        flexDirection: 'row', gap: 8, alignItems: 'flex-start',
        padding: 12, borderRadius: 8, marginTop: 10,
    },
    noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 13, borderBottomWidth: 1,
    },
    loanInfoRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 13, paddingHorizontal: 16,
    },
    infoLabel: { fontSize: 13 },
    infoValue: { fontSize: 13, fontWeight: '600' },
    dateGroup: { fontSize: 12, marginBottom: 8 },
    paymentRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 12, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8,
    },
    paymentIcon: {
        width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
    },
    paymentDesc: { fontSize: 13, fontWeight: '600' },
    paymentNote: { fontSize: 11, marginTop: 2 },
    paymentAmt: { fontSize: 14, fontWeight: '700', flexShrink: 0, marginLeft: 8 },
    menuOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    },
    menuBox: {
        position: 'absolute', top: 60, right: 16,
        borderRadius: 10, borderWidth: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 8, elevation: 10,
        minWidth: 200,
    },
    menuItem: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 14,
    },
    menuItemText: { fontSize: 14, fontWeight: '500' },
});
