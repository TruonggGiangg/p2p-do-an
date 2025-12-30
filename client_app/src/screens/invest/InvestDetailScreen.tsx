import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, AvailableLoan } from '../../services/invest';
import { loanApi } from '../../services';
import { GradientBackground, GlassCard, GlassButton, GlassTokens } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

type RouteParams = {
    InvestDetail: { loan: AvailableLoan };
};

export default function InvestDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<RouteParams, 'InvestDetail'>>();
    const { loan } = route.params;

    const noteValue = 500000; // 500k VND per note
    const [numNotes, setNumNotes] = useState('1');
    const [loading, setLoading] = useState(false);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [fineractSchedule, setFineractSchedule] = useState<any>(null);

    React.useEffect(() => {
        const fetchSchedule = async () => {
            try {
                setScheduleLoading(true);
                const response = await loanApi.getFineractDetails(loan.contractId);
                console.log('[InvestDetail] Fetched schedule:', response);
                setFineractSchedule(response);
            } catch (error) {
                console.error('[InvestDetail] Failed:', error);
            } finally {
                setScheduleLoading(false);
            }
        };
        fetchSchedule();
    }, [loan.contractId]);

    const {
        monthlyPrincipal,
        monthlyLenderInterest,
        monthlyPayment,
        totalProfit,
        schedulePeriodsData
    } = React.useMemo(() => {
        const investmentAmount = parseInt(numNotes || '0') * noteValue;

        // Extract currency rounding config from Fineract response
        const inMultiplesOf = fineractSchedule?.currency?.inMultiplesOf || 1;

        const roundToCurrency = (val: number) => {
            if (inMultiplesOf > 0) {
                return Math.round(val / inMultiplesOf) * inMultiplesOf;
            }
            return Math.round(val);
        };

        const borrowerAnnualRate = fineractSchedule?.interestRate?.annual || 16;
        const adminSpread = 3;
        const lenderAnnualRate = borrowerAnnualRate - adminSpread;
        const periodMonth = loan.info.periodMonth || 6;

        // Initial estimates (rounded)
        let mPrincipal = roundToCurrency(investmentAmount / periodMonth);
        let mLenderInterest = roundToCurrency((investmentAmount * (lenderAnnualRate / 12)) / 100);
        let mPayment = mPrincipal + mLenderInterest;
        let tProfit = mLenderInterest * periodMonth;
        let sPeriodsData: any[] = [];

        if (fineractSchedule?.repaymentSchedule?.periods) {
            const periods = fineractSchedule.repaymentSchedule.periods.filter((p: any) => p.period > 0);
            // Fix: handle division by zero or missing capital
            const totalLoan = loan.info?.capital || investmentAmount || 1;
            const investmentRatio = investmentAmount / totalLoan;
            const rateRatio = lenderAnnualRate / borrowerAnnualRate;

            let accumulatedPrincipal = 0;
            sPeriodsData = periods.map((period: any, index: number) => {
                const borrowerPrincipal = period.principalDue || 0;
                const borrowerInterest = period.interestDue || 0;

                let lenderPrincipal = roundToCurrency(borrowerPrincipal * investmentRatio);

                // Adjust last period to ensure total principal equals investment amount
                if (index === periods.length - 1) {
                    const adjustment = investmentAmount - accumulatedPrincipal;
                    // Only adjust if difference is reasonable (prevent massive jumps if logic is wrong)
                    // But here we trust the logic.
                    lenderPrincipal = adjustment;
                    if (lenderPrincipal < 0) lenderPrincipal = 0;
                }
                accumulatedPrincipal += lenderPrincipal;

                const lenderInterest = roundToCurrency(borrowerInterest * rateRatio * investmentRatio);

                return {
                    period: period.period,
                    dueDate: period.dueDate,
                    principal: lenderPrincipal,
                    interest: lenderInterest,
                    total: lenderPrincipal + lenderInterest,
                };
            });

            // Re-calculate totals from rounded schedule
            const totalPrincipal = sPeriodsData.reduce((sum, p) => sum + p.principal, 0);
            tProfit = sPeriodsData.reduce((sum, p) => sum + p.interest, 0);

            if (sPeriodsData.length > 0) {
                mPrincipal = roundToCurrency(totalPrincipal / sPeriodsData.length);
                mLenderInterest = roundToCurrency(tProfit / sPeriodsData.length);
                mPayment = mPrincipal + mLenderInterest;
            }
        }

        return {
            monthlyPrincipal: mPrincipal,
            monthlyLenderInterest: mLenderInterest,
            monthlyPayment: mPayment,
            totalProfit: tProfit,
            schedulePeriodsData: sPeriodsData
        };
    }, [numNotes, fineractSchedule, loan.contractId, loan.info]);

    const investmentAmount = parseInt(numNotes || '0') * noteValue;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    React.useEffect(() => {
        if (!fineractSchedule) return;

        const investmentAmount = parseInt(numNotes || '0') * noteValue;
        const totalLoan = loan.info?.capital || investmentAmount;
        const investmentRatio = investmentAmount / totalLoan;

        const borrowerRate = fineractSchedule?.interestRate?.annual || loan.borrowerInterestRate || 16;
        const lenderRate = borrowerRate - 3;
        const rateRatio = lenderRate / borrowerRate;

        console.log(`\n=== 📊 CHI TIẾT ĐẦU TƯ (${numNotes} NOTES) ===`);
        console.log(`💰 Vốn đầu tư: ${formatCurrency(investmentAmount)} / ${formatCurrency(totalLoan)} (${(investmentRatio * 100).toFixed(2)}%)`);
        console.log(`📈 Lãi suất: Borrower ${borrowerRate}% | Spread 3% | Lender ${lenderRate}%`);
        console.log(`➗ Tỷ lệ lãi nhận: ${lenderRate}/${borrowerRate} = ${(rateRatio * 100).toFixed(2)}%`);

        if (schedulePeriodsData.length > 0) {
            console.log(`\n🗓️ CHI TIẾT LỊCH TRẢ NỢ (${schedulePeriodsData.length} KỲ):`);
            console.log(`| Kỳ | Gốc Lender | Lãi Lender | Tổng nhận | Lãi Borrower |`);
            console.log(`|----|------------|------------|-----------|--------------|`);

            schedulePeriodsData.forEach((p: any) => {
                const borrower_int = fineractSchedule.repaymentSchedule.periods.find((fp: any) => fp.period === p.period)?.interestDue || 0;
                console.log(`| ${p.period.toString().padEnd(2)} | ${formatCurrency(p.principal).padEnd(10)} | ${formatCurrency(p.interest).padEnd(10)} | ${formatCurrency(p.total).padEnd(9)} | ${formatCurrency(borrower_int).padEnd(12)} |`);
            });
        }

        console.log(`\n💵 TỔNG LỢI NHUẬN: ${formatCurrency(totalProfit)}₫`);
        console.log(`==========================================\n`);
    }, [numNotes, fineractSchedule, totalProfit]);

    const handleInvest = async () => {
        const notes = parseInt(numNotes);
        if (!notes || notes < 1) {
            Alert.alert('Lỗi', 'Vui lòng nhập số notes hợp lệ');
            return;
        }

        if (notes > loan.availableNotes) {
            Alert.alert('Lỗi', `Chỉ còn ${loan.availableNotes} notes có thể đầu tư`);
            return;
        }

        Alert.alert(
            'Xác nhận đầu tư',
            `Bạn có muốn đầu tư ${formatCurrency(investmentAmount)}₫ vào khoản vay này?\n\nLợi nhuận dự kiến: ${formatCurrency(totalProfit)}₫`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xác nhận',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await investApi.createInvestment({
                                loanContractId: loan.contractId,
                                capital: investmentAmount,
                                numNotes: notes,
                            });
                            Alert.alert('Thành công', 'Đầu tư thành công!', [
                                { text: 'OK', onPress: () => navigation.goBack() },
                            ]);
                        } catch (error: any) {
                            Alert.alert('Lỗi', error.message || 'Không thể tạo đầu tư');
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
            {/* Custom Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="arrow-left" size={24} color={GlassTokens.colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chi tiết đầu tư</Text>
                <View style={styles.backButtonBlank} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Loan Info Card */}
                <GlassCard blur={GlassTokens.blur.light}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="file-document-outline" size={24} color={GlassTokens.colors.primary} />
                        <Text style={styles.cardTitle}>Thông tin khoản vay</Text>
                    </View>

                    <View style={styles.infoGrid}>
                        <InfoItem label="Mã hợp đồng" value={loan.contractId} />
                        <InfoItem label="Số tiền vay" value={`${formatCurrency(loan.info.capital)}₫`} />
                        <InfoItem label="Lãi suất" value={`${loan.info.rate}%/tháng`} highlight />
                        <InfoItem label="Thời hạn" value={`${loan.info.periodMonth} tháng`} />
                        <InfoItem label="Mục đích" value={loan.info.willing || 'Không xác định'} fullWidth />
                    </View>

                    {/* Progress */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Tiến độ gọi vốn</Text>
                            <Text style={styles.progressPercent}>{loan.fundedPercentage}%</Text>
                        </View>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${loan.fundedPercentage}%` }]} />
                        </View>
                        <Text style={styles.progressDetail}>
                            {loan.investedNotes}/{loan.totalNotes} notes • Còn {formatCurrency(loan.availableAmount)}₫
                        </Text>
                    </View>
                </GlassCard>

                {/* Investment Form Card */}
                <GlassCard blur={GlassTokens.blur.light} style={styles.formCard}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="cash-plus" size={24} color={GlassTokens.colors.success} />
                        <Text style={styles.cardTitle}>Đầu tư</Text>
                    </View>

                    <Text style={styles.inputLabel}>
                        Số notes muốn mua (1 note = {formatCurrency(noteValue)}₫)
                    </Text>

                    <View style={styles.inputContainer}>
                        <TouchableOpacity
                            style={styles.adjustButton}
                            onPress={() => setNumNotes(Math.max(1, parseInt(numNotes || '0') - 1).toString())}
                        >
                            <MaterialCommunityIcons name="minus" size={24} color={GlassTokens.colors.textPrimary} />
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            value={numNotes}
                            onChangeText={setNumNotes}
                            keyboardType="numeric"
                            textAlign="center"
                            placeholderTextColor={GlassTokens.colors.textMuted}
                        />
                        <TouchableOpacity
                            style={styles.adjustButton}
                            onPress={() => setNumNotes(Math.min(loan.availableNotes, parseInt(numNotes || '0') + 1).toString())}
                        >
                            <MaterialCommunityIcons name="plus" size={24} color={GlassTokens.colors.textPrimary} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.maxNotes}>Tối đa: {loan.availableNotes} notes</Text>

                    {/* Summary */}
                    <View style={styles.summary}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Số tiền đầu tư</Text>
                            <Text style={[styles.summaryValue, styles.glowText]}>{formatCurrency(investmentAmount)}₫</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Gốc + Lãi/tháng (dự kiến)</Text>
                            <Text style={[styles.summaryValue, { color: GlassTokens.colors.success }]}>
                                +{formatCurrency(monthlyPayment)}₫
                            </Text>
                        </View>
                        <View style={[styles.summaryRow, { marginLeft: 16 }]}>
                            <Text style={[styles.summaryLabel, { fontSize: 12 }]}>↳ Gốc: {formatCurrency(monthlyPrincipal)}₫</Text>
                        </View>
                        <View style={[styles.summaryRow, { marginLeft: 16 }]}>
                            <Text style={[styles.summaryLabel, { fontSize: 12 }]}>↳ Lãi: {formatCurrency(monthlyLenderInterest)}₫</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Tổng lợi nhuận (dự kiến)</Text>
                            <Text style={[styles.summaryValue, { color: GlassTokens.colors.primary }, styles.glowText]}>
                                {formatCurrency(totalProfit)}₫
                            </Text>
                        </View>
                    </View>

                    {/* Repayment Schedule Timeline */}
                    {scheduleLoading ? (
                        <View style={styles.scheduleSection}>
                            <ActivityIndicator size="small" color={GlassTokens.colors.primary} />
                            <Text style={styles.scheduleTitle}>Đang tải lịch...</Text>
                        </View>
                    ) : schedulePeriodsData.length > 0 ? (
                        <View style={styles.scheduleSection}>
                            <Text style={styles.scheduleTitle}>Lịch nhận tiền ({schedulePeriodsData.length} tháng)</Text>
                            <View style={styles.scheduleList}>
                                {schedulePeriodsData.map((period, index) => {
                                    const isLast = index === schedulePeriodsData.length - 1;

                                    return (
                                        <View key={period.period} style={styles.scheduleItem}>
                                            <View style={styles.scheduleLeft}>
                                                <View style={styles.scheduleDot} />
                                                {!isLast && <View style={styles.scheduleLine} />}
                                            </View>
                                            <View style={styles.scheduleContent}>
                                                <View style={styles.scheduleHeader}>
                                                    <View>
                                                        <Text style={styles.scheduleMonth}>Tháng {period.period}</Text>
                                                        {period.dueDate && (
                                                            <Text style={{ color: GlassTokens.colors.textMuted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
                                                                {Array.isArray(period.dueDate)
                                                                    ? `${period.dueDate[2]}/${period.dueDate[1]}/${period.dueDate[0]}`
                                                                    : new Date(period.dueDate).toLocaleDateString('vi-VN')}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    <Text style={styles.scheduleTotal}>
                                                        {formatCurrency(period.total)}₫
                                                    </Text>
                                                </View>
                                                <View style={styles.scheduleBreakdown}>
                                                    <Text style={styles.scheduleDetail}>
                                                        ↳ Gốc: {formatCurrency(period.principal)}₫
                                                    </Text>
                                                    <Text style={styles.scheduleDetail}>
                                                        ↳ Lãi: {formatCurrency(period.interest)}₫
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    ) : null}

                    {/* Invest Button */}
                    <GlassButton
                        title="XÁC NHẬN ĐẦU TƯ"
                        icon="check-circle"
                        onPress={handleInvest}
                        loading={loading}
                        variant="primary"
                        style={{ marginTop: 24 }}
                    />
                </GlassCard>
            </ScrollView>
        </GradientBackground>
    );
}

interface InfoItemProps {
    label: string;
    value: string;
    highlight?: boolean;
    fullWidth?: boolean;
}

function InfoItem({ label, value, highlight, fullWidth }: InfoItemProps) {
    return (
        <View style={[styles.infoItem, fullWidth && styles.infoItemFull]}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, highlight && { color: GlassTokens.colors.success }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: UnifiedSpacing.lg,
        paddingTop: UnifiedSpacing.md,
        paddingBottom: UnifiedSpacing.md,
        backgroundColor: 'transparent',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },

    backButtonBlank: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.0)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.0)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    scrollContent: {
        padding: UnifiedSpacing.lg,
        paddingTop: UnifiedSpacing.md,
        paddingBottom: 100,
    },
    formCard: {
        marginBottom: 24,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    infoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
    },
    infoItem: {
        width: '50%',
        paddingHorizontal: 6,
        marginBottom: 16,
    },
    infoItemFull: {
        width: '100%',
    },
    infoLabel: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 4,
        fontFamily: 'Poppins_400Regular',
    },
    infoValue: {
        fontSize: 15,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    progressSection: {
        marginTop: 8,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    progressLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    progressPercent: {
        fontSize: 14,
        fontWeight: '600',
        color: GlassTokens.colors.success,
        fontFamily: 'Poppins_600SemiBold',
    },
    progressBar: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: GlassTokens.colors.success,
        borderRadius: 4,
    },
    progressDetail: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginTop: 8,
        fontFamily: 'Poppins_400Regular',
    },
    inputLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 12,
        fontFamily: 'Poppins_400Regular',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    adjustButton: {
        width: 52,
        height: 52,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: UnifiedRadius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    input: {
        flex: 1,
        height: 52,
        fontSize: 24,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: GlassTokens.colors.primary,
        fontFamily: 'Poppins_700Bold',
    },
    maxNotes: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginTop: 10,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    summary: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        gap: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
    },
    glowText: {
        textShadowColor: GlassTokens.colors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    scheduleSection: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    scheduleTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        marginBottom: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    scheduleList: {
        gap: 0,
    },
    scheduleItem: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    scheduleLeft: {
        alignItems: 'center',
        marginRight: 12,
        width: 20,
    },
    scheduleDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: GlassTokens.colors.success,
        marginTop: 6,
    },
    scheduleLine: {
        width: 2,
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginTop: 4,
    },
    scheduleContent: {
        flex: 1,
        paddingBottom: 16,
    },
    scheduleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    scheduleMonth: {
        fontSize: 14,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    scheduleTotal: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.success,
        fontFamily: 'Poppins_700Bold',
    },
    scheduleBreakdown: {
        gap: 2,
    },
    scheduleDetail: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
});
