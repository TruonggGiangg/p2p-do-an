/**
 * RepaymentConfirmScreen — Xác nhận thanh toán kỳ hạn
 * Bank-grade UI: wallet selection, period detail, PIN + OTP, success navigation
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, StatusBar, TextInput,
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

type Nav = NativeStackNavigationProp<RootStackParamList, 'RepaymentConfirm'>;

const fmt = (n: number) => n?.toLocaleString('vi-VN') ?? '0';

export default function RepaymentConfirmScreen() {
    const { theme } = useTheme();
    const C = theme.colors;
    const route = useRoute();
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const params = (route.params || {}) as {
        loanId: string;
        loan: any;
        outstanding: any;
        nextPeriod: any;
        suggestedAmount: number;
    };
    const { loanId, loan, outstanding, nextPeriod, suggestedAmount } = params;

    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [rawAmount, setRawAmount] = useState(suggestedAmount ?? 0);
    const amount = rawAmount > 0 ? rawAmount.toLocaleString('vi-VN') : '';
    const setAmount = (text: string) => {
        const digits = text.replace(/[^0-9]/g, '');
        setRawAmount(digits ? parseInt(digits, 10) : 0);
    };
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showPinVerify, setShowPinVerify] = useState(false);
    const otpTriggerRef = useRef<(() => void) | null>(null);

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

    const handleRepay = useCallback(async (payload?: { otpSessionId?: string }) => {
        const numAmount = rawAmount;
        if (!numAmount || numAmount <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }
        if (!selectedWallet) {
            Alert.alert('Lỗi', 'Vui lòng chọn ví thanh toán');
            return;
        }

        setSubmitting(true);
        try {
            const result = await loanService.makeRepayment(
                loanId,
                numAmount,
                new Date().toISOString().split('T')[0],
            );
            const data = (result as any)?.data || result;
            if (data?.success) {
                navigation.replace('RepaymentSuccess', {
                    amount: numAmount,
                    transactionId: data.transactionId,
                    date: data.date || new Date().toISOString().split('T')[0],
                    loanId,
                    periodNumber: nextPeriod?.period,
                    loanStatus: data.loanStatus,
                    capitalOriginal: loan?.capital,
                    remainingBalance: outstanding ? outstanding.totalOutstanding - numAmount : undefined,
                });
            } else {
                throw new Error(data?.message || 'Trả nợ thất bại');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể trả nợ';
            Alert.alert('Lỗi thanh toán', msg);
        } finally {
            setSubmitting(false);
        }
    }, [rawAmount, selectedWallet, loanId, loan, outstanding, nextPeriod, navigation]);

    const walletBalance = selectedWallet?.balance ?? 0;
    const numericAmount = rawAmount;
    const isInsufficient = numericAmount > 0 && walletBalance > 0 && numericAmount > walletBalance;

    return (
        <View style={[s.container, { backgroundColor: C.background }]}>
            <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
            <BinanceHeader title="Thanh toán kỳ hạn" mode="standard" />

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Loan Summary ── */}
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
                        <Text style={[s.infoLabel, { color: C.textSecondary }]}>Dư nợ còn lại</Text>
                        <Text style={[s.infoValue, { color: C.primary, fontWeight: '700' }]}>{formatCurrency(outstanding?.totalOutstanding)}</Text>
                    </View>
                </View>

                {/* ── Period Detail ── */}
                {nextPeriod && (
                    <View style={[s.card, { backgroundColor: C.surface }]}>
                        <Text style={[s.sectionTitle, { color: C.textSecondary }]}>CHI TIẾT KỲ THANH TOÁN #{nextPeriod.period}</Text>
                        <View style={s.infoRow}>
                            <Text style={[s.infoLabel, { color: C.textSecondary }]}>Ngày đến hạn</Text>
                            <Text style={[s.infoValue, { color: C.textPrimary }]}>{nextPeriod.dueDate ? (Array.isArray(nextPeriod.dueDate) ? `${nextPeriod.dueDate[2]}/${nextPeriod.dueDate[1]}/${nextPeriod.dueDate[0]}` : nextPeriod.dueDate) : '---'}</Text>
                        </View>
                        <View style={s.infoRow}>
                            <Text style={[s.infoLabel, { color: C.textSecondary }]}>Gốc</Text>
                            <Text style={[s.infoValue, { color: C.textPrimary }]}>{fmt(nextPeriod.principalDue || 0)} đ</Text>
                        </View>
                        <View style={s.infoRow}>
                            <Text style={[s.infoLabel, { color: C.textSecondary }]}>Lãi</Text>
                            <Text style={[s.infoValue, { color: C.textPrimary }]}>{fmt(nextPeriod.interestDue || 0)} đ</Text>
                        </View>
                        {(nextPeriod.feeChargesDue || 0) > 0 && (
                            <View style={s.infoRow}>
                                <Text style={[s.infoLabel, { color: C.textSecondary }]}>Phí</Text>
                                <Text style={[s.infoValue, { color: C.textPrimary }]}>{fmt(nextPeriod.feeChargesDue)} đ</Text>
                            </View>
                        )}
                        {(nextPeriod.penaltyChargesDue || 0) > 0 && (
                            <View style={s.infoRow}>
                                <Text style={[s.infoLabel, { color: C.textSecondary }]}>Phạt quá hạn</Text>
                                <Text style={[s.infoValue, { color: '#dc2626', fontWeight: '700' }]}>{fmt(nextPeriod.penaltyChargesDue)} đ</Text>
                            </View>
                        )}
                        <View style={[s.totalRow, { borderTopColor: C.border }]}>
                            <Text style={[s.totalLabel, { color: C.textPrimary }]}>Tổng kỳ này</Text>
                            <Text style={[s.totalValue, { color: C.primary }]}>{fmt(nextPeriod.totalDue || nextPeriod.totalOutstanding || 0)} đ</Text>
                        </View>
                    </View>
                )}

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
                            <Text style={{ color: '#dc2626', fontSize: 12, flex: 1 }}>Số dư ví không đủ</Text>
                        </View>
                    )}
                </View>

                {/* ── Amount Input ── */}
                <View style={[s.card, { backgroundColor: C.surface }]}>
                    <Text style={[s.sectionTitle, { color: C.textSecondary }]}>SỐ TIỀN THANH TOÁN</Text>
                    <View style={[s.amountInputWrap, { borderColor: C.primary, backgroundColor: C.background }]}>
                        <TextInput
                            style={[s.amountInput, { color: C.textPrimary }]}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="number-pad"
                            placeholder="Nhập số tiền"
                            placeholderTextColor={C.textSecondary}
                        />
                        <Text style={[s.currency, { color: C.textSecondary }]}>đ</Text>
                    </View>

                    {/* Quick chips */}
                    <View style={s.chipRow}>
                        {nextPeriod && (
                            <TouchableOpacity style={[s.chip, { backgroundColor: C.primary + '15' }]} onPress={() => setRawAmount(nextPeriod.totalDue || nextPeriod.totalOutstanding || 0)}>
                                <Text style={[s.chipText, { color: C.primary }]}>1 Kỳ hạn</Text>
                            </TouchableOpacity>
                        )}
                        {outstanding && (
                            <TouchableOpacity style={[s.chip, { backgroundColor: C.primary + '15' }]} onPress={() => setRawAmount(outstanding.totalOutstanding || 0)}>
                                <Text style={[s.chipText, { color: C.primary }]}>Toàn bộ nợ</Text>
                            </TouchableOpacity>
                        )}
                        {outstanding && (outstanding.totalOverdue || 0) > 0 && (
                            <TouchableOpacity style={[s.chip, { backgroundColor: '#dc262615' }]} onPress={() => setRawAmount(outstanding.totalOverdue || 0)}>
                                <Text style={[s.chipText, { color: '#dc2626' }]}>Nợ quá hạn</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* ── Summary ── */}
                <View style={[s.summaryCard, { backgroundColor: C.primary + '08' }]}>
                    <View style={s.summaryRow}>
                        <Text style={[s.summaryLabel, { color: C.textSecondary }]}>Thanh toán</Text>
                        <Text style={[s.summaryValue, { color: C.textPrimary }]}>{formatCurrency(numericAmount)}</Text>
                    </View>
                    <View style={s.summaryRow}>
                        <Text style={[s.summaryLabel, { color: C.textSecondary }]}>Nguồn</Text>
                        <Text style={[s.summaryValue, { color: C.textPrimary }]}>{selectedWallet?.productName || 'Ví điện tử'}</Text>
                    </View>
                    <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 4 }]}>
                        <Text style={[s.summaryLabel, { color: C.textPrimary, fontWeight: '700' }]}>Số dư sau giao dịch</Text>
                        <Text style={[s.summaryValue, { color: numericAmount > walletBalance ? '#dc2626' : C.primary, fontWeight: '700' }]}>
                            {formatCurrency(Math.max(0, walletBalance - numericAmount))}
                        </Text>
                    </View>
                </View>

                {/* ── Submit with OTP ── */}
                <View style={{ paddingVertical: 16 }}>
                    <OTPProtectedAction
                        actionType={OtpActionType.REPAYMENT}
                        actionData={{ loanId, amount: numericAmount }}
                        onExecute={handleRepay}
                        requireOTP
                        title="Xác thực thanh toán"
                        description="Nhập mã OTP để xác nhận thanh toán kỳ hạn"
                    >
                        {({ trigger, isLoading: otpLoading, isInitialized }) => {
                            otpTriggerRef.current = trigger;
                            const disabled = submitting || otpLoading || !isInitialized || !numericAmount || !selectedWallet || isInsufficient;
                            return (
                                <TouchableOpacity
                                    style={[s.submitBtn, { backgroundColor: disabled ? (C.border) : C.primary }]}
                                    onPress={() => setShowPinVerify(true)}
                                    disabled={disabled}
                                    activeOpacity={0.85}
                                >
                                    {submitting || otpLoading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <MaterialCommunityIcons name="shield-check-outline" size={20} color="#fff" />
                                            <Text style={s.submitBtnText}>Thanh toán {formatCurrency(numericAmount)}</Text>
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
                subtitle="Nhập mã PIN để tiếp tục thanh toán"
            />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, gap: 16 },
    card: { borderRadius: 16, padding: 20 },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 14 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    infoLabel: { fontSize: 13, fontWeight: '500' },
    infoValue: { fontSize: 13, fontWeight: '600' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 8, borderTopWidth: 1 },
    totalLabel: { fontSize: 14, fontWeight: '700' },
    totalValue: { fontSize: 16, fontWeight: '800' },
    walletSelect: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5 },
    walletIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    walletName: { fontSize: 14, fontWeight: '700' },
    walletBalance: { fontSize: 12, marginTop: 2 },
    insufficientBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, marginTop: 10 },
    amountInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 16, height: 52 },
    amountInput: { flex: 1, fontSize: 18, fontWeight: '700' },
    currency: { fontSize: 16, fontWeight: '600' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    chipText: { fontSize: 12, fontWeight: '700' },
    summaryCard: { borderRadius: 16, padding: 20 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    summaryLabel: { fontSize: 13, fontWeight: '500' },
    summaryValue: { fontSize: 13, fontWeight: '600' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 100 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
