/**
 * LoanCreateScreen - Màn hình tạo khoản vay (Borrower)
 * Refactored with Common Components & Glassmorphism Style
 */

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { loanApi } from '../../services';
import {
    CheckRateRequest,
    CreateLoanRequest,
    RateCheckResponse,
    LOAN_WILLINGS,
    LOAN_PERIODS,
} from '../../types';
import { DarkColors, DarkStyling } from '../../theme';
import {
    ScreenContainer,
    PageHeader,
    GlassInput,
    GlassPicker,
    GlassDatePicker,
    InfoRow
} from '../../components/common';
import { GlowButton } from '../../components/glow';

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
                                `Khoản vay ${result.contractId} đã được tạo.\nLãi suất: ${result.info.rate}%/tháng\nTổng trả: ${formatNumber(result.info.entirelyPay ?? 0)} VND`,
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

    const loanPeriodItems = LOAN_PERIODS.map(p => ({ label: p.label, value: p.value }));
    const willingItems = LOAN_WILLINGS.map(w => ({ label: w, value: w }));

    return (
        <ScreenContainer scrollable>
            <PageHeader title="Tạo Khoản Vay" subtitle="Điền thông tin để bắt đầu" />

            <View style={styles.content}>
                {/* Form Card */}
                <BlurView intensity={20} tint="dark" style={styles.glassCard}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                        style={styles.cardGradient}
                    >
                        <GlassInput
                            label="Số tiền vay (VND)"
                            value={capital}
                            onChangeText={handleCapitalChange}
                            keyboardType="numeric"
                            placeholder="Nhập số tiền"
                            icon="cash-outline"
                            error={parseNumber(capital) > 0 && parseNumber(capital) < 1000000 ? "Tối thiểu 1,000,000 VND" : undefined}
                        />

                        <GlassPicker
                            label="Kỳ hạn vay"
                            selectedValue={periodMonth}
                            onValueChange={(val) => {
                                setPeriodMonth(val);
                                setRatePreview(null);
                            }}
                            items={loanPeriodItems}
                        />

                        <GlassPicker
                            label="Mục đích vay"
                            selectedValue={willing}
                            onValueChange={setWilling}
                            items={willingItems}
                        />

                        <GlassDatePicker
                            label="Ngày giải ngân dự kiến"
                            value={disbursementDate}
                            onPress={() => setShowDatePicker(true)}
                        />

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

                        <GlowButton
                            title={ratePreview ? "TÍNH TOÁN LẠI" : "XEM LÃI SUẤT"}
                            onPress={handleCheckRate}
                            loading={loadingRate}
                            variant="glass"
                            icon="calculator"
                            style={{ marginVertical: 8 }}
                        />
                    </LinearGradient>
                </BlurView>

                {/* Preview Result */}
                {ratePreview && (
                    <BlurView intensity={30} tint="dark" style={[styles.glassCard, styles.resultCard]}>
                        <LinearGradient
                            colors={['rgba(0, 255, 136, 0.1)', 'rgba(0, 255, 136, 0.02)']}
                            style={styles.cardGradient}
                        >
                            <Text style={styles.resultTitle}>KẾT QUẢ DỰ TÍNH</Text>

                            <InfoRow label="Lãi suất tháng" value={`${ratePreview.rate}%`} icon="percent" />
                            <InfoRow label="Lãi suất năm" value={`${ratePreview.annualRate}%`} icon="chart-line" />
                            <InfoRow label="Loại lãi" value={ratePreview.interestType} icon="format-list-bulleted-type" />

                            <View style={styles.divider} />

                            <InfoRow label="Gốc hàng tháng" value={`${formatNumber(ratePreview.monthlyPrincipalPay)} đ`} />
                            <InfoRow label="Lãi hàng tháng" value={`${formatNumber(ratePreview.monthlyInterestPay)} đ`} />

                            <View style={styles.highlightRow}>
                                <Text style={styles.highlightLabel}>Trả hàng tháng</Text>
                                <Text style={styles.highlightValue}>{formatNumber(ratePreview.monthlyPay)} đ</Text>
                            </View>

                            <View style={[styles.highlightRow, { marginTop: 4 }]}>
                                <Text style={styles.highlightLabel}>Tổng thanh toán</Text>
                                <Text style={[styles.highlightValue, { color: DarkColors.primary }]}>{formatNumber(ratePreview.entirelyPay)} đ</Text>
                            </View>

                            <Text style={styles.noteText}>Nguồn lãi suất: {ratePreview.rateSource}</Text>
                        </LinearGradient>
                    </BlurView>
                )}

                {/* Submit Button */}
                <View style={styles.footer}>
                    <GlowButton
                        title="TẠO KHOẢN VAY"
                        onPress={handleSubmit}
                        loading={submitting}
                        disabled={!ratePreview || submitting}
                        icon="check-circle-outline"
                        style={{ marginTop: 24 }}
                    />
                </View>
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 20,
    },
    glassCard: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        marginBottom: 20,
    },
    cardGradient: {
        padding: 20,
    },
    resultCard: {
        borderColor: 'rgba(0, 255, 136, 0.3)',
        marginTop: 8,
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: DarkColors.success,
        textAlign: 'center',
        marginBottom: 16,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 1,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 12,
    },
    highlightRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 12,
    },
    highlightLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: DarkColors.text,
        fontFamily: 'Poppins_600SemiBold',
    },
    highlightValue: {
        fontSize: 16,
        fontWeight: '700',
        color: DarkColors.accent,
        fontFamily: 'Poppins_700Bold',
    },
    noteText: {
        fontSize: 11,
        color: DarkColors.textMuted,
        textAlign: 'center',
        marginTop: 16,
        fontStyle: 'italic',
    },
    footer: {
        marginBottom: 40,
    }
});
