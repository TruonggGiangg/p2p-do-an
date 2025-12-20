/**
 * LoanCreateScreen - Màn hình tạo khoản vay (Borrower)
 */

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

import { loanApi } from '../../services';
import {
    CheckRateRequest,
    CreateLoanRequest,
    RateCheckResponse,
    LOAN_WILLINGS,
    LOAN_PERIODS,
} from '../../types';

// Format number with commas
const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Parse formatted number
const parseNumber = (str: string): number => {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
};

// Format date to YYYY-MM-DD
const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

export default function LoanCreateScreen({ navigation }: any) {
    // Form state
    const [capital, setCapital] = useState<string>('10,000,000');
    const [periodMonth, setPeriodMonth] = useState<number>(12);
    const [willing, setWilling] = useState<string>(LOAN_WILLINGS[0]);
    const [disbursementDate, setDisbursementDate] = useState<Date>(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Rate preview
    const [ratePreview, setRatePreview] = useState<RateCheckResponse | null>(null);
    const [loadingRate, setLoadingRate] = useState(false);

    // Submit state
    const [submitting, setSubmitting] = useState(false);

    // Check rate / preview
    const handleCheckRate = useCallback(async () => {
        const capitalValue = parseNumber(capital);
        if (capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay phải từ 1,000,000 VND');
            return;
        }

        setLoadingRate(true);
        try {
            const request: CheckRateRequest = {
                capital: capitalValue,
                periodMonth,
                disbursementDate: formatDate(disbursementDate),
            };
            const result = await loanApi.checkRate(request);
            setRatePreview(result);
        } catch (error: any) {
            console.error('Check rate error:', error);
            Alert.alert('Lỗi', error.message || 'Không thể kiểm tra lãi suất');
        } finally {
            setLoadingRate(false);
        }
    }, [capital, periodMonth, disbursementDate]);

    // Submit loan
    const handleSubmit = useCallback(async () => {
        const capitalValue = parseNumber(capital);
        if (capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay phải từ 1,000,000 VND');
            return;
        }

        Alert.alert(
            'Xác nhận tạo khoản vay',
            `Số tiền: ${formatNumber(capitalValue)} VND\nKỳ hạn: ${periodMonth} tháng\nMục đích: ${willing}`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xác nhận',
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            const request: CreateLoanRequest = {
                                capital: capitalValue,
                                periodMonth,
                                willing,
                                disbursementDate: formatDate(disbursementDate),
                            };
                            const result = await loanApi.createLoan(request);
                            Alert.alert(
                                'Thành công!',
                                `Khoản vay ${result.contractId} đã được tạo.\nLãi suất: ${result.info.rate}%/tháng\nTổng trả: ${formatNumber(result.info.entirelyPay)} VND`,
                                [
                                    {
                                        text: 'OK',
                                        onPress: () => navigation.goBack(),
                                    },
                                ],
                            );
                        } catch (error: any) {
                            console.error('Create loan error:', error);
                            const message = error.response?.data?.message || error.message || 'Không thể tạo khoản vay';
                            Alert.alert('Lỗi', message);
                        } finally {
                            setSubmitting(false);
                        }
                    },
                },
            ],
        );
    }, [capital, periodMonth, willing, disbursementDate, navigation]);

    // Capital input handler
    const handleCapitalChange = (text: string) => {
        // Remove non-numeric characters
        const numericValue = text.replace(/[^0-9]/g, '');
        // Format with commas
        setCapital(formatNumber(parseInt(numericValue, 10) || 0));
        // Reset preview when capital changes
        setRatePreview(null);
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Tạo Khoản Vay Mới</Text>
                <Text style={styles.subtitle}>Điền thông tin để vay tiền</Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
                {/* Capital Input */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Số tiền vay (VND)</Text>
                    <TextInput
                        style={styles.input}
                        value={capital}
                        onChangeText={handleCapitalChange}
                        keyboardType="numeric"
                        placeholder="Nhập số tiền"
                    />
                    <Text style={styles.hint}>Tối thiểu: 1,000,000 VND</Text>
                </View>

                {/* Period Picker */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Kỳ hạn vay</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={periodMonth}
                            onValueChange={(value) => {
                                setPeriodMonth(value);
                                setRatePreview(null);
                            }}
                            style={styles.picker}
                        >
                            {LOAN_PERIODS.map((period) => (
                                <Picker.Item
                                    key={period.value}
                                    label={period.label}
                                    value={period.value}
                                />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Willing Picker */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Mục đích vay</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={willing}
                            onValueChange={setWilling}
                            style={styles.picker}
                        >
                            {LOAN_WILLINGS.map((w) => (
                                <Picker.Item key={w} label={w} value={w} />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Disbursement Date */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Ngày giải ngân</Text>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => setShowDatePicker(true)}
                    >
                        <Text style={styles.dateButtonText}>
                            {formatDate(disbursementDate)}
                        </Text>
                    </TouchableOpacity>
                </View>

                {showDatePicker && (
                    <DateTimePicker
                        value={disbursementDate}
                        mode="date"
                        display="default"
                        minimumDate={new Date()}
                        maximumDate={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)}
                        onChange={(event, date) => {
                            setShowDatePicker(false);
                            if (date) {
                                setDisbursementDate(date);
                                setRatePreview(null);
                            }
                        }}
                    />
                )}

                {/* Check Rate Button */}
                <TouchableOpacity
                    style={styles.checkRateButton}
                    onPress={handleCheckRate}
                    disabled={loadingRate}
                >
                    {loadingRate ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.checkRateButtonText}>Xem lãi suất</Text>
                    )}
                </TouchableOpacity>

                {/* Rate Preview */}
                {ratePreview && (
                    <View style={styles.previewCard}>
                        <Text style={styles.previewTitle}>Thông tin khoản vay</Text>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Lãi suất:</Text>
                            <Text style={styles.previewValue}>
                                {ratePreview.rate}%/tháng ({ratePreview.annualRate}%/năm)
                            </Text>
                        </View>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Loại lãi:</Text>
                            <Text style={styles.previewValue}>{ratePreview.interestType}</Text>
                        </View>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Gốc hàng tháng:</Text>
                            <Text style={styles.previewValue}>
                                {formatNumber(ratePreview.monthlyPrincipalPay)} VND
                            </Text>
                        </View>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Lãi hàng tháng:</Text>
                            <Text style={styles.previewValue}>
                                {formatNumber(ratePreview.monthlyInterestPay)} VND
                            </Text>
                        </View>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Tổng trả hàng tháng:</Text>
                            <Text style={[styles.previewValue, styles.highlighted]}>
                                {formatNumber(ratePreview.monthlyPay)} VND
                            </Text>
                        </View>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Tổng trả:</Text>
                            <Text style={[styles.previewValue, styles.highlighted]}>
                                {formatNumber(ratePreview.entirelyPay)} VND
                            </Text>
                        </View>

                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Ngày đáo hạn:</Text>
                            <Text style={styles.previewValue}>{ratePreview.maturityDate}</Text>
                        </View>

                        <Text style={styles.rateSource}>
                            Nguồn lãi suất: {ratePreview.rateSource}
                        </Text>
                    </View>
                )}

                {/* Submit Button */}
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        (!ratePreview || submitting) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!ratePreview || submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitButtonText}>Tạo Khoản Vay</Text>
                    )}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        backgroundColor: '#2196F3',
        padding: 20,
        paddingTop: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    subtitle: {
        fontSize: 14,
        color: '#fff',
        opacity: 0.8,
        marginTop: 4,
    },
    form: {
        padding: 16,
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    hint: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    pickerContainer: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        overflow: 'hidden',
    },
    picker: {
        height: 50,
    },
    dateButton: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 14,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    dateButtonText: {
        fontSize: 16,
        color: '#333',
    },
    checkRateButton: {
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        padding: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    checkRateButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    previewCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    previewTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 12,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    previewLabel: {
        fontSize: 14,
        color: '#666',
    },
    previewValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    highlighted: {
        color: '#2196F3',
        fontWeight: 'bold',
    },
    rateSource: {
        fontSize: 12,
        color: '#999',
        marginTop: 12,
        fontStyle: 'italic',
    },
    submitButton: {
        backgroundColor: '#2196F3',
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    submitButtonDisabled: {
        backgroundColor: '#ccc',
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
