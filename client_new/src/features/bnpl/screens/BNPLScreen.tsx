import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Modal,
    TextInput,
    Keyboard,
    TouchableWithoutFeedback,
    Animated,
} from 'react-native';
import { View as SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { bnplAPI } from '../api/bnpl.api';
import type { BnplWalletInfo, BnplLoan, ConsolidatedScheduleItem } from '../api/bnpl.api';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, CommonButton, CommonInput, FintechPullToRefresh } from '../../../components';
import { LinearGradient } from 'expo-linear-gradient';
import { formatNumber, parseNumber, formatCurrency } from '../../../shared/utils';
import { useDebounce } from '../../../shared/hooks';

interface PreviewData {
    amount: number;
    numberOfRepayments: number;
    monthlyRate: number;
    annualRate: number;
    monthlyPayment: number;
    totalRepayment: number;
    totalInterest: number;
    interestType: string;
    schedulePreview: Array<{
        period: number;
        principal: number;
        interest: number;
        total: number;
        dueDate: string;
    }>;
}

export default function BNPLScreen() {
    const { theme } = useTheme();
    const [wallet, setWallet] = useState<BnplWalletInfo | null>(null);
    const [loans, setLoans] = useState<BnplLoan[]>([]);
    const [schedule, setSchedule] = useState<ConsolidatedScheduleItem[]>([]);
    const [scheduleSummary, setScheduleSummary] = useState<{ totalMonths: number; totalDue: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [creating, setCreating] = useState(false);

    // Form state
    const [amountRaw, setAmountRaw] = useState('5000000');
    const [loanDescription, setLoanDescription] = useState('');
    const [numberOfRepayments, setNumberOfRepayments] = useState(3);

    // Preview state
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const previewFadeAnim = useRef(new Animated.Value(0)).current;

    // Memoized display value
    const amountDisplay = useMemo(() => formatNumber(parseInt(amountRaw) || 0), [amountRaw]);

    const debouncedResetPreview = useDebounce(() => {
        setPreview(null);
    }, 300);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [walletData, loansData, scheduleData] = await Promise.all([
                bnplAPI.getWallet(),
                bnplAPI.getLoans(),
                bnplAPI.getConsolidatedSchedule(),
            ]);
            setWallet(walletData);
            setLoans(loansData.loans);
            setSchedule(scheduleData.schedule);
            setScheduleSummary(scheduleData.summary);
        } catch (error: any) {
            console.error('Failed to fetch BNPL data:', error);
            // Only show error for critical failures, not for individual API failures
            // Auth errors are handled by interceptor
            if (error.response?.status && error.response.status >= 500) {
                Alert.alert('Lỗi', 'Không thể tải dữ liệu. Vui lòng thử lại sau.');
            }
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    }, []);

    // ==================== PREVIEW HANDLER ====================
    const handlePreview = useCallback(async () => {
        const amount = parseInt(amountRaw) || 0;

        // Client-side validation (server will also validate)
        if (!amount || amount < 500000) {
            Alert.alert('Lỗi', 'Số tiền vay tối thiểu là 500,000 đ');
            return;
        }

        if (amount > 50000000) {
            Alert.alert('Lỗi', 'Số tiền vay tối đa là 50,000,000 đ');
            return;
        }

        // Check available credit before preview (business logic validation)
        if (wallet && amount > wallet.availableCredit) {
            Alert.alert(
                'Vượt hạn mức',
                `Số tiền vay vượt quá hạn mức khả dụng.\nHạn mức còn lại: ${formatCurrency(wallet.availableCredit)}`
            );
            return;
        }

        try {
            setLoadingPreview(true);
            const previewData = await bnplAPI.previewLoan({
                amount,
                numberOfRepayments,
            });
            setPreview(previewData);

            // Fade in animation
            Animated.timing(previewFadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Không thể xem trước khoản vay';
            Alert.alert('Lỗi', errorMessage);
            setPreview(null);
        } finally {
            setLoadingPreview(false);
        }
    }, [amountRaw, numberOfRepayments, wallet]);

    // ==================== CREATE HANDLER ====================
    const handleCreateLoan = useCallback(async () => {
        if (!preview) {
            Alert.alert('Lỗi', 'Vui lòng xem trước khoản vay trước khi tạo');
            return;
        }

        const amount = parseInt(amountRaw) || 0;

        // Re-validate credit limit (may have changed since preview)
        // Server will also validate, but this provides immediate feedback
        if (wallet && amount > wallet.availableCredit) {
            Alert.alert(
                'Vượt hạn mức',
                `Số tiền vay vượt quá hạn mức khả dụng.\nHạn mức còn lại: ${formatCurrency(wallet.availableCredit)}\n\nVui lòng làm mới dữ liệu để kiểm tra lại.`
            );
            // Refresh wallet data
            await fetchData();
            return;
        }

        setCreating(true);
        try {
            const loan = await bnplAPI.createLoan({
                amount,
                description: loanDescription || undefined,
                numberOfRepayments,
            });

            Alert.alert(
                '✅ Thành công',
                `Đã tạo khoản vay ${formatCurrency(loan.principal)}\nTổng phải trả: ${formatCurrency(loan.totalRepayment)}`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            setCreateModalVisible(false);
                            setAmountRaw('5000000');
                            setLoanDescription('');
                            setNumberOfRepayments(3);
                            setPreview(null);
                        },
                    },
                ]
            );

            // Refresh all data after successful creation
            await fetchData();
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'Không thể tạo khoản vay';
            Alert.alert('❌ Lỗi', errorMessage);

            // If credit limit error, refresh wallet data
            if (error.response?.status === 400 && errorMessage.includes('hạn mức')) {
                await fetchData();
            }
        } finally {
            setCreating(false);
        }
    }, [amountRaw, loanDescription, numberOfRepayments, preview, wallet]);

    const formatPercentage = (rate: number) => {
        return `${rate.toFixed(2)}%`;
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <BinanceHeader title="Ví Trả Sau (BNPL)" />
                <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 100 }} />
            </View>
        );
    }

    const progressPercentage = wallet && wallet.creditLimit > 0
        ? Math.min((wallet.usedCredit / wallet.creditLimit) * 100, 100)
        : 0;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader title="Ví Trả Sau (BNPL)" />
            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Wallet Info Card - Premium Design */}
                {wallet && (
                    <CommonCard style={styles.walletCard}>
                        <View style={styles.walletHeader}>
                            <Text style={[styles.walletLabel, { color: theme.colors.textMuted }]}>Hạn mức khả dụng</Text>
                            <View
                                style={[
                                    styles.statusBadge,
                                    {
                                        backgroundColor: theme.colors.successGlass,
                                        borderRadius: theme.radius.sm,
                                    },
                                ]}
                            >
                                <Text style={[styles.statusText, { color: theme.colors.success }]}>{wallet.status}</Text>
                            </View>
                        </View>
                        <Text style={[styles.walletBalance, { color: theme.colors.textPrimary }]}>
                            {formatCurrency(wallet.availableCredit)}
                        </Text>
                        <View style={styles.walletRow}>
                            <View style={styles.walletRowItem}>
                                <Text style={[styles.walletRowLabel, { color: theme.colors.textMuted }]}>Tổng hạn mức</Text>
                                <Text style={[styles.walletRowValue, { color: theme.colors.textPrimary }]}>
                                    {formatCurrency(wallet.creditLimit)}
                                </Text>
                            </View>
                            <View style={[styles.walletRowItemDivider, { backgroundColor: theme.colors.border }]} />
                            <View style={styles.walletRowItem}>
                                <Text style={[styles.walletRowLabel, { color: theme.colors.textMuted }]}>Đã sử dụng</Text>
                                <Text style={[styles.walletRowValue, { color: theme.colors.textPrimary }]}>
                                    {formatCurrency(wallet.usedCredit)}
                                </Text>
                            </View>
                        </View>
                        {/* Enhanced Progress Bar */}
                        <View style={styles.walletProgressContainer}>
                            <View
                                style={[
                                    styles.walletProgressBg,
                                    {
                                        backgroundColor: theme.mode === 'dark'
                                            ? 'rgba(255, 255, 255, 0.1)'
                                            : 'rgba(139, 92, 246, 0.1)',
                                        borderRadius: theme.radius.full,
                                    },
                                ]}
                            >
                                <LinearGradient
                                    colors={
                                        (progressPercentage > 80
                                            ? theme.gradients.error
                                            : progressPercentage > 50
                                                ? theme.gradients.warning
                                                : theme.gradients.primary) as any
                                    }
                                    style={[
                                        styles.walletProgressFill,
                                        {
                                            width: `${progressPercentage}%`,
                                            borderRadius: theme.radius.full,
                                        },
                                    ]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                />
                            </View>
                            <View style={styles.progressLabelRow}>
                                <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>
                                    Đã dùng {progressPercentage.toFixed(0)}%
                                </Text>
                                <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>
                                    Còn lại {formatCurrency(wallet.availableCredit)}
                                </Text>
                            </View>
                        </View>
                    </CommonCard>
                )}

                {/* Create Loan Button */}
                <CommonButton
                    title="Tạo khoản vay mới"
                    onPress={() => setCreateModalVisible(true)}
                    icon="plus-circle"
                    style={styles.createBtn}
                />

                {/* Consolidated Schedule */}
                {schedule.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
                                Lịch trả nợ tháng này
                            </Text>
                            {scheduleSummary && (
                                <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
                                    {scheduleSummary.totalMonths} kỳ
                                </Text>
                            )}
                        </View>
                        <CommonCard style={styles.scheduleCard}>
                            {schedule.map((item, index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.scheduleRow,
                                        index < schedule.length - 1 && { borderBottomColor: theme.colors.border },
                                    ]}
                                >
                                    <View style={styles.scheduleLeft}>
                                        <Text style={[styles.scheduleDate, { color: theme.colors.textPrimary }]}>
                                            {item.dueDate}
                                        </Text>
                                        <Text style={[styles.scheduleMonth, { color: theme.colors.textMuted }]}>
                                            {item.month}
                                        </Text>
                                    </View>
                                    <View style={styles.scheduleRight}>
                                        <Text style={[styles.scheduleAmount, { color: theme.colors.success }]}>
                                            {formatCurrency(item.totalDue)}
                                        </Text>
                                        <Text style={[styles.scheduleDetail, { color: theme.colors.textMuted }]}>
                                            Gốc: {formatCurrency(item.principal)} | Lãi: {formatCurrency(item.interest)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </CommonCard>
                    </>
                )}

                {/* Active Loans */}
                {loans.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
                                Khoản vay đang hoạt động
                            </Text>
                            <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
                                {loans.length} khoản
                            </Text>
                        </View>
                        {loans.map((loan) => (
                            <CommonCard key={loan.id} style={styles.loanCard}>
                                <View style={styles.loanHeader}>
                                    <Text style={[styles.loanId, { color: theme.colors.textMuted }]}>
                                        #{loan.fineractLoanId}
                                    </Text>
                                    <View
                                        style={[
                                            styles.loanStatusBadge,
                                            {
                                                backgroundColor: getStatusColor(loan.status, theme) === theme.colors.success
                                                    ? theme.colors.successGlass
                                                    : theme.colors.warningGlass,
                                                borderRadius: theme.radius.sm,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.loanStatus,
                                                {
                                                    color: getStatusColor(loan.status, theme),
                                                },
                                            ]}
                                        >
                                            {loan.status}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={[styles.loanAmount, { color: theme.colors.textPrimary }]}>
                                    {formatCurrency(loan.principal)}
                                </Text>
                                <View style={styles.loanRow}>
                                    <Text style={[styles.loanLabel, { color: theme.colors.textMuted }]}>Tổng phải trả</Text>
                                    <Text style={[styles.loanValue, { color: theme.colors.textPrimary }]}>
                                        {formatCurrency(loan.totalRepayment)}
                                    </Text>
                                </View>
                                <View style={styles.loanRow}>
                                    <Text style={[styles.loanLabel, { color: theme.colors.textMuted }]}>Đã trả</Text>
                                    <Text style={[styles.loanValue, { color: theme.colors.success }]}>
                                        {formatCurrency(loan.paidAmount)}
                                    </Text>
                                </View>
                                <View style={styles.loanRow}>
                                    <Text style={[styles.loanLabel, { color: theme.colors.textMuted }]}>Còn nợ</Text>
                                    <Text style={[styles.loanValue, { color: theme.colors.error }]}>
                                        {formatCurrency(loan.outstandingBalance)}
                                    </Text>
                                </View>
                            </CommonCard>
                        ))}
                    </>
                )}

                <View style={{ height: 40 }} />
            </FintechPullToRefresh>

            {/* ==================== CREATE LOAN MODAL ==================== */}
            <Modal
                visible={createModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCreateModalVisible(false)}
            >
                <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
                    <BinanceHeader title="Tạo khoản vay BNPL" showBack={false} rightComponents={
                        <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                            <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                    } />
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">

                            {/* Amount Input */}
                            <CommonInput
                                label="Bạn muốn vay bao nhiêu?"
                                value={amountDisplay}
                                onChangeText={(val) => {
                                    const digits = val.replace(/[^0-9]/g, '');
                                    setAmountRaw(digits);
                                    debouncedResetPreview();
                                }}
                                keyboardType="numeric"
                                placeholder="0"
                                error={parseInt(amountRaw) > 50000000 ? 'Vượt hạn mức tối đa' : undefined}
                                icon="cash"
                            />

                            {/* Repayments Selector */}
                            <View style={styles.inputSection}>
                                <View style={styles.inputLabelRow}>
                                    <MaterialCommunityIcons
                                        name="calendar"
                                        size={18}
                                        color={theme.colors.textMuted}
                                        style={styles.inputIcon}
                                    />
                                    <Text style={[styles.inputLabel, { color: theme.colors.textPrimary }]}>Số kỳ trả nợ</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
                                    {[1, 2, 3, 6, 9, 12].map((months) => (
                                        <TouchableOpacity
                                            key={months}
                                            onPress={() => {
                                                setNumberOfRepayments(months);
                                                setPreview(null);
                                            }}
                                            style={[
                                                styles.pill,
                                                {
                                                    backgroundColor:
                                                        numberOfRepayments === months
                                                            ? theme.colors.primaryGlass
                                                            : theme.colors.glassLight,
                                                    borderColor:
                                                        numberOfRepayments === months
                                                            ? theme.colors.primaryBorder
                                                            : theme.colors.border,
                                                    borderRadius: theme.radius.full,
                                                },
                                                numberOfRepayments === months && styles.pillActive,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.pillText,
                                                    {
                                                        color:
                                                            numberOfRepayments === months
                                                                ? theme.colors.primary
                                                                : theme.colors.textSecondary,
                                                    },
                                                    numberOfRepayments === months && styles.pillTextActive,
                                                ]}
                                            >
                                                {months} tháng
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Description (Optional) */}
                            <CommonInput
                                label="Mô tả (tùy chọn)"
                                value={loanDescription}
                                onChangeText={setLoanDescription}
                                placeholder="Ví dụ: Mua điện thoại"
                                icon="text"
                            />

                            {/* ==================== PREVIEW CARD ==================== */}
                            {preview ? (
                                <Animated.View style={{ opacity: previewFadeAnim }}>
                                    <CommonCard style={styles.previewCard}>
                                        <View style={styles.previewHeader}>
                                            <Text style={[styles.previewLabel, { color: theme.colors.textMuted }]}>
                                                Trả hàng tháng
                                            </Text>
                                            <Text style={[styles.previewAmount, { color: theme.colors.success }]}>
                                                {formatCurrency(preview?.monthlyPayment || 0)}
                                            </Text>
                                        </View>
                                        <View style={[styles.dashedLine, { backgroundColor: theme.colors.border }]} />
                                        <View style={styles.previewRow}>
                                            <Text style={[styles.previewRowLabel, { color: theme.colors.textMuted }]}>Lãi suất</Text>
                                            <Text style={[styles.previewRowValue, { color: theme.colors.textPrimary }]}>
                                                {formatPercentage(preview?.monthlyRate || 0)} / tháng
                                            </Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={[styles.previewRowLabel, { color: theme.colors.textMuted }]}>
                                                Tổng lãi dự kiến
                                            </Text>
                                            <Text style={[styles.previewRowValue, { color: theme.colors.textPrimary }]}>
                                                {formatCurrency(preview?.totalInterest || 0)}
                                            </Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={[styles.previewRowLabel, { color: theme.colors.textMuted }]}>
                                                Tổng thanh toán
                                            </Text>
                                            <Text style={[styles.previewRowValue, { color: theme.colors.textPrimary }]}>
                                                {formatCurrency(preview?.totalRepayment || 0)}
                                            </Text>
                                        </View>

                                        {/* Schedule Table */}
                                        {preview.schedulePreview && preview.schedulePreview.length > 0 && (
                                            <View style={styles.scheduleTable}>
                                                <View style={[styles.dashedLine, { backgroundColor: theme.colors.border }]} />
                                                <Text style={[styles.scheduleTableTitle, { color: theme.colors.textPrimary }]}>
                                                    Lịch trả nợ chi tiết
                                                </Text>
                                                <View
                                                    style={[
                                                        styles.scheduleTableHeader,
                                                        {
                                                            backgroundColor: theme.colors.primaryGlass,
                                                            borderRadius: theme.radius.md,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={[styles.scheduleTableHeaderText, { flex: 0.5 }]}>Kỳ</Text>
                                                    <Text style={styles.scheduleTableHeaderText}>Gốc</Text>
                                                    <Text style={styles.scheduleTableHeaderText}>Lãi</Text>
                                                    <Text style={styles.scheduleTableHeaderText}>Tổng</Text>
                                                </View>
                                                {preview.schedulePreview.map((item, idx) => (
                                                    <View
                                                        key={idx}
                                                        style={[
                                                            styles.scheduleTableRow,
                                                            idx % 2 === 0 && {
                                                                backgroundColor: theme.colors.primaryGlass,
                                                            },
                                                        ]}
                                                    >
                                                        <Text style={[styles.scheduleTableCell, { flex: 0.5, color: theme.colors.textPrimary }]}>
                                                            {item.period}
                                                        </Text>
                                                        <Text style={[styles.scheduleTableCell, { color: theme.colors.textPrimary }]}>
                                                            {formatNumber(item.principal)}
                                                        </Text>
                                                        <Text style={[styles.scheduleTableCell, { color: theme.colors.textPrimary }]}>
                                                            {formatNumber(item.interest)}
                                                        </Text>
                                                        <Text
                                                            style={[
                                                                styles.scheduleTableCell,
                                                                {
                                                                    fontFamily: 'Poppins_700Bold',
                                                                    color: theme.colors.success,
                                                                },
                                                            ]}
                                                        >
                                                            {formatNumber(item.total)}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </CommonCard>
                                </Animated.View>
                            ) : (
                                <CommonButton
                                    title="Xem trước khoản vay"
                                    onPress={handlePreview}
                                    loading={loadingPreview}
                                    icon="calculator"
                                    style={styles.previewBtn}
                                />
                            )}

                            <View style={{ height: 120 }} />
                        </ScrollView>
                    </TouchableWithoutFeedback>

                    {/* Footer Submit Button */}
                    {preview && (
                        <View
                            style={[
                                styles.modalFooter,
                                {
                                    backgroundColor: theme.colors.background,
                                    borderTopColor: theme.colors.border,
                                },
                            ]}
                        >
                            <CommonButton
                                title="Xác nhận vay ngay"
                                onPress={handleCreateLoan}
                                loading={creating}
                                icon="arrow-right"
                                style={styles.submitBtn}
                            />
                        </View>
                    )}
                </View>
            </Modal>
        </View >
    );
}

const getStatusColor = (status: string, theme: any): string => {
    switch (status.toLowerCase()) {
        case 'active':
            return theme.colors.success;
        case 'closed':
            return theme.colors.textMuted;
        case 'pending':
            return theme.colors.warning;
        default:
            return theme.colors.textMuted;
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
        width: '100%',
        maxWidth: '100%',
    },
    walletCard: {
        marginBottom: 24,
        width: '100%',
        maxWidth: '100%',
    },
    walletHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    walletLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        flexShrink: 1,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    statusText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    walletBalance: {
        fontSize: 40,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 20,
        letterSpacing: -0.5,
        flexWrap: 'wrap',
    },
    walletRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 12,
    },
    walletRowItem: {
        flex: 1,
        minWidth: 0,
    },
    walletRowItemDivider: {
        width: 1,
        marginHorizontal: 16,
    },
    walletRowLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 6,
        flexShrink: 1,
    },
    walletRowValue: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        flexWrap: 'wrap',
        flexShrink: 0,
    },
    walletProgressContainer: {
        marginTop: 8,
    },
    walletProgressBg: {
        height: 12,
        overflow: 'hidden',
        borderRadius: 6,
    },
    walletProgressFill: {
        height: '100%',
        borderRadius: 6,
    },
    progressLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        gap: 8,
    },
    progressLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        flexShrink: 1,
    },

    // Create Button
    createBtn: {
        marginBottom: 32,
        overflow: 'hidden',
        width: '100%',
        maxWidth: '100%',
    },
    createBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
        paddingHorizontal: 16,
    },
    createBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
        flexShrink: 1,
    },

    // Section
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 8,
        gap: 12,
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        flexShrink: 1,
        flex: 1,
    },
    sectionSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        flexShrink: 0,
    },

    // Schedule Card
    scheduleCard: {
        marginBottom: 24,
        width: '100%',
        maxWidth: '100%',
    },
    scheduleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        gap: 12,
    },
    scheduleLeft: {
        flex: 1,
        minWidth: 0,
    },
    scheduleDate: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
        flexShrink: 1,
    },
    scheduleMonth: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        flexShrink: 1,
    },
    scheduleRight: {
        alignItems: 'flex-end',
        flexShrink: 0,
        marginLeft: 12,
    },
    scheduleAmount: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    scheduleDetail: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        flexShrink: 1,
    },

    // Loan Card
    loanCard: {
        marginBottom: 16,
        width: '100%',
        maxWidth: '100%',
    },
    loanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    loanId: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 1,
    },
    loanStatusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    loanStatus: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    loanAmount: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 16,
        letterSpacing: -0.5,
        flexWrap: 'wrap',
    },
    loanRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        gap: 12,
    },
    loanLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        flexShrink: 1,
        flex: 1,
    },
    loanValue: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 0,
    },

    // ==================== MODAL STYLES ====================
    modalContainer: {
        flex: 1,
    },
    modalScroll: {
        padding: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
        paddingTop: 10,
        gap: 12,
    },
    closeBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        flexShrink: 1,
        flex: 1,
        textAlign: 'center',
    },

    // Input Section
    inputSection: {
        marginBottom: 32,
    },
    inputLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    inputIcon: {
        marginRight: 10,
    },
    inputLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 1,
    },

    // Amount Input
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    amountInput: {
        fontSize: 48,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        minWidth: 100,
    },
    currency: {
        fontSize: 28,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 8,
        marginTop: 12,
    },
    limitText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        marginTop: 10,
        flexShrink: 1,
    },

    // Pills
    pillsContainer: {
        gap: 12,
    },
    pill: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderWidth: 1,
    },
    pillActive: {},
    pillText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        flexShrink: 1,
    },
    pillTextActive: {
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 1,
    },

    // Text Input
    textInput: {
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
    },

    // Preview Card
    previewCard: {
        marginTop: 16,
    },
    previewHeader: {
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 16,
    },
    previewLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 8,
        flexShrink: 1,
    },
    previewAmount: {
        fontSize: 40,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.5,
        flexWrap: 'wrap',
    },
    dashedLine: {
        height: 1,
        marginVertical: 16,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        marginBottom: 4,
        gap: 12,
    },
    previewRowLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        flexShrink: 1,
        flex: 1,
    },
    previewRowValue: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 0,
    },

    // Schedule Table
    scheduleTable: {
        marginTop: 16,
    },
    scheduleTableTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 12,
        marginTop: 8,
        flexShrink: 1,
    },
    scheduleTableHeader: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 8,
        marginBottom: 8,
        gap: 4,
    },
    scheduleTableHeaderText: {
        flex: 1,
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        textTransform: 'uppercase',
        flexShrink: 1,
    },
    scheduleTableRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 8,
        marginBottom: 4,
        gap: 4,
    },
    scheduleTableCell: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        flexShrink: 1,
    },

    // Preview Button
    previewBtn: {
        marginTop: 20,
    },
    previewBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
        paddingHorizontal: 16,
    },
    previewBtnDisabled: {
        opacity: 0.6,
    },
    previewBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
        flexShrink: 1,
    },

    // Modal Footer
    modalFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 30,
        borderTopWidth: 1,
    },
    submitBtn: {},
    submitBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
        paddingHorizontal: 16,
    },
    submitBtnDisabled: {
        opacity: 0.6,
    },
    submitBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
        flexShrink: 1,
    },
});
