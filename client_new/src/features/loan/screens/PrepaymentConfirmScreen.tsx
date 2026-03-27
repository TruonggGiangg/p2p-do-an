/**
 * PrepaymentConfirmScreen — Xác nhận tất toán sớm
 * Bank-grade UI: wallet selection, breakdown, PIN + OTP, success navigation
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BinanceHeader, OTPProtectedAction, PinVerifyModal } from '../../../components';
import { loanService } from '../services/loan.service';
import { walletAPI } from '../../wallet/api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import { WalletSelectorModal } from '../../wallet/components/WalletSelectorModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { OtpActionType } from '../../../types/otp.types';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import type { Wallet } from '../../../types/auth.types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PrepaymentConfirm'>;

const fmt = (n: number) => n?.toLocaleString('vi-VN') ?? '0';

export default function PrepaymentConfirmScreen() {
    const { theme } = useTheme();
    const C = theme.colors;
    const route = useRoute();
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const params = (route.params || {}) as {
        loanId: string;
        loan: any;
        prepayAmount: any;
    };
    const { loanId, loan, prepayAmount } = params;

    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showPinVerify, setShowPinVerify] = useState(false);
    const otpTriggerRef = useRef<(() => void) | null>(null);

    const totalAmount = prepayAmount?.totalWithPenalty || prepayAmount?.amount || 0;
    const penalty = prepayAmount?.prepaymentPenalty || 0;

    useEffect(() => {
        (async () => {
            try {
                const res = await walletAPI.getWallets();
                const wList = res.wallets ?? [];
                setWallets(wList);
                setSelectedWallet(wList.find((w) => w.isDefault) ?? wList[0] ?? null);
            } catch { }
            setLoading(false);
        })();
    }, []);

    const handlePrepay = useCallback(async (payload?: { otpSessionId?: string }) => {
        if (!selectedWallet) {
            Alert.alert('Lỗi', 'Vui lòng chọn ví thanh toán');
            return;
        }

        setSubmitting(true);
        try {
            const result = await loanService.prepayLoan(
                loanId,
                new Date().toISOString().split('T')[0],
            );
            const data = (result as any)?.data || result;
            if (data?.success) {
                navigation.replace('PrepaymentSuccess', {
                    totalAmount: data.amount || totalAmount,
                    transactionId: data.transactionId,
                    date: data.date || new Date().toISOString().split('T')[0],
                    capitalOriginal: loan?.capital,
                    breakdown: data.breakdown || {
                        principal: prepayAmount?.principalPortion,
                        interest: prepayAmount?.interestPortion,
                        fees: 0,
                        penalty,
                    },
                    penaltyRate: prepayAmount?.penaltyRate,
                    penaltyChargeName: prepayAmount?.penaltyChargeName,
                });
            } else {
                throw new Error(data?.message || 'Tất toán thất bại');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể tất toán';
            Alert.alert('Lỗi tất toán', msg);
        } finally {
            setSubmitting(false);
        }
    }, [selectedWallet, loanId, loan, prepayAmount, totalAmount, penalty, navigation]);

    const walletBalance = selectedWallet?.balance ?? 0;
    const isInsufficient = totalAmount > 0 && walletBalance > 0 && totalAmount > walletBalance;

    return (
        <View style={[s.container, { backgroundColor: C.background }]}>
            <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
            <BinanceHeader title="Tất toán sớm" mode="standard" />

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Warning Banner ── */}
                <View style={[s.warningBanner, { backgroundColor: '#f59e0b15' }]}>
                    <MaterialCommunityIcons name="information-outline" size={20} color="#f59e0b" />
                    <Text style={{ color: '#92400e', fontSize: 13, flex: 1, lineHeight: 18 }}>
                        Tất toán sớm sẽ đóng khoản vay hoàn toàn. Phí phạt tất toán sớm có thể được áp dụng.
                    </Text>
                </View>

                {/* ── Loan Info ── */}
                <View style={[s.card, { backgroundColor: C.surface }]}>
                    <Text style={[s.sectionTitle, { color: C.textSecondary }]}>THÔNG TIN KHOẢN VAY</Text>
                    <View style={s.infoRow}>
                        <Text style={[s.infoLabel, { color: C.textSecondary }]}>Mã khoản vay</Text>
                        <Text style={[s.infoValue, { color: C.textPrimary }]}>#{loan?.fineractLoanId || loan?.id?.slice(-8)}</Text>
                    </View>
                    <View style={s.infoRow}>
                        <Text style={[s.infoLabel, { color: C.textSecondary }]}>Gốc vay</Text>
                        <Text style={[s.infoValue, { color: C.textPrimary }]}>{formatCurrency(loan?.capital)}</Text>
                    </View>
                    <View style={s.infoRow}>
                        <Text style={[s.infoLabel, { color: C.textSecondary }]}>Kỳ hạn</Text>
                        <Text style={[s.infoValue, { color: C.textPrimary }]}>{loan?.periodMonth} tháng</Text>
                    </View>
                </View>

                {/* ── Breakdown ── */}
                <View style={[s.card, { backgroundColor: C.surface }]}>
                    <Text style={[s.sectionTitle, { color: C.textSecondary }]}>CHI TIẾT SỐ TIỀN TẤT TOÁN</Text>
                    <View style={s.infoRow}>
                        <Text style={[s.infoLabel, { color: C.textSecondary }]}>Gốc còn lại</Text>
                        <Text style={[s.infoValue, { color: C.textPrimary }]}>{fmt(prepayAmount?.principalPortion || 0)} đ</Text>
                    </View>
                    <View style={s.infoRow}>
                        <Text style={[s.infoLabel, { color: C.textSecondary }]}>Lãi đến ngày</Text>
                        <Text style={[s.infoValue, { color: C.textPrimary }]}>{fmt(prepayAmount?.interestPortion || 0)} đ</Text>
                    </View>
                    {(prepayAmount?.feesPortion || 0) > 0 && (
                        <View style={s.infoRow}>
                            <Text style={[s.infoLabel, { color: C.textSecondary }]}>Phí</Text>
                            <Text style={[s.infoValue, { color: C.textPrimary }]}>{fmt(prepayAmount.feesPortion)} đ</Text>
                        </View>
                    )}
                    {penalty > 0 && (
                        <View style={s.infoRow}>
                            <Text style={[s.infoLabel, { color: '#dc2626' }]}>
                                {prepayAmount?.penaltyChargeName || 'Phí phạt tất toán sớm'} {prepayAmount?.penaltyRate ? `(${prepayAmount.penaltyRate}%)` : ''}
                            </Text>
                            <Text style={[s.infoValue, { color: '#dc2626', fontWeight: '700' }]}>{fmt(penalty)} đ</Text>
                        </View>
                    )}
                    <View style={[s.totalRow, { borderTopColor: C.border }]}>
                        <Text style={[s.totalLabel, { color: C.textPrimary }]}>Tổng tất toán</Text>
                        <Text style={[s.totalValue, { color: C.primary }]}>{fmt(totalAmount)} đ</Text>
                    </View>
                </View>

                {/* ── Wallet Selection ── */}
                <View style={[s.card, { backgroundColor: C.surface }]}>
                    <Text style={[s.sectionTitle, { color: C.textSecondary }]}>NGUỒN THANH TOÁN</Text>
                    {loading ? (
                        <ActivityIndicator color={C.primary} />
                    ) : (
                        <TouchableOpacity
                            style={[s.walletSelect, { borderColor: selectedWallet ? C.primary : C.border, backgroundColor: C.background }]}
                            onPress={() => setShowWalletModal(true)}
                        >
                            <View style={[s.walletIcon, { backgroundColor: C.primary + '15' }]}>
                                <MaterialCommunityIcons name="wallet-outline" size={22} color={C.primary} />
                            </View>
                            {selectedWallet ? (
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.walletName, { color: C.textPrimary }]}>
                                        {selectedWallet.productName || 'Ví điện tử'}
                                    </Text>
                                    <Text style={[s.walletBalance, { color: C.textSecondary }]}>
                                        Số dư: {formatCurrency(walletBalance)}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={{ flex: 1, color: C.textSecondary }}>Chọn ví thanh toán</Text>
                            )}
                            <MaterialCommunityIcons name="chevron-right" size={22} color={C.textSecondary} />
                        </TouchableOpacity>
                    )}
                    {isInsufficient && (
                        <View style={[s.insufficientBox, { backgroundColor: '#dc262615' }]}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#dc2626" />
                            <Text style={{ color: '#dc2626', fontSize: 12, flex: 1 }}>Số dư ví không đủ để tất toán</Text>
                        </View>
                    )}
                </View>

                {/* ── Summary ── */}
                <View style={[s.summaryCard, { backgroundColor: C.primary + '08' }]}>
                    <View style={s.summaryRow}>
                        <Text style={[s.summaryLabel, { color: C.textSecondary }]}>Tổng tất toán</Text>
                        <Text style={[s.summaryValue, { color: C.primary, fontWeight: '700', fontSize: 16 }]}>{fmt(totalAmount)} đ</Text>
                    </View>
                    <View style={s.summaryRow}>
                        <Text style={[s.summaryLabel, { color: C.textSecondary }]}>Nguồn</Text>
                        <Text style={[s.summaryValue, { color: C.textPrimary }]}>{selectedWallet?.productName || 'Ví điện tử'}</Text>
                    </View>
                    <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 4 }]}>
                        <Text style={[s.summaryLabel, { color: C.textPrimary, fontWeight: '700' }]}>Số dư sau giao dịch</Text>
                        <Text style={[s.summaryValue, { color: totalAmount > walletBalance ? '#dc2626' : C.primary, fontWeight: '700' }]}>
                            {formatCurrency(Math.max(0, walletBalance - totalAmount))}
                        </Text>
                    </View>
                </View>

                {/* ── Submit with OTP ── */}
                <View style={{ paddingVertical: 16 }}>
                    <OTPProtectedAction
                        actionType={OtpActionType.PREPAY}
                        actionData={{ loanId, amount: totalAmount }}
                        onExecute={handlePrepay}
                        requireOTP
                        title="Xác thực tất toán"
                        description="Nhập mã OTP để xác nhận tất toán sớm"
                    >
                        {({ trigger, isLoading: otpLoading, isInitialized }) => {
                            otpTriggerRef.current = trigger;
                            const disabled = submitting || otpLoading || !isInitialized || !selectedWallet || isInsufficient;
                            return (
                                <TouchableOpacity
                                    style={[s.submitBtn, { backgroundColor: disabled ? C.border : '#dc2626' }]}
                                    onPress={() => setShowPinVerify(true)}
                                    disabled={disabled}
                                    activeOpacity={0.85}
                                >
                                    {submitting || otpLoading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <MaterialCommunityIcons name="cash-check" size={20} color="#fff" />
                                            <Text style={s.submitBtnText}>Tất toán {fmt(totalAmount)} đ</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            );
                        }}
                    </OTPProtectedAction>
                </View>

                <View style={{ height: insets.bottom + 30 }} />
            </ScrollView>

            <WalletSelectorModal
                visible={showWalletModal}
                onClose={() => setShowWalletModal(false)}
                wallets={wallets}
                selectedWalletId={selectedWallet?.id ?? selectedWallet?._id}
                onSelect={setSelectedWallet}
                title="Chọn ví thanh toán"
            />

            <PinVerifyModal
                visible={showPinVerify}
                dismissable
                onCancel={() => setShowPinVerify(false)}
                onSuccess={() => { setShowPinVerify(false); setTimeout(() => otpTriggerRef.current?.(), 300); }}
                title="Xác thực mã PIN"
                subtitle="Nhập mã PIN để tiếp tục tất toán"
            />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, gap: 16 },
    card: { borderRadius: 16, padding: 20 },
    warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12 },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 14 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    infoLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
    infoValue: { fontSize: 13, fontWeight: '600' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 8, borderTopWidth: 1 },
    totalLabel: { fontSize: 14, fontWeight: '700' },
    totalValue: { fontSize: 16, fontWeight: '800' },
    walletSelect: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5 },
    walletIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    walletName: { fontSize: 14, fontWeight: '700' },
    walletBalance: { fontSize: 12, marginTop: 2 },
    insufficientBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, marginTop: 10 },
    summaryCard: { borderRadius: 16, padding: 20 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    summaryLabel: { fontSize: 13, fontWeight: '500' },
    summaryValue: { fontSize: 13, fontWeight: '600' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 100 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
