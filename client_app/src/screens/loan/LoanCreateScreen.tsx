/**
 * LoanCreateScreen - Consistent Glassmorphism UI
 * Preserves all credit scoring logic
 */

import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { loanApi } from '../../services';
import {
    CheckRateRequest,
    CreateLoanRequest,
    RateCheckResponse,
    LOAN_WILLINGS,
    LOAN_PERIODS,
} from '../../types';
import { GlassInput, GlassPicker, GlassDatePicker } from '../../components/common';
import { GlowButton } from '../../components/glow';
import { CreditScoreBadge } from '../../components/CreditScoreBadge';
import { CreditRejectionModal } from '../../components/CreditRejectionModal';
import { GradientBackground, GlassCard, InfoRow, SectionTitle, GlassTokens, GlassButton } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

// Format helpers
const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const parseNumber = (str: string): number => parseInt(str.replace(/,/g, ''), 10) || 0;
const formatDate = (date: Date): string => date.toISOString().split('T')[0];

export default function LoanCreateScreen({ navigation }: any) {
    // Hide navigation header
    useLayoutEffect(() => {
        navigation.setOptions({
            headerShown: false,
        });
    }, [navigation]);

    // Form state
    const [capital, setCapital] = useState<string>('10,000,000');
    const [periodMonth, setPeriodMonth] = useState<number>(12);
    const [willing, setWilling] = useState<string>(LOAN_WILLINGS[0]);

    // Set default disbursement date to tomorrow
    const getTomorrowDate = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    };
    const [disbursementDate] = useState<Date>(getTomorrowDate());

    // Rate preview
    const [ratePreview, setRatePreview] = useState<RateCheckResponse | null>(null);
    const [loadingRate, setLoadingRate] = useState(false);

    // Submission
    const [submitting, setSubmitting] = useState(false);

    // Credit rejection
    const [rejectionVisible, setRejectionVisible] = useState(false);
    const [rejectionData, setRejectionData] = useState<any>(null);

    const handleCheckRate = useCallback(async () => {
        const capitalValue = parseNumber(capital);
        if (!capitalValue || capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay tối thiểu là 1,000,000 đ');
            return;
        }

        try {
            setLoadingRate(true);
            const request: CheckRateRequest = {
                capital: capitalValue,
                periodMonth,
                disbursementDate: formatDate(disbursementDate),
            };
            const result = await loanApi.checkRate(request);
            setRatePreview(result);

            // Debug logging
            console.log('========== RATE CALCULATION DEBUG ==========');
            console.log('Input:', { capital: capitalValue, periodMonth, disbursementDate: formatDate(disbursementDate) });
            console.log('Result:', JSON.stringify(result, null, 2));
            console.log('Monthly Rate:', result.rate + '%');
            console.log('Annual Rate:', result.annualRate + '%');
            console.log('Monthly Principal:', formatNumber(result.monthlyPrincipalPay));
            console.log('Monthly Interest:', formatNumber(result.monthlyInterestPay));
            console.log('Monthly Total:', formatNumber(result.monthlyPay));
            console.log('Total Payment:', formatNumber(result.entirelyPay));
            console.log('Interest Type:', result.interestType);
            console.log('==========================================');
        } catch (error: any) {
            Alert.alert('Lỗi', error.message || 'Không thể kiểm tra lãi suất');
        } finally {
            setLoadingRate(false);
        }
    }, [capital, periodMonth, disbursementDate]);

    const handleSubmit = useCallback(async () => {
        const capitalValue = parseNumber(capital);
        if (!capitalValue || capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay tối thiểu là 1,000,000 đ');
            return;
        }

        try {
            setSubmitting(true);
            const request: CreateLoanRequest = {
                capital: capitalValue,
                periodMonth,
                willing,
                disbursementDate: formatDate(disbursementDate),
            };

            const result = await loanApi.createLoan(request);

            // Type guard - check if result has credit data
            const creditInfo = result as any;
            const creditScore = creditInfo.creditScore || 'N/A';
            const creditGrade = creditInfo.creditGrade || 'N/A';
            const annualRate = creditInfo.annualRate || 'N/A';

            Alert.alert(
                'Thành công!',
                `Khoản vay đã được tạo\nĐiểm tín dụng: ${creditScore}\nXếp hạng: ${creditGrade}\nLãi suất: ${annualRate}%/năm`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error: any) {
            if (error.status === 400 && error.data?.creditScore) {
                setRejectionData(error.data);
                setRejectionVisible(true);
            } else {
                Alert.alert('Lỗi', error.message || 'Không thể tạo khoản vay');
            }
        } finally {
            setSubmitting(false);
        }
    }, [capital, periodMonth, willing, disbursementDate, navigation]);

    const capitalValue = parseNumber(capital);
    const periodItems = [...LOAN_PERIODS]; // Create mutable copy
    const willingItems = LOAN_WILLINGS.map(w => ({ label: w, value: w }));

    return (
        <GradientBackground>
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={GlassTokens.colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Tạo Khoản Vay</Text>
                    <Text style={styles.subtitle}>Điền thông tin để tạo khoản vay mới</Text>
                </View>

                {/* Form Card */}
                <GlassCard blur={GlassTokens.blur.medium}>
                    <SectionTitle>Thông tin khoản vay</SectionTitle>

                    <GlassInput
                        label="Số tiền vay"
                        value={capital}
                        onChangeText={(val) => {
                            const num = parseNumber(val);
                            setCapital(formatNumber(num));
                        }}
                        keyboardType="numeric"
                        placeholder="10,000,000"
                        rightText="₫"
                    />

                    <GlassPicker
                        label="Kỳ hạn"
                        selectedValue={periodMonth}
                        onValueChange={(val) => setPeriodMonth(Number(val))}
                        items={periodItems}
                    />

                    <GlassPicker
                        label="Mục đích vay"
                        selectedValue={willing}
                        onValueChange={(val) => setWilling(val as string)}
                        items={willingItems}
                    />

                    <TouchableOpacity onPress={handleCheckRate} disabled={loadingRate}>
                        <View style={styles.checkRateBtn}>
                            <Text style={styles.checkRateText}>
                                {loadingRate ? 'Đang tính...' : 'XEM LÃI SUẤT'}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </GlassCard>

                {/* Credit Preview */}
                {ratePreview && (
                    <GlassCard variant="primary" blur={GlassTokens.blur.medium}>
                        <View style={styles.creditHeader}>
                            <Ionicons name="shield-checkmark" size={24} color={GlassTokens.colors.primary} />
                            <Text style={styles.creditTitle}>Thông tin tín dụng</Text>
                        </View>
                        <Text style={styles.noteText}>
                            ✨ Lãi suất đã tính toán dựa trên điểm tín dụng
                        </Text>
                    </GlassCard>
                )}

                {/* Rate Result */}
                {ratePreview && (
                    <GlassCard variant="success" blur={GlassTokens.blur.medium}>
                        <View style={styles.resultHeader}>
                            <Ionicons name="calculator-outline" size={24} color={GlassTokens.colors.success} />
                            <Text style={styles.resultTitle}>Kết quả dự tính</Text>
                        </View>

                        <InfoRow label="Lãi suất tháng" value={`${ratePreview.rate.toFixed(5)}%`} accent />
                        <InfoRow label="Lãi suất năm" value={`${ratePreview.annualRate.toFixed(5)}%`} accent />
                        <InfoRow label="Loại lãi" value={ratePreview.interestType} />

                        <View style={styles.divider} />

                        <InfoRow label="Gốc hàng tháng" value={`${formatNumber(ratePreview.monthlyPrincipalPay)} đ`} />
                        <InfoRow label="Lãi hàng tháng" value={`${formatNumber(ratePreview.monthlyInterestPay)} đ`} />

                        <View style={styles.divider} />

                        <InfoRow label="Trả hàng tháng" value={`${formatNumber(ratePreview.monthlyPay)} đ`} accent />

                        <View style={styles.highlight}>
                            <Text style={styles.highlightLabel}>Tổng thanh toán</Text>
                            <Text style={styles.highlightValue}>{formatNumber(ratePreview.entirelyPay)} đ</Text>
                        </View>
                    </GlassCard>
                )}

                {/* Submit Button */}
                <GlassButton
                    title="TẠO KHOẢN VAY"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={!ratePreview || submitting}
                    icon="check-circle"
                    variant="primary"
                    style={styles.submitBtn}
                />

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Credit Rejection Modal */}
            {rejectionData && (
                <CreditRejectionModal
                    visible={rejectionVisible}
                    onClose={() => setRejectionVisible(false)}
                    creditData={rejectionData}
                />
            )}
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: UnifiedSpacing.md,
    },
    header: {
        paddingTop: UnifiedSpacing.xl,
        paddingBottom: UnifiedSpacing.xxl,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: UnifiedSpacing.md,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginBottom: UnifiedSpacing.xs,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: GlassTokens.colors.textSecondary,
        letterSpacing: 0.1,
    },

    checkRateBtn: {
        marginTop: UnifiedSpacing.md,
        paddingVertical: 14,
        backgroundColor: `${GlassTokens.colors.primaryGlass}80`,
        borderRadius: UnifiedRadius.sm,
        borderWidth: 1,
        borderColor: GlassTokens.colors.primaryBorder,
        alignItems: 'center',
    },
    checkRateText: {
        fontSize: 14,
        fontWeight: '600',
        color: GlassTokens.colors.primary,
        letterSpacing: 0.5,
    },

    creditHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: GlassTokens.spacing.sm,
    },
    creditTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginLeft: GlassTokens.spacing.sm,
    },
    noteText: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontStyle: 'italic',
    },

    resultHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: GlassTokens.spacing.md,
    },
    resultTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginLeft: GlassTokens.spacing.sm,
    },

    divider: {
        height: 1,
        backgroundColor: GlassTokens.colors.borderGlassSubtle,
        marginVertical: GlassTokens.spacing.sm,
    },

    highlight: {
        backgroundColor: `${GlassTokens.colors.successGlass}80`,
        borderRadius: GlassTokens.radius.sm,
        padding: GlassTokens.spacing.md,
        marginTop: GlassTokens.spacing.sm,
        borderWidth: 1,
        borderColor: GlassTokens.colors.successBorder,
    },
    highlightLabel: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 4,
    },
    highlightValue: {
        fontSize: 24,
        fontWeight: '700',
        color: GlassTokens.colors.success,
        letterSpacing: 0.5,
    },

    submitBtn: {
        marginTop: GlassTokens.spacing.lg,
    },
});
