/**
 * LoanDetailScreen - Displays full loan details including repayment schedule
 * Refactored to match Premium Clean UI style
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
    Platform,
    StatusBar,
} from 'react-native';
import { Text, Surface, Button, Divider } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { loanApi } from '../../services';
import {
    LoanContract,
    FineractLoanDetails,
    OutstandingBalance,
} from '../../types';
import { Colors } from '../../theme';

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
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Đang tải chi tiết...</Text>
            </View>
        );
    }

    const renderHeader = () => (
        <LinearGradient
            colors={[Colors.primary, '#64B5F6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.header}
        >
            <View style={styles.headerTop}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chi Tiết Khoản Vay</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.headerContent}>
                <Text style={styles.contractSubtitle}>Mã Hợp Đồng</Text>
                <Text style={styles.contractId}>
                    {loan?.contractId || `LOAN_${fineractDetails?.fineractLoanId || '???'}`}
                </Text>
            </View>
        </LinearGradient>
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
        let reminderColor = Colors.primary;
        let iconName = 'clock-outline';
        let bg = '#E3F2FD';

        if (daysUntilDue < 0) {
            reminderText = `Đã quá hạn ${Math.abs(daysUntilDue)} ngày`;
            reminderColor = Colors.error;
            iconName = 'alert-circle';
            bg = '#FFEBEE';
        } else if (daysUntilDue === 0) {
            reminderText = 'Hôm nay đáo hạn';
            reminderColor = Colors.warning;
            iconName = 'fire';
            bg = '#FFF8E1';
        } else if (daysUntilDue <= 3) {
            reminderText = `Còn ${daysUntilDue} ngày`;
            reminderColor = Colors.warning;
            bg = '#FFF8E1';
        } else {
            reminderText = `Hạn trả ${daysUntilDue} ngày nữa`;
        }

        return (
            <Surface style={[styles.reminderCard, { backgroundColor: bg }]} elevation={0}>
                <View style={styles.row}>
                    <MaterialCommunityIcons name={iconName} size={24} color={reminderColor} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={[styles.reminderTitle, { color: reminderColor }]}>{reminderText}</Text>
                        <Text style={styles.reminderAmount}>
                            Số tiền: {formatCurrency(nextPeriod.totalDue)}
                        </Text>
                    </View>
                </View>
            </Surface>
        );
    };

    const renderInfoRow = (icon: string, label: string, value: string) => (
        <View style={styles.infoRow}>
            <View style={styles.iconBox}>
                <MaterialCommunityIcons name={icon} size={20} color={Colors.textSecondary} />
            </View>
            <View style={styles.infoContent}>
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
            : 'Chờ giải ngân';
        const rate = fineractDetails?.interestRate?.perPeriod || loan?.info?.rate || 0;

        return (
            <Surface style={styles.card} elevation={1}>
                <Text style={styles.cardTitle}>Thông tin chung</Text>
                <Divider style={styles.divider} />

                {renderInfoRow('cash', 'Số tiền vay', formatCurrency(principal))}
                {renderInfoRow('calendar-clock', 'Thời gian vay', `${periods} tháng`)}
                {renderInfoRow('calendar-check', 'Ngày giải ngân', disbursement)}
                {renderInfoRow('target', 'Mục đích vay', loan?.info?.willing || 'Tiêu dùng')}
                {renderInfoRow('percent', 'Lãi suất', `${rate}% / tháng`)}

                {outstanding && (
                    <View style={styles.outstandingBox}>
                        <Text style={styles.outstandingTitle}>Tổng dư nợ hiện tại</Text>
                        <Text style={styles.outstandingValue}>{formatCurrency(outstanding.totalOutstanding)}</Text>
                        <View style={styles.rowBetween}>
                            <Text style={styles.subText}>Gốc còn lại: {formatCurrency(outstanding.principalOutstanding)}</Text>
                            <Text style={styles.subText}>Lãi chưa trả: {formatCurrency(outstanding.interestOutstanding)}</Text>
                        </View>
                    </View>
                )}
            </Surface>
        );
    };

    const renderTimeline = () => {
        const periods = fineractDetails?.repaymentSchedule?.periods || [];
        const filteredPeriods = periods.filter(p => p.period > 0);

        if (filteredPeriods.length === 0) return null;

        return (
            <Surface style={styles.card} elevation={1}>
                <TouchableOpacity
                    style={styles.rowBetween}
                    onPress={() => setTimelineCollapsed(!timelineCollapsed)}
                >
                    <Text style={styles.cardTitle}>Lịch thanh toán ({filteredPeriods.length} kỳ)</Text>
                    <MaterialCommunityIcons
                        name={timelineCollapsed ? "chevron-down" : "chevron-up"}
                        size={24}
                        color={Colors.textSecondary}
                    />
                </TouchableOpacity>
                <Divider style={styles.divider} />

                {!timelineCollapsed && (
                    <View style={{ marginTop: 8 }}>
                        {filteredPeriods.map((period, index) => {
                            const isCompleted = period.complete;
                            const isNext = !isCompleted && getNextUnpaidPeriod()?.period === period.period;

                            return (
                                <View key={index} style={styles.timelineItem}>
                                    <View style={styles.timelineLeft}>
                                        <View style={[styles.dot, isCompleted ? styles.dotSuccess : (isNext ? styles.dotActive : styles.dotPending)]} />
                                        {index < filteredPeriods.length - 1 && <View style={styles.line} />}
                                    </View>
                                    <View style={styles.timelineContent}>
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.periodText}>Kỳ {period.period}</Text>
                                            <Text style={[styles.statusText, isCompleted ? { color: Colors.success } : (isNext ? { color: Colors.warning } : {})]}>
                                                {isCompleted ? 'Đã trả' : (isNext ? 'Sắp đến hạn' : 'Chưa đến hạn')}
                                            </Text>
                                        </View>
                                        <Text style={styles.dueDate}>Hạn: {formatDate(period.dueDate)}</Text>
                                        <Text style={styles.dueAmount}>{formatCurrency(period.totalDue)}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </Surface>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
            >
                {renderHeader()}

                <View style={styles.bodyContainer}>
                    {renderPaymentReminder()}
                    {renderLoanInfo()}
                    {renderTimeline()}
                </View>
            </ScrollView>

            {outstanding && outstanding.totalOutstanding > 0 && (
                <Surface style={styles.bottomBar} elevation={4}>
                    <Button
                        mode="contained"
                        onPress={handleRepayment}
                        style={styles.payButton}
                        labelStyle={styles.payButtonLabel}
                    >
                        Thanh Toán
                    </Button>
                    <Button
                        mode="outlined"
                        onPress={handlePrepay}
                        style={styles.prepayButton}
                        labelStyle={{ fontFamily: 'Poppins_600SemiBold', color: Colors.primary }}
                    >
                        Tất Toán
                    </Button>
                </Surface>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontFamily: 'Poppins_400Regular',
        color: Colors.textSecondary,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    header: {
        paddingTop: 50,
        paddingBottom: 40,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    backBtn: {
        padding: 4,
    },
    headerTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        color: '#fff',
    },
    headerContent: {
        alignItems: 'center',
    },
    contractSubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
    },
    contractId: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 20,
        color: '#fff',
        letterSpacing: 1,
    },
    bodyContainer: {
        marginTop: -30,
        paddingHorizontal: 20,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
    },
    reminderCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    reminderTitle: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 16,
        marginBottom: 4,
    },
    reminderAmount: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
        color: Colors.text,
    },
    cardTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        color: Colors.text,
    },
    divider: {
        marginVertical: 12,
        backgroundColor: '#F5F5F5',
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'center',
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    infoValue: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
        color: Colors.text,
    },
    outstandingBox: {
        marginTop: 8,
        padding: 16,
        backgroundColor: '#F7F9FC',
        borderRadius: 12,
    },
    outstandingTitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    outstandingValue: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 24,
        color: Colors.error,
        textAlign: 'center',
        marginVertical: 4,
    },
    subText: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 11,
        color: Colors.textSecondary,
    },
    // Timeline
    timelineItem: {
        flexDirection: 'row',
        marginBottom: 0,
    },
    timelineLeft: {
        width: 30,
        alignItems: 'center',
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        zIndex: 1,
        borderWidth: 2,
        borderColor: '#fff',
    },
    dotSuccess: {
        backgroundColor: Colors.success,
    },
    dotActive: {
        backgroundColor: Colors.warning,
    },
    dotPending: {
        backgroundColor: '#E0E0E0',
    },
    line: {
        width: 2,
        flex: 1,
        backgroundColor: '#F0F0F0',
        marginVertical: -2,
    },
    timelineContent: {
        flex: 1,
        paddingBottom: 24,
        paddingLeft: 8,
    },
    periodText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
        color: Colors.text,
    },
    statusText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    dueDate: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    dueAmount: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
        color: Colors.text,
        marginTop: 4,
    },
    // Bottom Bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: 16,
        flexDirection: 'row',
        gap: 12,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    payButton: {
        flex: 1,
        borderRadius: 12,
        backgroundColor: Colors.primary,
    },
    payButtonLabel: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        paddingVertical: 4,
    },
    prepayButton: {
        flex: 1,
        borderRadius: 12,
        borderColor: Colors.primary,
    },
});

export default LoanDetailScreen;
