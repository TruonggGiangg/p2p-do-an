/**
 * RepaymentScreen - Make loan payments (Dark Theme)
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ScrollView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { loanApi, repaymentApi } from '../../services';
import { FineractLoanDetails } from '../../types';
import { DarkColors, DarkStyling } from '../../theme';

// Format currency
const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('vi-VN').format(value);
};

export const RepaymentScreen: React.FC = () => {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { loanId, contractId, isPrepay } = route.params || {};

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [amount, setAmount] = useState('');
    const [transactionDate, setTransactionDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [note, setNote] = useState('');
    const [loanDetails, setLoanDetails] = useState<FineractLoanDetails | null>(null);
    const [prepayInfo, setPrepayInfo] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, [loanId, contractId]);

    const loadData = async () => {
        try {
            setLoading(true);
            const id = loanId || contractId;

            const details = await loanApi.getFineractDetails(id);
            setLoanDetails(details);

            if (isPrepay) {
                const prepay = await loanApi.getPrepayAmount(String(details.fineractLoanId));
                setPrepayInfo(prepay);
                setAmount(prepay.amount.toString());
            }
        } catch (error: any) {
            Alert.alert('Lỗi', 'Không thể tải thông tin: ' + error.message);
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setTransactionDate(selectedDate);
        }
    };

    const handleSubmit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }

        if (!loanDetails?.fineractLoanId) return;

        try {
            setSubmitting(true);
            const numAmount = parseFloat(amount.replace(/[^0-9]/g, ''));

            if (isPrepay) {
                // For prepay, still use loanApi
                const dateStr = transactionDate.toISOString().split('T')[0];
                await loanApi.prepayLoan({
                    fineractLoanId: loanDetails.fineractLoanId,
                    transactionAmount: numAmount,
                    transactionDate: dateStr,
                    note: note,
                });
                Alert.alert('Thành công', 'Tất toán khoản vay thành công!', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                // Use new repayment API that handles distribution automatically
                await repaymentApi.makeRepayment({
                    loanId: loanDetails.contractId || String(loanDetails.fineractLoanId),
                    amount: numAmount,
                });
                Alert.alert('Thành công', 'Thanh toán thành công! Số tiền đã được phân phối tới các nhà đầu tư.', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error: any) {
            Alert.alert('Lỗi thanh toán', error.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DarkColors.primary} />
                <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={[styles.headerIcon, { backgroundColor: isPrepay ? `${DarkColors.warning}20` : `${DarkColors.primary}20` }]}>
                        <MaterialCommunityIcons
                            name={isPrepay ? 'lightning-bolt' : 'cash'}
                            size={32}
                            color={isPrepay ? DarkColors.warning : DarkColors.primary}
                        />
                    </View>
                    <Text style={styles.title}>
                        {isPrepay ? 'Tất toán sớm' : 'Thanh toán'}
                    </Text>
                    <Text style={styles.loanId}>Khoản vay #{loanDetails?.fineractLoanId}</Text>
                </View>

                {/* Prepay Info Card */}
                {isPrepay && prepayInfo && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <MaterialCommunityIcons name="calculator" size={20} color={DarkColors.warning} />
                            <Text style={styles.cardTitle}>Chi tiết tất toán</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Gốc còn lại</Text>
                            <Text style={styles.detailValue}>{formatCurrency(prepayInfo.principalPortion)}₫</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Lãi phải trả</Text>
                            <Text style={styles.detailValue}>{formatCurrency(prepayInfo.interestPortion)}₫</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Phí & Phạt</Text>
                            <Text style={styles.detailValue}>{formatCurrency((prepayInfo.feeChargesPortion || 0) + (prepayInfo.penaltyChargesPortion || 0))}₫</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.detailRow}>
                            <Text style={styles.totalLabel}>Tổng cộng</Text>
                            <Text style={styles.totalValue}>{formatCurrency(prepayInfo.amount)}₫</Text>
                        </View>
                    </View>
                )}

                {/* Payment Form */}
                <View style={styles.card}>
                    {/* Amount Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Số tiền thanh toán</Text>
                        <View style={styles.amountContainer}>
                            <TextInput
                                style={styles.amountInput}
                                value={amount}
                                onChangeText={setAmount}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={DarkColors.textMuted}
                                editable={!loading && !submitting}
                            />
                            <Text style={styles.currencyLabel}>VND</Text>
                        </View>
                        {isPrepay && (
                            <Text style={styles.hint}>
                                <MaterialCommunityIcons name="information" size={14} color={DarkColors.textSecondary} />
                                {' '}Số tiền được tính toán chính xác để đóng khoản vay
                            </Text>
                        )}
                    </View>

                    {/* Date Picker */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Ngày thanh toán</Text>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <MaterialCommunityIcons name="calendar" size={20} color={DarkColors.textSecondary} />
                            <Text style={styles.dateText}>{transactionDate.toLocaleDateString('vi-VN')}</Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                            <DateTimePicker
                                value={transactionDate}
                                mode="date"
                                display="default"
                                onChange={handleDateChange}
                            />
                        )}
                    </View>

                    {/* Note Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Ghi chú</Text>
                        <TextInput
                            style={styles.noteInput}
                            value={note}
                            onChangeText={setNote}
                            placeholder="Nhập ghi chú giao dịch..."
                            placeholderTextColor={DarkColors.textMuted}
                            multiline
                        />
                    </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={
                            submitting
                                ? [DarkColors.textMuted, DarkColors.textMuted] as const
                                : isPrepay
                                    ? ['#FFA502', '#FF6348'] as const
                                    : ['#4347FF', '#6366F1'] as const
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.submitButton}
                    >
                        {submitting ? (
                            <ActivityIndicator color={DarkColors.white} />
                        ) : (
                            <>
                                <MaterialCommunityIcons name="check-circle" size={22} color={DarkColors.white} />
                                <Text style={styles.submitButtonText}>
                                    {isPrepay ? 'Xác nhận tất toán' : 'Xác nhận thanh toán'}
                                </Text>
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: DarkColors.background,
    },
    loadingText: {
        marginTop: 12,
        color: DarkColors.textSecondary,
        fontSize: 14,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    // Header
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    headerIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: DarkColors.text,
        marginBottom: 4,
    },
    loanId: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    // Card
    card: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.text,
    },
    // Detail Rows
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    detailLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '500',
        color: DarkColors.text,
    },
    divider: {
        height: 1,
        backgroundColor: DarkColors.border,
        marginVertical: 12,
    },
    totalLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
    },
    totalValue: {
        fontSize: 18,
        fontWeight: '700',
        color: DarkColors.warning,
    },
    // Form
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginBottom: 10,
        fontWeight: '500',
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    amountInput: {
        flex: 1,
        fontSize: 28,
        fontWeight: '700',
        color: DarkColors.primary,
        textAlign: 'center',
        paddingVertical: 16,
    },
    currencyLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.textSecondary,
        paddingRight: 16,
    },
    hint: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 8,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        padding: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    dateText: {
        fontSize: 15,
        color: DarkColors.text,
    },
    noteInput: {
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        padding: 14,
        fontSize: 15,
        color: DarkColors.text,
        minHeight: 80,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    // Submit Button
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        borderRadius: DarkStyling.borderRadius.md,
        gap: 10,
    },
    submitButtonText: {
        color: DarkColors.white,
        fontSize: 18,
        fontWeight: '700',
    },
});

export default RepaymentScreen;
