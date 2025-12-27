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
    StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, AvailableLoan } from '../../services/invest';
import { loanApi } from '../../services';
import { DarkColors, DarkStyling, DarkGradients } from '../../theme';
import { GlowCard, GlowButton } from '../../components/glow';

type RouteParams = {
    InvestDetail: { loan: AvailableLoan };
};

/**
 * InvestDetailScreen - Loan details and investment form (Dark Theme)
 */
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

        // FIX: Force calculate Lender Rate as Effective Rate (Borrower - 3%)
        // To ensure Lender receives ~15% return (not flat-rate deducted 12%)
        const borrowerAnnualRate = fineractSchedule?.interestRate?.annual || 16;
        const adminSpread = 3;
        const lenderAnnualRate = borrowerAnnualRate - adminSpread; // 15%
        const periodMonth = loan.info.periodMonth || 6;

        let mPrincipal = investmentAmount / periodMonth;
        let mLenderInterest = (investmentAmount * (lenderAnnualRate / 12)) / 100;
        let mPayment = mPrincipal + mLenderInterest;
        let tProfit = mLenderInterest * periodMonth;
        let sPeriodsData: any[] = [];

        if (fineractSchedule?.repaymentSchedule?.periods) {
            const periods = fineractSchedule.repaymentSchedule.periods.filter((p: any) => p.period > 0);
            const investmentRatio = investmentAmount / (loan.info?.capital || investmentAmount);
            const rateRatio = lenderAnnualRate / borrowerAnnualRate;

            sPeriodsData = periods.map((period: any) => {
                const borrowerPrincipal = period.principalDue || 0;
                const borrowerInterest = period.interestDue || 0;

                // 1. Lender Principal = Borrower Principal * Investment Share
                const lenderPrincipal = Math.round(borrowerPrincipal * investmentRatio);

                // 2. Lender Interest = Borrower Interest * Rate Ratio * Investment Share
                // Direct scaling from API data as requested
                const lenderInterest = Math.round(borrowerInterest * rateRatio * investmentRatio);

                return {
                    period: period.period,
                    dueDate: period.dueDate,
                    principal: lenderPrincipal,
                    interest: lenderInterest,
                    total: lenderPrincipal + lenderInterest,
                };
            });

            tProfit = sPeriodsData.reduce((sum, p) => sum + p.interest, 0);

            if (sPeriodsData.length > 0) {
                mPrincipal = sPeriodsData.reduce((sum, p) => sum + p.principal, 0) / sPeriodsData.length;
                mLenderInterest = tProfit / sPeriodsData.length;
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
    }, [numNotes, fineractSchedule, loan.contractId]);

    const investmentAmount = parseInt(numNotes || '0') * noteValue;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    // Detailed Debug Logs
    React.useEffect(() => {
        if (!fineractSchedule) return;

        const investmentAmount = parseInt(numNotes || '0') * noteValue;
        const totalLoan = loan.info?.capital || investmentAmount;
        const investmentRatio = investmentAmount / totalLoan;

        const borrowerRate = fineractSchedule?.interestRate?.annual || loan.borrowerInterestRate || 16;
        const lenderRate = borrowerRate - 3; // Force 15%
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
                                capital: investmentAmount, // FIXED: Send total amount
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
        <LinearGradient
            colors={DarkGradients.background}
            style={styles.container}
        >
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Loan Info Card */}
                <GlowCard>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="file-document-outline" size={24} color={DarkColors.primary} />
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
                </GlowCard>

                {/* Investment Form Card */}
                <GlowCard style={styles.formCard}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="cash-plus" size={24} color={DarkColors.success} />
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
                            <MaterialCommunityIcons name="minus" size={24} color={DarkColors.text} />
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            value={numNotes}
                            onChangeText={setNumNotes}
                            keyboardType="numeric"
                            textAlign="center"
                            placeholderTextColor={DarkColors.textMuted}
                        />
                        <TouchableOpacity
                            style={styles.adjustButton}
                            onPress={() => setNumNotes(Math.min(loan.availableNotes, parseInt(numNotes || '0') + 1).toString())}
                        >
                            <MaterialCommunityIcons name="plus" size={24} color={DarkColors.text} />
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
                            <Text style={[styles.summaryValue, { color: DarkColors.success }]}>
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
                            <Text style={[styles.summaryValue, { color: DarkColors.primary }, styles.glowText]}>
                                {formatCurrency(totalProfit)}₫
                            </Text>
                        </View>
                    </View>

                    {/* Repayment Schedule Timeline */}
                    {scheduleLoading ? (
                        <View style={styles.scheduleSection}>
                            <ActivityIndicator size="small" color={DarkColors.primary} />
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
                                                            <Text style={{ color: DarkColors.textMuted, fontSize: 12 }}>
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
                    <GlowButton
                        title="Xác nhận đầu tư"
                        icon="check-circle"
                        onPress={handleInvest}
                        loading={loading}
                        style={{ marginTop: 24 }}
                    />
                </GlowCard>
            </ScrollView>
        </LinearGradient>
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
            <Text style={[styles.infoValue, highlight && { color: DarkColors.success }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    // Card
    // GlowCard usage replaces basic card styles
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
        color: DarkColors.text,
    },
    // Info Grid
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
        color: DarkColors.textSecondary,
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
    },
    // Progress
    progressSection: {
        marginTop: 8,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    progressLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    progressPercent: {
        fontSize: 14,
        fontWeight: '600',
        color: DarkColors.success,
    },
    progressBar: {
        height: 8,
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: DarkColors.success,
        borderRadius: 4,
    },
    progressDetail: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 8,
    },
    // Input
    inputLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginBottom: 12,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    adjustButton: {
        width: 52,
        height: 52,
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    input: {
        flex: 1,
        height: 52,
        fontSize: 24,
        fontWeight: '700',
        color: DarkColors.text,
        marginHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: DarkColors.primary,
    },
    maxNotes: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 10,
        textAlign: 'center',
    },
    // Summary
    summary: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
        gap: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: '700',
        color: DarkColors.text,
    },
    // Button
    investButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: DarkStyling.borderRadius.sm,
        marginTop: 20,
        gap: 8,
    },
    investButtonText: {
        color: DarkColors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    glowText: {
        textShadowColor: DarkColors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    // Schedule Timeline
    scheduleSection: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
    },
    scheduleTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 16,
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
        backgroundColor: DarkColors.success,
        marginTop: 6,
    },
    scheduleLine: {
        width: 2,
        flex: 1,
        backgroundColor: DarkColors.border,
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
        color: DarkColors.text,
    },
    scheduleTotal: {
        fontSize: 16,
        fontWeight: '700',
        color: DarkColors.success,
    },
    scheduleBreakdown: {
        gap: 2,
    },
    scheduleDetail: {
        fontSize: 12,
        color: DarkColors.textSecondary,
    },
});
