/**
 * RepaymentScreen - Make loan payments
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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { loanApi } from '../../services';
import { FineractLoanDetails, OutstandingBalance } from '../../types';

// Colors
const COLORS = {
    primary: '#1E88E5',
    success: '#4CAF50',
    background: '#F5F7FA',
    card: '#FFFFFF',
    text: '#333333',
    textLight: '#666666',
    border: '#E0E0E0',
    inputBg: '#F0F2F5',
};

// Format currency
const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
    }).format(value);
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

            // Get basic details first
            const details = await loanApi.getFineractDetails(id);
            setLoanDetails(details);

            if (isPrepay) {
                // If prepayment, get calculated amount
                const prepay = await loanApi.getPrepayAmount(String(details.fineractLoanId));
                setPrepayInfo(prepay);
                setAmount(prepay.amount.toString());
            } else {
                // If regular repayment, default to next due amount or total outstanding
                const outstanding = await loanApi.getOutstandingBalance(String(details.fineractLoanId));
                // TODO: Logic to find next installment amount could be added here
                // For now just empty or suggest total outstanding
                // setAmount(outstanding.totalOutstanding.toString());
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
            const dateStr = transactionDate.toISOString().split('T')[0]; // YYYY-MM-DD

            // Format format 'dd MMMM yyyy' for Fineract is handled by backend usually, 
            // but let's send ISO/standard format and let service handle it.
            // Actually our service accepts 'dd MMMM yyyy' or ISO? Checked backend code:
            // It expects "dateFormat" and "locale" to be sent to Fineract.
            // Our backend service `makeRepayment` takes `transactionDate?: string`.

            if (isPrepay) {
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
                await loanApi.makeRepayment({
                    fineractLoanId: loanDetails.fineractLoanId,
                    transactionAmount: numAmount,
                    transactionDate: dateStr,
                    note: note,
                });
                Alert.alert('Thành công', 'Thanh toán thành công!', [
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
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>
                        {isPrepay ? 'Tất toán sớm khoản vay' : 'Thanh toán khoản vay'}
                    </Text>
                    <Text style={styles.loanId}>#{loanDetails?.fineractLoanId}</Text>
                </View>

                <View style={styles.card}>
                    {isPrepay && prepayInfo && (
                        <View style={styles.prepayInfo}>
                            <Text style={styles.label}>Chi tiết tất toán:</Text>
                            <View style={styles.row}>
                                <Text>Gốc còn lại:</Text>
                                <Text style={styles.value}>{formatCurrency(prepayInfo.principalPortion)}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text>Lãi phải trả:</Text>
                                <Text style={styles.value}>{formatCurrency(prepayInfo.interestPortion)}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text>Phí & Phạt:</Text>
                                <Text style={styles.value}>{formatCurrency(prepayInfo.feeChargesPortion + (prepayInfo.penaltyChargesPortion || 0))}</Text>
                            </View>
                            <View style={[styles.divider]} />
                        </View>
                    )}

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Số tiền thanh toán (VND)</Text>
                        <TextInput
                            style={[styles.input, styles.amountInput]}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            placeholder="0"
                            editable={!loading && !submitting} // Editable even for prepay usually, but prepay is exact
                        />
                        {isPrepay && <Text style={styles.hint}>Số tiền này được tính toán chính xác để đóng khoản vay</Text>}
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Ngày thanh toán</Text>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Text>{transactionDate.toLocaleDateString('vi-VN')}</Text>
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

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Ghi chú</Text>
                        <TextInput
                            style={[styles.input, styles.noteInput]}
                            value={note}
                            onChangeText={setNote}
                            placeholder="Nhập ghi chú giao dịch..."
                            multiline
                        />
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.disabledButton]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.submitButtonText}>Xác nhận thanh toán</Text>
                    )}
                </TouchableOpacity>

            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        padding: 16,
    },
    header: {
        marginBottom: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.text,
    },
    loanId: {
        fontSize: 14,
        color: COLORS.textLight,
        marginTop: 4,
    },
    card: {
        backgroundColor: COLORS.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    formGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        color: COLORS.textLight,
        marginBottom: 8,
        fontWeight: '600',
    },
    input: {
        backgroundColor: COLORS.inputBg,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: COLORS.text,
    },
    amountInput: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.primary,
        textAlign: 'center',
    },
    noteInput: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    dateButton: {
        backgroundColor: COLORS.inputBg,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    submitButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    disabledButton: {
        backgroundColor: COLORS.textLight,
        shadowOpacity: 0.1,
    },
    submitButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
    },
    prepayInfo: {
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    value: {
        fontWeight: '600',
        color: COLORS.text,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: 12,
    },
    hint: {
        fontSize: 12,
        color: COLORS.textLight,
        marginTop: 4,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

export default RepaymentScreen;
