import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletApi, loanApi } from '../../services';
import { GradientBackground, GlassCard, GlassButton, GlassTokens, InfoRow, SectionTitle } from '../../components/glass';
import { PageHeader } from '../../components/common';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

type TransferMode = 'transfer' | 'repayment' | 'prepay';

interface TransferScreenProps {
    navigation: any;
    route: any;
}

export const TransferScreen: React.FC<TransferScreenProps> = ({ navigation, route }) => {
    const params = route.params || {};
    const mode: TransferMode = params.mode || 'transfer';
    const balance = params.balance ?? 0;
    const loanCode = params.loanCode || '';
    const fineractLoanId = params.fineractLoanId;

    // Initial state from params
    const [recipientPhone, setRecipientPhone] = useState(params.recipientPhone || '');
    const [amount, setAmount] = useState(params.amount ? String(params.amount) : '');
    const [note, setNote] = useState(params.note || '');
    const [loading, setLoading] = useState(false);

    // Determine titles and labels based on mode
    const getScreenTitle = () => {
        switch (mode) {
            case 'repayment': return 'THANH TOÁN KHOẢN VAY';
            case 'prepay': return 'TẤT TOÁN KHOẢN VAY';
            default: return 'CHUYỂN TIỀN';
        }
    };

    const getButtonTitle = () => {
        switch (mode) {
            case 'repayment': return 'THANH TOÁN';
            case 'prepay': return 'TẤT TOÁN';
            default: return 'CHUYỂN TIỀN';
        }
    };

    const isLoanPayment = mode === 'repayment' || mode === 'prepay';

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    };

    const handleTransfer = async () => {
        // Validation
        if (!isLoanPayment) {
            if (!recipientPhone.trim()) {
                Alert.alert('Lỗi', 'Vui lòng nhập số điện thoại người nhận');
                return;
            }
            if (recipientPhone.replace(/\D/g, '').length !== 10) {
                Alert.alert('Lỗi', 'Số điện thoại phải có 10 chữ số');
                return;
            }
        }

        const transferAmount = parseFloat(amount.replace(/,/g, ''));
        if (!amount || isNaN(transferAmount) || transferAmount <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }

        if (transferAmount > balance) {
            Alert.alert('Lỗi', `Số dư không đủ. Số dư hiện tại: ${balance.toLocaleString('vi-VN')} VND`);
            return;
        }

        // Confirmation Message
        let confirmTitle = 'Xác nhận giao dịch';
        let confirmMessage = '';

        if (mode === 'transfer') {
            confirmTitle = 'Xác nhận chuyển tiền';
            confirmMessage = `Chuyển ${transferAmount.toLocaleString('vi-VN')} VND đến ${recipientPhone}?`;
        } else if (mode === 'repayment') {
            confirmTitle = 'Xác nhận thanh toán';
            confirmMessage = `Thanh toán ${transferAmount.toLocaleString('vi-VN')} VND cho khoản vay ${loanCode}?`;
        } else if (mode === 'prepay') {
            confirmTitle = 'Xác nhận tất toán';
            confirmMessage = `Tất toán khoản vay ${loanCode} với số tiền ${transferAmount.toLocaleString('vi-VN')} VND?`;
        }

        Alert.alert(
            confirmTitle,
            confirmMessage,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xác nhận',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            let result: any;

                            if (mode === 'transfer') {
                                result = await walletApi.transfer(recipientPhone, transferAmount, note);
                            } else if (mode === 'repayment') {
                                if (!fineractLoanId) throw new Error('Missing Fineract Loan ID');
                                result = await loanApi.makeRepayment({
                                    loanId: fineractLoanId, // Server expects 'loanId' not 'fineractLoanId'
                                    amount: transferAmount, // Server expects 'amount' not 'transactionAmount'
                                    note: note || 'Repayment via P2P App'
                                });
                            } else if (mode === 'prepay') {
                                if (!fineractLoanId) throw new Error('Missing Fineract Loan ID');
                                result = await loanApi.prepayLoan({
                                    loanId: fineractLoanId, // Server expects 'loanId' not 'fineractLoanId'
                                    transactionAmount: transferAmount,
                                    note: note || 'Prepay via P2P App'
                                });
                            }

                            const message = result?.message || (result?.resourceId ? 'Giao dịch thành công' : 'Đã xử lý');

                            Alert.alert('Thành công', message, [
                                { text: 'OK', onPress: () => navigation.goBack() },
                            ]);
                        } catch (error: any) {
                            Alert.alert('Lỗi', error.message || 'Giao dịch thất bại');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <GradientBackground>
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={GlassTokens.colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>{getScreenTitle()}</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Balance Card */}
                    <GlassCard variant="primary" blur={GlassTokens.blur.medium} style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
                            <Text style={styles.balanceAmount}>{balance.toLocaleString('vi-VN')}</Text>
                            <Text style={styles.balanceUnit}>VND</Text>
                        </View>
                    </GlassCard>

                    {/* Form */}
                    <GlassCard blur={GlassTokens.blur.light} style={styles.formCard}>

                        {/* Info for Loan Payment */}
                        {isLoanPayment && (
                            <View style={styles.loanInfoContainer}>
                                <InfoRow label="Mã hợp đồng" value={loanCode} />
                                <View style={styles.divider} />
                            </View>
                        )}

                        {/* Recipient (Only for Transfer) */}
                        {!isLoanPayment && (
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>SỐ ĐIỆN THOẠI NGƯỜI NHẬN</Text>
                                <View style={styles.inputContainer}>
                                    <Ionicons name="person-outline" size={20} color={GlassTokens.colors.primary} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Nhập số điện thoại"
                                        placeholderTextColor={GlassTokens.colors.textMuted}
                                        value={recipientPhone}
                                        onChangeText={setRecipientPhone}
                                        keyboardType="phone-pad"
                                        maxLength={10}
                                    />
                                </View>
                            </View>
                        )}

                        {/* Amount */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>SỐ TIỀN</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="cash-outline" size={20} color={GlassTokens.colors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập số tiền"
                                    placeholderTextColor={GlassTokens.colors.textMuted}
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="numeric"
                                    editable={!params.readOnlyAmount}
                                />
                                <Text style={styles.currency}>VND</Text>
                            </View>
                        </View>

                        {/* Quick Amount - Hide if readOnly */}
                        {!params.readOnlyAmount && (
                            <View style={styles.quickAmountContainer}>
                                {[50000, 100000, 500000, 1000000].map((quickAmount) => (
                                    <TouchableOpacity
                                        key={quickAmount}
                                        style={styles.quickAmountButton}
                                        onPress={() => setAmount(String(quickAmount))}
                                    >
                                        <Text style={styles.quickAmountText}>
                                            {(quickAmount / 1000).toLocaleString('vi-VN')}K
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Note */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>GHI CHÚ (TÙY CHỌN)</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="create-outline" size={20} color={GlassTokens.colors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập ghi chú giao dịch"
                                    placeholderTextColor={GlassTokens.colors.textMuted}
                                    value={note}
                                    onChangeText={setNote}
                                    multiline
                                />
                            </View>
                        </View>
                    </GlassCard>

                    {/* Action Button */}
                    <GlassButton
                        title={getButtonTitle()}
                        icon={isLoanPayment ? "check-circle-outline" : "arrow-right-circle"}
                        onPress={handleTransfer}
                        loading={loading}
                        variant={mode === 'prepay' ? 'error' : 'primary'}
                        style={styles.transferButton}
                    />
                </ScrollView>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 20,
        paddingHorizontal: UnifiedSpacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: UnifiedSpacing.lg,
        paddingTop: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: 1,
        fontFamily: 'Poppins_700Bold',
    },
    balanceCard: {
        marginBottom: UnifiedSpacing.lg,
        alignItems: 'center',
        paddingVertical: UnifiedSpacing.xl,
    },
    balanceLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
        marginBottom: 8,
        fontFamily: 'Poppins_600SemiBold',
    },
    balanceAmount: {
        color: GlassTokens.colors.textPrimary,
        fontSize: 36,
        fontWeight: '800',
        fontFamily: 'Poppins_700Bold',
        marginRight: 8,
    },
    balanceUnit: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    formCard: {
        marginBottom: UnifiedSpacing.lg,
    },
    loanInfoContainer: {
        marginBottom: 16,
    },
    divider: {
        height: 1,
        backgroundColor: GlassTokens.colors.borderGlassSubtle,
        marginVertical: 12,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: GlassTokens.colors.textSecondary,
        marginBottom: 8,
        letterSpacing: 1.5,
        fontFamily: 'Poppins_700Bold',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: GlassTokens.colors.primary,
        paddingBottom: 8,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: GlassTokens.colors.textPrimary,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        paddingVertical: 4,
    },
    currency: {
        fontSize: 14,
        color: GlassTokens.colors.textMuted,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
    },
    quickAmountContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 8,
    },
    quickAmountButton: {
        flex: 1,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: UnifiedRadius.sm,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    quickAmountText: {
        fontSize: 13,
        fontWeight: '600',
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    transferButton: {
        marginTop: UnifiedSpacing.sm,
    },
});
