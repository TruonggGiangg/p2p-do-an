/**
 * LoanDetailScreen - Modern Dark Fintech Design
 * Following the reference design with glassmorphism cards
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Alert,
    StatusBar,
} from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { loanApi } from '../../services';
import {
    LoanContract,
    FineractLoanDetails,
    OutstandingBalance,
} from '../../types';
import { DarkColors, DarkStatusColors, DarkStyling } from '../../theme';

// Format currency
const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return '0 đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
    }).format(value);
};

// Format number with comma
const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Format date
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

    const [loan, setLoan] = useState<LoanContract | null>(null);
    const [fineractDetails, setFineractDetails] = useState<FineractLoanDetails | null>(null);
    const [outstanding, setOutstanding] = useState<OutstandingBalance | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            if (contractId) {
                const loanData = await loanApi.getLoanDetail(contractId);
                setLoan(loanData);
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
                    Alert.alert('Lỗi tải dư nợ', e.message || 'Lỗi không xác định');
                }
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

    const handleRepayment = () => {
        const fineractLoanId = fineractDetails?.fineractLoanId || loan?.fineractLoanId;
        if (!fineractLoanId) {
            Alert.alert('Lỗi', 'Không tìm thấy thông tin khoản vay để thanh toán');
            return;
        }
        (navigation.navigate as any)('Repayment', {
            loanId: fineractLoanId,
            contractId: contractId || loan?.contractId,
            isPrepay: false,
        });
    };

    const handlePrepay = () => {
        const fineractLoanId = fineractDetails?.fineractLoanId || loan?.fineractLoanId;
        if (!fineractLoanId) {
            Alert.alert('Lỗi', 'Không tìm thấy thông tin khoản vay');
            return;
        }
        (navigation.navigate as any)('Repayment', {
            loanId: fineractLoanId,
            contractId: contractId || loan?.contractId,
            isPrepay: true,
        });
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

    const getNextUnpaidPeriod = () => {
        if (!fineractDetails?.repaymentSchedule?.periods) return null;
        return fineractDetails.repaymentSchedule.periods.find(p => !p.complete && p.period > 0);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DarkColors.primary} />
                <Text style={styles.loadingText}>Đang tải chi tiết...</Text>
            </View>
        );
    }

    const principal = fineractDetails?.principal || loan?.info?.capital || 0;
    const periods = fineractDetails?.numberOfRepayments || loan?.info?.periodMonth || 0;
    const rate = fineractDetails?.interestRate?.perPeriod || loan?.info?.rate || 0;

    const renderHeader = () => (
        <View style={styles.header}>
            <View style={styles.headerTop}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={DarkColors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chi Tiết Khoản Vay</Text>
                <View style={{ width: 24 }} />
            </View>
        </View>
    );

    const renderAmountCard = () => (
        <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Số tiền vay</Text>
            <Text style={styles.amountValue}>
                {formatNumber(principal)}<Text style={styles.amountCurrency}>₫</Text>
            </Text>
            <View style={styles.amountMeta}>
                <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="calendar-range" size={16} color={DarkColors.textSecondary} />
                    <Text style={styles.metaText}>{periods} tháng</Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="percent" size={16} color={DarkColors.textSecondary} />
                    <Text style={styles.metaText}>{rate}% / tháng</Text>
                </View>
            </View>
        </View>
    );

    const renderPaymentReminder = () => {
        if (!fineractDetails) return null;

        const nextPeriod = getNextUnpaidPeriod();
        if (!nextPeriod) return null;

        const dueDateArr = nextPeriod.dueDate;
        if (!dueDateArr || dueDateArr.length < 3) return null;

        const dueDate = new Date(dueDateArr[0], dueDateArr[1] - 1, dueDateArr[2]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let reminderText = '';
        let reminderColor = DarkColors.primary;
        let iconName = 'clock-outline';
        let bg = 'rgba(67, 71, 255, 0.15)';

        if (daysUntilDue < 0) {
            reminderText = `Đã quá hạn ${Math.abs(daysUntilDue)} ngày`;
            reminderColor = DarkColors.error;
            iconName = 'alert-circle';
            bg = 'rgba(255, 71, 87, 0.15)';
        } else if (daysUntilDue === 0) {
            reminderText = 'Hôm nay đáo hạn';
            reminderColor = DarkColors.warning;
            iconName = 'fire';
            bg = 'rgba(255, 165, 2, 0.15)';
        } else if (daysUntilDue <= 3) {
            reminderText = `Còn ${daysUntilDue} ngày`;
            reminderColor = DarkColors.warning;
            bg = 'rgba(255, 165, 2, 0.15)';
        } else {
            reminderText = `Hạn trả ${daysUntilDue} ngày nữa`;
        }

        return (
            <View style={[styles.reminderCard, { backgroundColor: bg }]}>
                <View style={styles.reminderIcon}>
                    <MaterialCommunityIcons name={iconName} size={24} color={reminderColor} />
                </View>
                <View style={styles.reminderContent}>
                    <Text style={[styles.reminderTitle, { color: reminderColor }]}>{reminderText}</Text>
                    <Text style={styles.reminderAmount}>
                        Số tiền: {formatCurrency(nextPeriod.totalDue)}
                    </Text>
                </View>
            </View>
        );
    };

    const renderOutstandingBalance = () => {
        if (!outstanding) return null;

        return (
            <View style={styles.outstandingCard}>
                <Text style={styles.cardTitle}>Dư nợ hiện tại</Text>
                <View style={styles.outstandingMain}>
                    <Text style={styles.outstandingValue}>{formatCurrency(outstanding.totalOutstanding)}</Text>
                </View>
                <View style={styles.outstandingDetails}>
                    <View style={styles.outstandingItem}>
                        <Text style={styles.outstandingLabel}>Gốc còn lại</Text>
                        <Text style={styles.outstandingItemValue}>{formatCurrency(outstanding.principalOutstanding)}</Text>
                    </View>
                    <View style={styles.outstandingItem}>
                        <Text style={styles.outstandingLabel}>Lãi chưa trả</Text>
                        <Text style={[styles.outstandingItemValue, { color: DarkColors.warning }]}>
                            {formatCurrency(outstanding.interestOutstanding)}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderLoanInfo = () => {
        const disbursement = fineractDetails?.timeline?.actualDisbursementDate
            ? formatDate(fineractDetails.timeline.actualDisbursementDate)
            : 'Chờ giải ngân';

        const infoItems = [
            { icon: 'file-document-outline', label: 'Mã hợp đồng', value: loan?.contractId || `LOAN_${fineractDetails?.fineractLoanId || '???'}` },
            { icon: 'calendar-check', label: 'Ngày giải ngân', value: disbursement },
            { icon: 'target', label: 'Mục đích vay', value: loan?.info?.willing || 'Tiêu dùng' },
        ];

        return (
            <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Thông tin chi tiết</Text>
                {infoItems.map((item, index) => (
                    <View key={index} style={styles.infoRow}>
                        <View style={styles.infoIcon}>
                            <MaterialCommunityIcons name={item.icon as any} size={18} color={DarkColors.textSecondary} />
                        </View>
                        <View style={styles.infoContent}>
                            <Text style={styles.infoLabel}>{item.label}</Text>
                            <Text style={styles.infoValue}>{item.value}</Text>
                        </View>
                    </View>
                ))}
            </View>
        );
    };

    const renderTimeline = () => {
        const periods = fineractDetails?.repaymentSchedule?.periods || [];
        const filteredPeriods = periods.filter(p => p.period > 0);

        if (filteredPeriods.length === 0) return null;

        return (
            <View style={styles.timelineCard}>
                <TouchableOpacity
                    style={styles.timelineHeader}
                    onPress={() => setTimelineCollapsed(!timelineCollapsed)}
                >
                    <Text style={styles.cardTitle}>Lịch thanh toán ({filteredPeriods.length} kỳ)</Text>
                    <MaterialCommunityIcons
                        name={timelineCollapsed ? "chevron-down" : "chevron-up"}
                        size={24}
                        color={DarkColors.textSecondary}
                    />
                </TouchableOpacity>

                {!timelineCollapsed && (
                    <View style={styles.timelineList}>
                        {filteredPeriods.map((period, index) => {
                            const isCompleted = period.complete;
                            const isNext = !isCompleted && getNextUnpaidPeriod()?.period === period.period;

                            let statusColor = DarkColors.textMuted;
                            let statusBg = 'rgba(139, 141, 151, 0.15)';
                            let statusText = 'Chưa đến hạn';

                            if (isCompleted) {
                                statusColor = DarkColors.success;
                                statusBg = 'rgba(46, 213, 115, 0.15)';
                                statusText = 'Đã trả';
                            } else if (isNext) {
                                statusColor = DarkColors.warning;
                                statusBg = 'rgba(255, 165, 2, 0.15)';
                                statusText = 'Sắp đến hạn';
                            }

                            return (
                                <View key={index} style={styles.timelineItem}>
                                    <View style={styles.timelineLeft}>
                                        <View style={[styles.dot, { backgroundColor: statusColor }]} />
                                        {index < filteredPeriods.length - 1 && <View style={styles.line} />}
                                    </View>
                                    <View style={styles.timelineContent}>
                                        <View style={styles.timelineTop}>
                                            <Text style={styles.periodText}>Kỳ {period.period}</Text>
                                            <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                                                <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.dueDate}>Hạn: {formatDate(period.dueDate)}</Text>
                                        <Text style={styles.dueAmount}>{formatCurrency(period.totalDue)}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={DarkColors.primary}
                        colors={[DarkColors.primary]}
                    />
                }
            >
                {renderHeader()}

                <View style={styles.bodyContainer}>
                    {renderAmountCard()}
                    {renderPaymentReminder()}
                    {renderOutstandingBalance()}
                    {renderLoanInfo()}
                    {renderTimeline()}
                </View>
            </ScrollView>

            {/* Show payment buttons for active loans or when there's outstanding balance */}
            {((outstanding?.totalOutstanding ?? 0) > 0 ||
                ['active', 'on_going', 'success', 'disbursed', 'overdue'].includes(loan?.status || '')) && (
                    <View style={styles.bottomBar}>
                        <TouchableOpacity style={styles.payButton} onPress={handleRepayment}>
                            <LinearGradient
                                colors={['#4347FF', '#6366F1'] as const}
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

            {/* Show Disburse button for waiting loans that are fully funded */}
            {loan?.status === 'waiting' && (loan?.investedNotes ?? 0) >= (loan?.totalNotes ?? 1) && (
                <View style={styles.bottomBar}>
                    <TouchableOpacity style={styles.payButton} onPress={handleDisburse}>
                        <LinearGradient
                            colors={['#2ed573', '#7bed9f'] as const}
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
    },
    scrollContent: {
        paddingBottom: 120,
    },
    // Header
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: DarkColors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: DarkColors.text,
    },
    bodyContainer: {
        paddingHorizontal: 20,
    },
    // Amount Card
    amountCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.xl,
        padding: 24,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
        alignItems: 'center',
    },
    amountLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginBottom: 8,
    },
    amountValue: {
        fontSize: 42,
        fontWeight: '700',
        color: DarkColors.text,
    },
    amountCurrency: {
        fontSize: 24,
        fontWeight: '500',
        color: DarkColors.textSecondary,
    },
    amountMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginLeft: 6,
    },
    metaDivider: {
        width: 1,
        height: 16,
        backgroundColor: DarkColors.border,
        marginHorizontal: 16,
    },
    // Reminder Card
    reminderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 16,
        marginBottom: 16,
    },
    reminderIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reminderContent: {
        marginLeft: 12,
        flex: 1,
    },
    reminderTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2,
    },
    reminderAmount: {
        fontSize: 14,
        color: DarkColors.text,
    },
    // Outstanding Card
    outstandingCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    outstandingMain: {
        alignItems: 'center',
        marginVertical: 16,
    },
    outstandingValue: {
        fontSize: 32,
        fontWeight: '700',
        color: DarkColors.error,
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
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginBottom: 4,
    },
    outstandingItemValue: {
        fontSize: 14,
        fontWeight: '600',
        color: DarkColors.text,
    },
    // Info Card
    infoCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    infoIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        color: DarkColors.textSecondary,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '500',
        color: DarkColors.text,
        marginTop: 2,
    },
    // Timeline
    timelineCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    timelineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    timelineList: {
        marginTop: 16,
    },
    timelineItem: {
        flexDirection: 'row',
    },
    timelineLeft: {
        width: 24,
        alignItems: 'center',
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        zIndex: 1,
    },
    line: {
        width: 2,
        flex: 1,
        backgroundColor: DarkColors.border,
        marginVertical: 4,
    },
    timelineContent: {
        flex: 1,
        paddingBottom: 20,
        paddingLeft: 12,
    },
    timelineTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    periodText: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '500',
    },
    dueDate: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 4,
    },
    dueAmount: {
        fontSize: 14,
        fontWeight: '600',
        color: DarkColors.text,
        marginTop: 4,
    },
    // Bottom Bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: DarkColors.surface,
        padding: 16,
        flexDirection: 'row',
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
    },
    payButton: {
        flex: 1,
        borderRadius: DarkStyling.borderRadius.md,
        overflow: 'hidden',
    },
    payButtonGradient: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    payButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.white,
    },
    prepayButton: {
        flex: 1,
        borderRadius: DarkStyling.borderRadius.md,
        borderWidth: 1,
        borderColor: DarkColors.primary,
        paddingVertical: 16,
        alignItems: 'center',
    },
    prepayButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.primary,
    },
});

export default LoanDetailScreen;
