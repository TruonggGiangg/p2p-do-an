/**
 * LoanDetailScreen - Consistent Glassmorphism UI
 * Complete refactor with shared components
 */

import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Alert,
    Text,
    Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loanApi } from '../../services';
import {
    LoanContract,
    FineractLoanDetails,
    OutstandingBalance,
} from '../../types';
import { GradientBackground, GlassCard, InfoRow, SectionTitle, GlassTokens, GlassButton } from '../../components/glass';
import { PageHeader } from '../../components/common';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

// Format helpers
const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return '0 đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
    }).format(value);
};

const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatDate = (dateArr?: number[] | string): string => {
    if (!dateArr) return 'N/A';
    if (Array.isArray(dateArr)) {
        if (dateArr.length < 3) return 'N/A';
        return `${dateArr[2]}/${dateArr[1]}/${dateArr[0]}`;
    }
    return new Date(dateArr).toLocaleDateString('vi-VN');
};

export const LoanDetailScreen: React.FC = () => {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { loanId, contractId } = route.params || {};

    // Hide navigation header
    useLayoutEffect(() => {
        navigation.setOptions({
            headerShown: false,
        });
    }, [navigation]);

    const [loan, setLoan] = useState<LoanContract | null>(null);
    const [fineractDetails, setFineractDetails] = useState<FineractLoanDetails | null>(null);
    const [outstanding, setOutstanding] = useState<OutstandingBalance | null>(null);
    const [walletBalance, setWalletBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);

    // Subtle pulse animation for outstanding balance
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (outstanding) {
            // Very subtle pulse effect
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.015,
                        duration: 2000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 2000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [outstanding, pulseAnim]);

    const fetchData = useCallback(async () => {
        try {
            if (contractId) {
                const loanData = await loanApi.getLoanDetail(contractId);
                setLoan(loanData);
            }

            // Fetch wallet balance
            try {
                const wallet = await loanApi.getWalletBalance();
                setWalletBalance(wallet.availableBalance);
            } catch (e) {
                console.log('Could not fetch wallet balance:', e);
            }

            const id = loanId || contractId;
            if (id) {
                try {
                    const details = await loanApi.getFineractDetails(id);
                    setFineractDetails(details);
                } catch (e) {
                    console.log('Could not fetch Fineract details:', e);
                }

                try {
                    const balance = await loanApi.getOutstandingBalance(id);
                    setOutstanding(balance);
                } catch (e: any) {
                    console.log('Could not fetch outstanding balance:', e);
                }
            }

            // Debug logs
            if (loan && fineractDetails) {
                console.log('=== LOAN DETAIL BORROWER DEBUG ===');
                console.log('Loan MongoDB:', {
                    contractId: loan.contractId,
                    borrowerRate: loan.borrowerInterestRate,
                    lenderRate: loan.lenderInterestRate,
                    adminSpread: loan.adminSpread,
                    capital: loan.info?.capital,
                    periodMonth: loan.info?.periodMonth,
                });
                console.log('Fineract:', {
                    loanId: fineractDetails.fineractLoanId,
                    principal: fineractDetails.principal,
                    interestRate: fineractDetails.interestRate,
                });
                if (fineractDetails.repaymentSchedule?.periods) {
                    const periods = fineractDetails.repaymentSchedule.periods.filter(p => p.period > 0);
                    console.log('Schedule Sample:', periods[0]);
                    const totalP = periods.reduce((sum, p) => sum + (p.principalDue || 0), 0);
                    const totalI = periods.reduce((sum, p) => sum + (p.interestDue || 0), 0);
                    console.log('Totals:', { principal: Math.round(totalP), interest: Math.round(totalI), total: Math.round(totalP + totalI) });
                }
                console.log('Outstanding:', outstanding);
                console.log('===================================');
            }
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [loanId, contractId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const getNextUnpaidPeriod = () => {
        if (!fineractDetails?.repaymentSchedule?.periods) return null;
        return fineractDetails.repaymentSchedule.periods.find(p => !p.complete && p.period > 0);
    };

    const handleRepayment = () => {
        const fineractLoanId = fineractDetails?.fineractLoanId || loan?.fineractLoanId;
        if (!fineractLoanId) {
            Alert.alert('Lỗi', 'Không tìm thấy thông tin khoản vay để thanh toán');
            return;
        }

        const nextPeriod = getNextUnpaidPeriod();
        const suggestedAmount = nextPeriod ? (nextPeriod.totalDue || ((nextPeriod.principalDue || 0) + (nextPeriod.interestDue || 0))) : 0;

        (navigation.navigate as any)('Transfer', {
            mode: 'repayment',
            balance: walletBalance,
            fineractLoanId,
            loanCode: loan?.contractId || `Khoản vay #${fineractLoanId}`,
            amount: suggestedAmount > 0 ? suggestedAmount : undefined,
            note: `Thanh toán kỳ ${nextPeriod?.period || '?'} - Hợp đồng ${loan?.contractId || ''}`,
        });
    };

    const handlePrepay = async () => {
        const fineractLoanId = fineractDetails?.fineractLoanId || loan?.fineractLoanId;
        const id = loanId || contractId || loan?.contractId;

        if (!fineractLoanId || !id) {
            Alert.alert('Lỗi', 'Không tìm thấy thông tin khoản vay');
            return;
        }

        try {
            const prepayInfo = await loanApi.getPrepayAmount(id);

            (navigation.navigate as any)('Transfer', {
                mode: 'prepay',
                balance: walletBalance,
                fineractLoanId,
                loanCode: loan?.contractId || `Khoản vay #${fineractLoanId}`,
                amount: prepayInfo.amount,
                note: `Tất toán toàn bộ HĐ ${loan?.contractId || ''}`,
                readOnlyAmount: true
            });
        } catch (error) {
            Alert.alert('Lỗi', 'Không thể lấy thông tin tất toán. Vui lòng thử lại.');
        }
    };

    const handleDisburse = async () => {
        const id = contractId || loan?.contractId;
        if (!id) return;

        Alert.alert(
            'Xác nhận giải ngân',
            'Bạn có chắc chắn muốn giải ngân khoản vay này?',
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Giải ngân',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await loanApi.disburseLoan(id);
                            Alert.alert('Thành công', 'Khoản vay đã được giải ngân thành công');
                            fetchData();
                        } catch (error: any) {
                            Alert.alert('Lỗi giải ngân', error.message || 'Có lỗi xảy ra khi giải ngân');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };



    if (loading) {
        return (
            <GradientBackground>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={GlassTokens.colors.primary} />
                    <Text style={styles.loadingText}>Đang tải chi tiết...</Text>
                </View>
            </GradientBackground>
        );
    }

    const principal = fineractDetails?.principal || loan?.info?.capital || 0;
    const periods = fineractDetails?.numberOfRepayments || loan?.info?.periodMonth || 0;
    const rate = fineractDetails?.interestRate?.perPeriod || loan?.info?.rate || 0;

    return (
        <GradientBackground>
            <View style={styles.container}>
                <PageHeader title="Chi Tiết Khoản Vay" />

                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={GlassTokens.colors.primary}
                        />
                    }
                >
                    <View style={styles.bodyContainer}>
                        {/* Amount Hero Card */}
                        <GlassCard blur={GlassTokens.blur.heavy} >
                            <Text style={styles.amountLabel}>Số tiền vay</Text>
                            <Text style={styles.amountValue}>
                                {formatNumber(principal)}<Text style={styles.amountCurrency}>₫</Text>
                            </Text>
                            <View style={styles.amountMeta}>
                                <View style={styles.metaItem}>
                                    <Ionicons name="calendar-outline" size={16} color={GlassTokens.colors.textSecondary} />
                                    <Text style={styles.metaText}>{periods} tháng</Text>
                                </View>
                                <View style={styles.metaDivider} />
                                <View style={styles.metaItem}>
                                    <Ionicons name="stats-chart" size={16} color={GlassTokens.colors.textSecondary} />
                                    <Text style={styles.metaText}>{rate}% / tháng</Text>
                                </View>
                            </View>
                        </GlassCard>

                        {/* Outstanding Balance */}
                        {outstanding && (
                            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                                <GlassCard variant="error" blur={GlassTokens.blur.medium}>
                                    <SectionTitle>Dư nợ hiện tại</SectionTitle>
                                    <Text style={styles.outstandingValue}>{formatCurrency(outstanding.totalOutstanding)}</Text>
                                    <View style={styles.outstandingDetails}>
                                        <View style={styles.outstandingItem}>
                                            <Text style={styles.outstandingLabel}>Gốc còn lại</Text>
                                            <Text style={styles.outstandingItemValue}>{formatCurrency(outstanding.principalOutstanding)}</Text>
                                        </View>
                                        <View style={styles.outstandingItem}>
                                            <Text style={styles.outstandingLabel}>Lãi chưa trả</Text>
                                            <Text style={[styles.outstandingItemValue, { color: '#FACC15' }]}>
                                                {formatCurrency(outstanding.interestOutstanding)}
                                            </Text>
                                        </View>
                                    </View>
                                </GlassCard>
                            </Animated.View>
                        )}

                        {/* Loan Info */}
                        <GlassCard blur={GlassTokens.blur.medium}>
                            <SectionTitle>Thông tin khoản vay</SectionTitle>
                            <InfoRow
                                label="Mã hợp đồng"
                                value={loan?.contractId || `LOAN_${fineractDetails?.fineractLoanId || '???'}`}
                            />
                            <InfoRow
                                label="Mã Fineract"
                                value={fineractDetails?.fineractLoanId?.toString() || 'N/A'}
                            />
                            <InfoRow
                                label="Mục đích vay"
                                value={fineractDetails?.loanPurposeName || loan?.info?.willing || 'Chưa xác định'}
                            />
                            <InfoRow
                                label="Trạng thái"
                                value={fineractDetails?.status?.value || loan?.status || 'N/A'}
                            />
                            <InfoRow
                                label="Ngày nộp đơn"
                                value={formatDate(fineractDetails?.timeline?.submittedOnDate)}
                            />
                            <InfoRow
                                label="Ngày giải ngân"
                                value={fineractDetails?.timeline?.actualDisbursementDate
                                    ? formatDate(fineractDetails.timeline.actualDisbursementDate)
                                    : 'Chờ giải ngân'
                                }
                            />
                            <InfoRow
                                label="Ngày đáo hạn"
                                value={formatDate(fineractDetails?.timeline?.expectedMaturityDate)}
                            />
                        </GlassCard>

                        {/* Loan Configuration Details */}
                        <GlassCard blur={GlassTokens.blur.medium}>
                            <SectionTitle>Chi tiết khoản vay</SectionTitle>
                            <InfoRow
                                label="Lãi suất"
                                value={`${(fineractDetails?.interestRate?.annual || rate * 12).toFixed(2)}% / năm (${rate}% / tháng)`}
                            />
                            <InfoRow
                                label="Loại lãi"
                                value={`${fineractDetails?.interestType?.value || 'Số dư giảm dần'}`}
                            />
                            <InfoRow
                                label="Phân bổ trả nợ"
                                value={fineractDetails?.amortizationType?.value || 'Trả góp đều'}
                            />
                            <InfoRow
                                label="Các kỳ trả nợ"
                                value={`${periods} kỳ, mỗi ${fineractDetails?.repaymentEvery || 1} tháng`}
                            />
                            <InfoRow
                                label="Chiến lược trả nợ"
                                value={fineractDetails?.transactionProcessingStrategyName || 'Phạt, Phí, Lãi, Gốc'}
                            />
                            <InfoRow
                                label="Kỳ tính lãi"
                                value={fineractDetails?.interestCalculationPeriodType?.value || 'Giống kỳ hạn trả nợ'}
                            />
                            <InfoRow
                                label="Số ngày trong năm"
                                value={fineractDetails?.daysInYearType?.value || '365 Ngày'}
                            />
                            <InfoRow
                                label="Số ngày trong tháng"
                                value={fineractDetails?.daysInMonthType?.value || 'Thực tế'}
                            />
                        </GlassCard>

                        {/* Transactions */}
                        {fineractDetails?.transactions && fineractDetails.transactions.length > 0 && (
                            <GlassCard blur={GlassTokens.blur.medium}>
                                <SectionTitle>Giao dịch ({fineractDetails.transactions.length})</SectionTitle>
                                <View style={styles.transactionsList}>
                                    {fineractDetails.transactions.slice(0, 10).map((tx: any, idx: number) => {
                                        const isDebit = tx.type?.disbursement || tx.type?.code?.includes('disburse');
                                        const isCredit = tx.type?.repayment || tx.type?.code?.includes('repayment');

                                        let txColor = GlassTokens.colors.textSecondary;
                                        let txIcon = 'swap-horizontal';
                                        let txLabel = tx.type?.value || 'Giao dịch';

                                        if (isDebit) {
                                            txColor = GlassTokens.colors.error;
                                            txIcon = 'arrow-down-circle';
                                            txLabel = 'Giải ngân';
                                        } else if (isCredit) {
                                            txColor = GlassTokens.colors.success;
                                            txIcon = 'arrow-up-circle';
                                            txLabel = 'Thanh toán';
                                        }

                                        return (
                                            <View key={idx} style={styles.transactionItem}>
                                                <View style={[styles.txIconBg, { backgroundColor: `${txColor}20` }]}>
                                                    <Ionicons name={txIcon as any} size={20} color={txColor} />
                                                </View>
                                                <View style={styles.txContent}>
                                                    <Text style={styles.txLabel}>{txLabel}</Text>
                                                    <Text style={styles.txDate}>{formatDate(tx.date)}</Text>
                                                </View>
                                                <Text style={[styles.txAmount, { color: txColor }]}>
                                                    {isDebit ? '-' : '+'}{formatNumber(tx.amount)} đ
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    {fineractDetails.transactions.length > 10 && (
                                        <Text style={styles.moreText}>
                                            Và {fineractDetails.transactions.length - 10} giao dịch khác...
                                        </Text>
                                    )}
                                </View>
                            </GlassCard>
                        )}

                        {/* Repayment Timeline */}
                        {fineractDetails?.repaymentSchedule?.periods && (
                            <GlassCard blur={GlassTokens.blur.medium}>
                                <TouchableOpacity
                                    style={styles.timelineHeader}
                                    onPress={() => setTimelineCollapsed(!timelineCollapsed)}
                                >
                                    <SectionTitle style={{ marginBottom: 0 }}>
                                        {`Lịch thanh toán (${fineractDetails.repaymentSchedule.periods.filter(p => p.period > 0).length} kỳ)`}
                                    </SectionTitle>
                                    <Ionicons
                                        name={timelineCollapsed ? "chevron-down" : "chevron-up"}
                                        size={24}
                                        color={GlassTokens.colors.textSecondary}
                                    />
                                </TouchableOpacity>

                                {/* Schedule Summary */}
                                {fineractDetails.repaymentSchedule && (
                                    <View style={styles.scheduleSummary}>
                                        <View style={styles.summaryItem}>
                                            <Text style={styles.summaryLabel}>Tổng gốc</Text>
                                            <Text style={styles.summaryValue}>
                                                {formatCurrency(fineractDetails.repaymentSchedule.totalPrincipalExpected)}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryItem}>
                                            <Text style={styles.summaryLabel}>Tổng lãi</Text>
                                            <Text style={[styles.summaryValue, { color: '#FACC15' }]}>
                                                {formatCurrency(fineractDetails.repaymentSchedule.totalInterestCharged)}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryItem}>
                                            <Text style={styles.summaryLabel}>Tổng cộng</Text>
                                            <Text style={[styles.summaryValue, { color: GlassTokens.colors.primary }]}>
                                                {formatCurrency(fineractDetails.repaymentSchedule.totalRepaymentExpected)}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {!timelineCollapsed && (
                                    <View style={styles.timelineList}>
                                        {fineractDetails.repaymentSchedule.periods
                                            .filter(p => p.period > 0)
                                            .map((period, index) => {
                                                const isCompleted = period.complete;
                                                const isNext = !isCompleted && getNextUnpaidPeriod()?.period === period.period;

                                                let statusColor = GlassTokens.colors.textMuted;
                                                let statusBg = 'rgba(139, 141, 151, 0.15)';
                                                let statusText = 'Chưa đến hạn';

                                                if (isCompleted) {
                                                    statusColor = GlassTokens.colors.success;
                                                    statusBg = 'rgba(16, 185, 129, 0.15)';
                                                    statusText = 'Đã trả';
                                                } else if (isNext) {
                                                    statusColor = '#FACC15';
                                                    statusBg = 'rgba(250, 204, 21, 0.15)';
                                                    statusText = 'Sắp đến hạn';
                                                }

                                                // Get principal and interest for this period
                                                const principalDue = period.principalDue || 0;
                                                const interestDue = period.interestDue || 0;
                                                const totalDue = period.totalDue || (principalDue + interestDue);

                                                return (
                                                    <View key={index} style={styles.timelineItem}>
                                                        <View style={styles.timelineLeft}>
                                                            <View style={[styles.dot, { backgroundColor: statusColor }]} />
                                                            {index < fineractDetails.repaymentSchedule.periods.filter(p => p.period > 0).length - 1 &&
                                                                <View style={styles.line} />
                                                            }
                                                        </View>
                                                        <View style={styles.timelineContent}>
                                                            <View style={styles.timelineTop}>
                                                                <Text style={styles.periodText}>Kỳ {period.period}</Text>
                                                                <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                                                                    <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                                                                </View>
                                                            </View>
                                                            <Text style={styles.dueDate}>Hạn: {formatDate(period.dueDate)}</Text>

                                                            {/* Detailed breakdown for Declining Balance */}
                                                            <View style={styles.periodBreakdown}>
                                                                <View style={styles.breakdownRow}>
                                                                    <Text style={styles.breakdownLabel}>Gốc:</Text>
                                                                    <Text style={styles.breakdownValue}>{formatNumber(principalDue)} đ</Text>
                                                                </View>
                                                                <View style={styles.breakdownRow}>
                                                                    <Text style={styles.breakdownLabel}>Lãi:</Text>
                                                                    <Text style={[styles.breakdownValue, { color: '#FACC15' }]}>
                                                                        {formatNumber(interestDue)} đ
                                                                    </Text>
                                                                </View>
                                                            </View>

                                                            <Text style={styles.dueAmount}>{formatCurrency(totalDue)}</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                    </View>
                                )}
                            </GlassCard>
                        )}
                    </View>
                </ScrollView>

                {/* Action Buttons */}
                {((outstanding?.totalOutstanding ?? 0) > 0 ||
                    ['active', 'on_going', 'success', 'disbursed', 'overdue'].includes(loan?.status || '')) && (
                        <View style={styles.bottomBar}>
                            <TouchableOpacity style={styles.payButton} onPress={handleRepayment}>
                                <LinearGradient
                                    colors={GlassTokens.gradients.primary}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.payButtonGradient}
                                >
                                    <Text style={styles.payButtonText}>Thanh Toán</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.prepayButton} onPress={handlePrepay}>
                                <Text style={styles.prepayButtonText}>Tất Toán</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                {/* Disburse Button */}
                {loan?.status === 'waiting' && (loan?.investedNotes ?? 0) >= (loan?.totalNotes ?? 1) && (
                    <View style={styles.bottomBar}>
                        <TouchableOpacity style={styles.payButton} onPress={handleDisburse}>
                            <LinearGradient
                                colors={GlassTokens.gradients.success}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.payButtonGradient}
                            >
                                <Text style={styles.payButtonText}>Giải Ngân</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: GlassTokens.spacing.sm,
        color: GlassTokens.colors.textSecondary,
        fontSize: 15,
    },
    scrollContent: {
        paddingBottom: 120,
    },
    bodyContainer: {
        paddingHorizontal: GlassTokens.spacing.md,
        paddingTop: GlassTokens.spacing.md,
    },

    // Amount Hero Card
    amountCard: {
        alignItems: 'center',
        shadowColor: GlassTokens.colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    amountLabel: {
        fontSize: 15,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 8,
        letterSpacing: 0.3,
    },
    amountValue: {
        fontSize: 48,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: -1,
    },
    amountCurrency: {
        fontSize: 28,
        fontWeight: '500',
        color: GlassTokens.colors.textSecondary,
    },
    amountMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: GlassTokens.spacing.md,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        fontSize: 15,
        color: GlassTokens.colors.textSecondary,
        marginLeft: 6,
        letterSpacing: 0.1,
    },
    metaDivider: {
        width: 1,
        height: 16,
        backgroundColor: GlassTokens.colors.borderGlass,
        marginHorizontal: GlassTokens.spacing.md,
    },

    // Outstanding
    outstandingValue: {
        fontSize: 36,
        fontWeight: '700',
        color: GlassTokens.colors.error,
        textAlign: 'center',
        marginVertical: GlassTokens.spacing.md,
        letterSpacing: -0.5,
    },
    outstandingDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    outstandingItem: {
        flex: 1,
        alignItems: 'center',
    },
    outstandingLabel: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 4,
        letterSpacing: 0.1,
    },
    outstandingItemValue: {
        fontSize: 16,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: -0.2,
    },

    // Timeline
    timelineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: GlassTokens.spacing.md,
        paddingBottom: GlassTokens.spacing.xs,
    },
    timelineList: {
        marginTop: GlassTokens.spacing.xs,
    },
    timelineItem: {
        flexDirection: 'row',
    },
    timelineLeft: {
        width: 24,
        alignItems: 'center',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        zIndex: 1,
    },
    line: {
        width: 2,
        flex: 1,
        backgroundColor: GlassTokens.colors.borderGlassSubtle,
        marginVertical: 4,
    },
    timelineContent: {
        flex: 1,
        paddingBottom: GlassTokens.spacing.md,
        paddingLeft: GlassTokens.spacing.sm,
    },
    timelineTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    periodText: {
        fontSize: 16,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: -0.2,
    },
    statusBadge: {
        paddingHorizontal: GlassTokens.spacing.xs,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    dueDate: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        marginTop: 4,
        letterSpacing: 0.1,
    },
    dueAmount: {
        fontSize: 15,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        marginTop: 4,
        letterSpacing: -0.2,
    },

    // Period Breakdown for Declining Balance
    periodBreakdown: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: GlassTokens.colors.borderGlassSubtle,
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    breakdownLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
    },
    breakdownValue: {
        fontSize: 12,
        fontWeight: '500',
        color: GlassTokens.colors.textPrimary,
    },

    // Bottom Bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        padding: GlassTokens.spacing.md,
        flexDirection: 'row',
        gap: GlassTokens.spacing.sm,
        borderTopWidth: 0.5,
        borderTopColor: GlassTokens.colors.borderGlass,
    },
    payButton: {
        flex: 1,
        borderRadius: GlassTokens.radius.md,
        overflow: 'hidden',
    },
    payButtonGradient: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    payButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    prepayButton: {
        flex: 1,
        borderRadius: GlassTokens.radius.md,
        borderWidth: 0,
        borderColor: GlassTokens.colors.primary,
        paddingVertical: 16,
        alignItems: 'center',
        backgroundColor: GlassTokens.colors.primaryGlass,
    },
    prepayButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: GlassTokens.colors.primary,
        letterSpacing: 0.3,
    },

    // Transactions styles
    transactionsList: {
        marginTop: GlassTokens.spacing.xs,
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: GlassTokens.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: GlassTokens.colors.borderGlassSubtle,
    },
    txIconBg: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    txContent: {
        flex: 1,
        marginLeft: GlassTokens.spacing.sm,
    },
    txLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
    },
    txDate: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginTop: 2,
    },
    txAmount: {
        fontSize: 14,
        fontWeight: '600',
    },
    moreText: {
        textAlign: 'center',
        color: GlassTokens.colors.textSecondary,
        fontSize: 12,
        marginTop: GlassTokens.spacing.sm,
        fontStyle: 'italic',
    },

    // Schedule Summary
    scheduleSummary: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: GlassTokens.spacing.md,
        paddingBottom: GlassTokens.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: GlassTokens.colors.borderGlassSubtle,
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryLabel: {
        fontSize: 11,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 13,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
    },
});

export default LoanDetailScreen;
