/**
 * LoanDetailScreen - Displays full loan details including repayment schedule
 * Refactored to match @p2p UI style
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Alert,
    Platform,
    StatusBar,
    Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { loanApi } from '../../services';
import {
    LoanContract,
    FineractLoanDetails,
    OutstandingBalance,
    RepaymentSchedulePeriod,
} from '../../types';

// Colors based on @p2p theme
const COLORS = {
    primaryGradientStart: '#1AA5A5',
    primaryGradientEnd: '#26C6DA',
    background: '#F5F5F5',
    card: '#FFFFFF',
    text: '#333333',
    textLight: '#666666',
    border: '#E0E0E0',
    success: '#4CAF50',
    warning: '#FF9800',
    danger: '#F44336',
    info: '#2196F3',
    teal: '#00B4B4',
};

// Format currency
const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return '0 đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
    }).format(value);
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
            // Get basic loan info
            if (contractId) {
                const loanData = await loanApi.getLoanDetail(contractId);
                setLoan(loanData);
            }

            // Get Fineract details
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
                } catch (e) {
                    console.log('Could not fetch outstanding balance:', e);
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

    // Helper to get next unpaid period
    const getNextUnpaidPeriod = () => {
        if (!fineractDetails?.repaymentSchedule?.periods) return null;
        return fineractDetails.repaymentSchedule.periods.find(p => !p.complete && p.period > 0);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.teal} />
                <Text style={styles.loadingText}>Đang tải chi tiết khoản vay...</Text>
            </View>
        );
    }

    const renderHeader = () => (
        <LinearGradient
            colors={[COLORS.primaryGradientStart, COLORS.primaryGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.header}
        >
            <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
            >
                <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Chi Tiết Khoản Vay</Text>
            <Text style={styles.contractSubtitle}>Mã hợp đồng</Text>
            <Text style={styles.contractId}>
                {loan?.contractId || `LOAN_${fineractDetails?.fineractLoanId || '???'}`}
            </Text>
        </LinearGradient>
    );

    const renderPaymentReminder = () => {
        if (!fineractDetails) {
            if (!loading && loan) {
                return (
                    <View style={[styles.reminderContainer, { borderLeftColor: COLORS.info }]}>
                        <View style={styles.reminderContent}>
                            <MaterialCommunityIcons name="cloud-sync" size={20} color={COLORS.info} />
                            <Text style={[styles.reminderText, { color: COLORS.info }]}>
                                Đang đồng bộ dữ liệu
                            </Text>
                        </View>
                        <Text style={styles.reminderSubtext}>
                            Dữ liệu chi tiết từ hệ thống lõi chưa sẵn sàng.
                        </Text>
                    </View>
                );
            }
            return null;
        }

        const nextPeriod = getNextUnpaidPeriod();
        if (!nextPeriod) return null;

        const dueDateArr = nextPeriod.dueDate; // [year, month, day]
        if (!dueDateArr || dueDateArr.length < 3) return null;

        const dueDate = new Date(dueDateArr[0], dueDateArr[1] - 1, dueDateArr[2]);
        const today = new Date();
        // Reset time parts for accurate day diff
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let reminderText = '';
        let reminderColor = COLORS.teal;
        let iconName = 'clock-outline';

        if (daysUntilDue < 0) {
            reminderText = `⚠️ Quá hạn ${Math.abs(daysUntilDue)} ngày`;
            reminderColor = COLORS.danger;
            iconName = 'alert-circle';
        } else if (daysUntilDue === 0) {
            reminderText = '🔥 Hôm nay là ngày đáo hạn';
            reminderColor = COLORS.warning;
            iconName = 'fire';
        } else if (daysUntilDue <= 3) {
            reminderText = `⏰ Còn ${daysUntilDue} ngày đến hạn`;
            reminderColor = COLORS.warning;
        } else {
            reminderText = `📅 Còn ${daysUntilDue} ngày đến hạn`;
        }

        return (
            <View style={[styles.reminderContainer, { borderLeftColor: reminderColor }]}>
                <View style={styles.reminderContent}>
                    <MaterialCommunityIcons name={iconName} size={20} color={reminderColor} />
                    <Text style={[styles.reminderText, { color: reminderColor }]}>
                        {reminderText}
                    </Text>
                </View>
                <Text style={styles.reminderSubtext}>
                    {daysUntilDue < 0
                        ? 'Vui lòng thanh toán ngay để tránh phí phạt'
                        : 'Số tiền: ' + formatCurrency(nextPeriod.totalDue)}
                </Text>
            </View>
        );
    };

    const renderInfoRow = (icon: string, label: string, value: string) => (
        <View style={styles.infoRow}>
            <View style={styles.infoItemIcon}>
                <MaterialCommunityIcons name={icon} size={20} color="#666" />
            </View>
            <View style={styles.infoItemContent}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
            </View>
        </View>
    );

    const renderLoanInfo = () => {
        const principal = fineractDetails?.principal || loan?.info?.capital || 0;
        const periods = fineractDetails?.numberOfRepayments || loan?.info?.periodMonth || 0;
        const disbursement = fineractDetails?.timeline?.actualDisbursementDate
            ? formatDate(fineractDetails.timeline.actualDisbursementDate)
            : (loan?.info?.disbursementDate ? formatDate(new Date(loan.info.disbursementDate).toISOString()) : 'Chưa giải ngân');

        const rate = fineractDetails?.interestRate?.perPeriod || loan?.info?.rate || 0;

        // Approx monthly pay calculation if not available directly
        // const monthlyPay = ...

        return (
            <View style={styles.card}>
                {renderInfoRow('cash', 'Số tiền vay', formatCurrency(principal))}
                {renderInfoRow('calendar-clock', 'Thời gian', `${periods} tháng`)}
                {renderInfoRow('calendar-check', 'Ngày giải ngân', disbursement)}
                {renderInfoRow('bullseye-arrow', 'Mục đích vay', loan?.info?.willing || 'Tiêu dùng')}
                {renderInfoRow('percent', 'Lãi suất', `${rate}% / tháng`)}

                {/* Outstanding summary if available */}
                {outstanding && (
                    <View style={styles.outstandingSummary}>
                        <View style={styles.divider} />
                        <View style={styles.rowBetween}>
                            <Text style={styles.summaryLabel}>Dư nợ gốc:</Text>
                            <Text style={styles.summaryValue}>{formatCurrency(outstanding.principalOutstanding)}</Text>
                        </View>
                        <View style={styles.rowBetween}>
                            <Text style={styles.summaryLabel}>Dư nợ lãi:</Text>
                            <Text style={styles.summaryValue}>{formatCurrency(outstanding.interestOutstanding)}</Text>
                        </View>
                        <View style={[styles.rowBetween, { marginTop: 8 }]}>
                            <Text style={[styles.summaryLabel, { fontWeight: 'bold', color: COLORS.text }]}>Tổng phải trả:</Text>
                            <Text style={[styles.summaryValue, { color: COLORS.danger, fontWeight: 'bold' }]}>
                                {formatCurrency(outstanding.totalOutstanding)}
                            </Text>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderTimeline = () => {
        const periods = fineractDetails?.repaymentSchedule?.periods || [];
        const filteredPeriods = periods.filter(p => p.period > 0);

        if (filteredPeriods.length === 0) return null;

        return (
            <View style={styles.timelineContainer}>
                <TouchableOpacity
                    style={styles.timelineHeader}
                    onPress={() => setTimelineCollapsed(!timelineCollapsed)}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="timeline-text-outline" size={24} color="#666" />
                    <View style={styles.timelineHeaderContent}>
                        <Text style={styles.timelineHeaderText}>Lịch thanh toán</Text>
                        <Text style={styles.timelineSubtitle}>
                            {filteredPeriods.length} kỳ • {filteredPeriods.filter(p => p.complete).length} đã trả
                        </Text>
                    </View>
                    <MaterialCommunityIcons
                        name={timelineCollapsed ? "chevron-down" : "chevron-up"}
                        size={24}
                        color="#666"
                    />
                </TouchableOpacity>

                {!timelineCollapsed && (
                    <View style={styles.timelineContent}>
                        {filteredPeriods.map((period, index) => {
                            const isCompleted = period.complete;
                            const isNext = !isCompleted && getNextUnpaidPeriod()?.period === period.period;

                            let statusColor = COLORS.textLight;
                            let statusIcon = 'circle-outline';
                            let statusText = 'Chưa đến hạn';

                            if (isCompleted) {
                                statusColor = COLORS.success;
                                statusIcon = 'check-circle';
                                statusText = 'Đã thanh toán';
                            } else if (isNext) {
                                statusColor = COLORS.warning;
                                statusIcon = 'clock-alert-outline';
                                statusText = 'Cần thanh toán';
                            }

                            return (
                                <View key={index} style={styles.timelineItem}>
                                    {/* Left Status Line */}
                                    <View style={styles.timelineLeft}>
                                        <View style={[styles.timelineDot, { backgroundColor: isCompleted ? COLORS.success : (isNext ? COLORS.warning : '#E0E0E0') }]}>
                                            <MaterialCommunityIcons name={statusIcon} size={14} color="#fff" />
                                        </View>
                                        {index < filteredPeriods.length - 1 && (
                                            <View style={[styles.timelineLine, { backgroundColor: isCompleted ? COLORS.success : '#E0E0E0' }]} />
                                        )}
                                    </View>

                                    {/* Right Content Card */}
                                    <View style={styles.timelineRight}>
                                        <View style={[styles.timelineCard, isNext && styles.timelineCardActive]}>
                                            <View style={styles.timelineCardHeader}>
                                                <Text style={styles.timelinePeriodText}>Kỳ {period.period}</Text>
                                                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                                                    <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                                                </View>
                                            </View>

                                            <View style={styles.rowBetween}>
                                                <Text style={styles.timelineLabel}>Hạn trả:</Text>
                                                <Text style={styles.timelineValue}>{formatDate(period.dueDate)}</Text>
                                            </View>

                                            <View style={[styles.rowBetween, { marginTop: 4 }]}>
                                                <Text style={styles.timelineLabel}>Số tiền:</Text>
                                                <Text style={[styles.timelineValue, { fontWeight: 'bold' }]}>
                                                    {formatCurrency(period.totalDue)}
                                                </Text>
                                            </View>

                                            <View style={styles.breakdownRow}>
                                                <Text style={styles.breakdownText}>Gốc: {formatCurrency(period.principalDue)}</Text>
                                                <Text style={styles.breakdownText}> • </Text>
                                                <Text style={styles.breakdownText}>Lãi: {formatCurrency(period.interestDue)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>
        );
    };

    const renderActionButtons = () => {
        const canPay = outstanding && outstanding.totalOutstanding > 0;

        return (
            <View style={styles.actionContainer}>
                {canPay && (
                    <>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.primaryButton]}
                            onPress={handleRepayment}
                        >
                            <MaterialCommunityIcons name="credit-card-outline" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>THANH TOÁN</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, styles.secondaryButton]}
                            onPress={handlePrepay}
                        >
                            <MaterialCommunityIcons name="cash-fast" size={20} color={COLORS.teal} />
                            <Text style={[styles.actionButtonText, { color: COLORS.teal }]}>TẤT TOÁN SỚM</Text>
                        </TouchableOpacity>
                    </>
                )}

                {!canPay && (
                    <View style={styles.completedBanner}>
                        <MaterialCommunityIcons name="check-decagram" size={32} color={COLORS.success} />
                        <Text style={styles.completedText}>Khoản vay đã hoàn tất</Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Custom Status Bar to match gradient */}
            <StatusBar backgroundColor={COLORS.primaryGradientStart} barStyle="light-content" />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {renderHeader()}
                <View style={styles.contentBody}>
                    {renderPaymentReminder()}
                    {renderLoanInfo()}
                    {renderTimeline()}
                </View>
            </ScrollView>

            {/* Bottom Actions Fixed */}
            {outstanding && outstanding.totalOutstanding > 0 && (
                <View style={styles.bottomActions}>
                    {renderActionButtons()}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        paddingBottom: 100, // Space for fixed bottom buttons
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: COLORS.textLight,
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 20,
        paddingBottom: 30,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
    },
    backBtn: {
        marginBottom: 10,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    contractSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
    },
    contractId: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    contentBody: {
        paddingHorizontal: 16,
        marginTop: -20, // Overlap header
    },
    // Payment Reminder
    reminderContainer: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderLeftWidth: 4,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    reminderContent: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    reminderText: {
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
    reminderSubtext: {
        color: COLORS.textLight,
        fontSize: 14,
        marginLeft: 28,
    },
    // Card Styles
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    infoItemIcon: {
        width: 30,
        alignItems: 'center',
        paddingTop: 2,
    },
    infoItemContent: {
        flex: 1,
        marginLeft: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        paddingBottom: 8,
    },
    infoLabel: {
        fontSize: 12,
        color: COLORS.textLight,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 15,
        color: COLORS.text,
        fontWeight: '600',
    },
    outstandingSummary: {
        marginTop: 8,
    },
    divider: {
        height: 1,
        backgroundColor: '#f0f0f0',
        marginBottom: 12,
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    summaryLabel: {
        fontSize: 14,
        color: COLORS.textLight,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.text,
    },
    // Timeline
    timelineContainer: {
        marginBottom: 16,
    },
    timelineHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 8,
        elevation: 2,
    },
    timelineHeaderContent: {
        flex: 1,
        marginLeft: 12,
    },
    timelineHeaderText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    timelineSubtitle: {
        fontSize: 12,
        color: COLORS.textLight,
    },
    timelineContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        paddingLeft: 8,
    },
    timelineItem: {
        flexDirection: 'row',
    },
    timelineLeft: {
        alignItems: 'center',
        width: 30,
    },
    timelineDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
        marginTop: 2,
    },
    timelineLine: {
        width: 2,
        flex: 1,
        marginVertical: 4,
    },
    timelineRight: {
        flex: 1,
        paddingLeft: 10,
        paddingBottom: 24,
    },
    timelineCard: {
        backgroundColor: '#F8F9FA',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#eee',
    },
    timelineCardActive: {
        borderColor: COLORS.warning,
        backgroundColor: '#FFF8E1',
    },
    timelineCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    timelinePeriodText: {
        fontWeight: 'bold',
        color: COLORS.text,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    statusText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    timelineLabel: {
        fontSize: 12,
        color: COLORS.textLight,
    },
    timelineValue: {
        fontSize: 13,
        color: COLORS.text,
    },
    breakdownRow: {
        flexDirection: 'row',
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    breakdownText: {
        fontSize: 11,
        color: COLORS.textLight,
    },
    // Bottom Actions
    bottomActions: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: 16,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    actionContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
    },
    primaryButton: {
        backgroundColor: COLORS.teal,
    },
    secondaryButton: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: COLORS.teal,
    },
    actionButtonText: {
        fontWeight: 'bold',
        fontSize: 14,
        color: '#fff',
    },
    completedBanner: {
        alignItems: 'center',
        padding: 10,
    },
    completedText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.success,
        marginTop: 4,
    },
});

export default LoanDetailScreen;
