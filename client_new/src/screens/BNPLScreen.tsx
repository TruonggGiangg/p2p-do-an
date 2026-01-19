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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { bnplAPI, BnplWalletInfo, BnplLoan, ConsolidatedScheduleItem } from '../services/bnpl.api';

// Format helpers
const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const parseNumber = (str: string): number => parseInt(str.replace(/,/g, ''), 10) || 0;

// Debounce hook
const useDebounce = (callback: () => void, delay: number) => {
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    return useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            callback();
        }, delay);
    }, [callback, delay]);
};

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

    const formatCurrency = (amount: number) => {
        try {
            return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
        } catch {
            return `${formatNumber(amount)} ₫`;
        }
    };

    const formatPercentage = (rate: number) => {
        return `${rate.toFixed(2)}%`;
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 100 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Ví Trả Sau (BNPL)</Text>
                    <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                        <Ionicons name="refresh" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Wallet Info Card */}
                {wallet && (
                    <View style={styles.walletCard}>
                        <View style={styles.walletHeader}>
                            <Text style={styles.walletLabel}>Hạn mức khả dụng</Text>
                            <View style={styles.statusBadge}>
                                <Text style={styles.statusText}>{wallet.status}</Text>
                            </View>
                        </View>
                        <Text style={styles.walletBalance}>{formatCurrency(wallet.availableCredit)}</Text>
                        <View style={styles.walletRow}>
                            <View style={styles.walletRowItem}>
                                <Text style={styles.walletRowLabel}>Tổng hạn mức</Text>
                                <Text style={styles.walletRowValue}>{formatCurrency(wallet.creditLimit)}</Text>
                            </View>
                            <View style={styles.walletRowItemDivider} />
                            <View style={styles.walletRowItem}>
                                <Text style={styles.walletRowLabel}>Đã sử dụng</Text>
                                <Text style={styles.walletRowValue}>{formatCurrency(wallet.usedCredit)}</Text>
                            </View>
                        </View>
                        <View style={styles.walletProgressContainer}>
                            <View style={styles.walletProgressBg}>
                                <View
                                    style={[
                                        styles.walletProgressFill,
                                        {
                                            width: wallet.creditLimit > 0
                                                ? `${Math.min((wallet.usedCredit / wallet.creditLimit) * 100, 100)}%`
                                                : '0%',
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    </View>
                )}

                {/* Create Loan Button */}
                <TouchableOpacity style={styles.createBtn} onPress={() => setCreateModalVisible(true)}>
                    <Ionicons name="add-circle" size={24} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.createBtnText}>Tạo khoản vay mới</Text>
                </TouchableOpacity>

                {/* Consolidated Schedule */}
                {schedule.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Lịch trả nợ tháng này</Text>
                            {scheduleSummary && (
                                <Text style={styles.sectionSubtitle}>{scheduleSummary.totalMonths} kỳ</Text>
                            )}
                        </View>
                        <View style={styles.scheduleCard}>
                            {schedule.map((item, index) => (
                                <View key={index} style={styles.scheduleRow}>
                                    <View style={styles.scheduleLeft}>
                                        <Text style={styles.scheduleDate}>{item.dueDate}</Text>
                                        <Text style={styles.scheduleMonth}>{item.month}</Text>
                                    </View>
                                    <View style={styles.scheduleRight}>
                                        <Text style={styles.scheduleAmount}>{formatCurrency(item.totalDue)}</Text>
                                        <Text style={styles.scheduleDetail}>
                                            Gốc: {formatCurrency(item.principal)} | Lãi: {formatCurrency(item.interest)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* Active Loans */}
                {loans.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Khoản vay đang hoạt động</Text>
                            <Text style={styles.sectionSubtitle}>{loans.length} khoản</Text>
                        </View>
                        {loans.map((loan) => (
                            <View key={loan.id} style={styles.loanCard}>
                                <View style={styles.loanHeader}>
                                    <Text style={styles.loanId}>#{loan.fineractLoanId}</Text>
                                    <Text style={[styles.loanStatus, { color: getStatusColor(loan.status) }]}>
                                        {loan.status}
                                    </Text>
                                </View>
                                <Text style={styles.loanAmount}>{formatCurrency(loan.principal)}</Text>
                                <View style={styles.loanRow}>
                                    <Text style={styles.loanLabel}>Tổng phải trả</Text>
                                    <Text style={styles.loanValue}>{formatCurrency(loan.totalRepayment)}</Text>
                                </View>
                                <View style={styles.loanRow}>
                                    <Text style={styles.loanLabel}>Đã trả</Text>
                                    <Text style={styles.loanValue}>{formatCurrency(loan.paidAmount)}</Text>
                                </View>
                                <View style={styles.loanRow}>
                                    <Text style={styles.loanLabel}>Còn nợ</Text>
                                    <Text style={[styles.loanValue, { color: '#ef4444' }]}>
                                        {formatCurrency(loan.outstandingBalance)}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* ==================== CREATE LOAN MODAL ==================== */}
            <Modal
                visible={createModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCreateModalVisible(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
                            {/* Modal Header */}
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={styles.closeBtn}>
                                    <Ionicons name="close" size={24} color="#fff" />
                                </TouchableOpacity>
                                <Text style={styles.modalTitle}>Tạo khoản vay BNPL</Text>
                                <View style={{ width: 40 }} />
                            </View>

                            {/* Amount Input */}
                            <View style={styles.inputSection}>
                                <View style={styles.inputLabelRow}>
                                    <Ionicons name="cash-outline" size={18} color="rgba(255,255,255,0.7)" style={styles.inputIcon} />
                                    <Text style={styles.inputLabel}>Bạn muốn vay bao nhiêu?</Text>
                                </View>
                                <View style={styles.amountInputWrapper}>
                                    <TextInput
                                        value={amountDisplay}
                                        onChangeText={(val) => {
                                            const digits = val.replace(/[^0-9]/g, '');
                                            setAmountRaw(digits);
                                            debouncedResetPreview();
                                        }}
                                        keyboardType="numeric"
                                        style={styles.amountInput}
                                        placeholder="0"
                                        placeholderTextColor="rgba(255,255,255,0.3)"
                                    />
                                    <Text style={styles.currency}>₫</Text>
                                </View>
                                <Text style={styles.limitText}>Hạn mức: 500,000 - 50,000,000 đ</Text>
                            </View>

                            {/* Repayments Selector */}
                            <View style={styles.inputSection}>
                                <View style={styles.inputLabelRow}>
                                    <Ionicons name="calendar-outline" size={18} color="#fff" style={styles.inputIcon} />
                                    <Text style={styles.inputLabel}>Số kỳ trả nợ</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
                                    {[1, 2, 3, 6, 9, 12].map((months) => (
                                        <TouchableOpacity
                                            key={months}
                                            onPress={() => {
                                                setNumberOfRepayments(months);
                                                setPreview(null);
                                            }}
                                            style={[styles.pill, numberOfRepayments === months && styles.pillActive]}
                                        >
                                            <Text style={[styles.pillText, numberOfRepayments === months && styles.pillTextActive]}>
                                                {months} tháng
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Description (Optional) */}
                            <View style={styles.inputSection}>
                                <View style={styles.inputLabelRow}>
                                    <Ionicons name="document-text-outline" size={18} color="#fff" style={styles.inputIcon} />
                                    <Text style={styles.inputLabel}>Mô tả (tùy chọn)</Text>
                                </View>
                                <TextInput
                                    value={loanDescription}
                                    onChangeText={setLoanDescription}
                                    placeholder="Ví dụ: Mua điện thoại"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    style={styles.textInput}
                                />
                            </View>

                            {/* ==================== PREVIEW CARD ==================== */}
                            {preview ? (
                                <Animated.View style={{ opacity: previewFadeAnim }}>
                                    <View style={styles.previewCard}>
                                        <View style={styles.previewHeader}>
                                            <Text style={styles.previewLabel}>Trả hàng tháng</Text>
                                            <Text style={styles.previewAmount}>{formatCurrency(preview.monthlyPayment)} ₫</Text>
                                        </View>
                                        <View style={styles.dashedLine} />
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewRowLabel}>Lãi suất</Text>
                                            <Text style={styles.previewRowValue}>{formatPercentage(preview.monthlyRate)} / tháng</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewRowLabel}>Tổng lãi dự kiến</Text>
                                            <Text style={styles.previewRowValue}>{formatCurrency(preview.totalInterest)}</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewRowLabel}>Tổng thanh toán</Text>
                                            <Text style={styles.previewRowValue}>{formatCurrency(preview.totalRepayment)}</Text>
                                        </View>

                                        {/* Schedule Table */}
                                        {preview.schedulePreview && preview.schedulePreview.length > 0 && (
                                            <View style={styles.scheduleTable}>
                                                <View style={styles.dashedLine} />
                                                <Text style={styles.scheduleTableTitle}>Lịch trả nợ chi tiết</Text>
                                                <View style={styles.scheduleTableHeader}>
                                                    <Text style={[styles.scheduleTableHeaderText, { flex: 0.5 }]}>Kỳ</Text>
                                                    <Text style={styles.scheduleTableHeaderText}>Gốc</Text>
                                                    <Text style={styles.scheduleTableHeaderText}>Lãi</Text>
                                                    <Text style={styles.scheduleTableHeaderText}>Tổng</Text>
                                                </View>
                                                {preview.schedulePreview.map((item, idx) => (
                                                    <View key={idx} style={[styles.scheduleTableRow, idx % 2 === 0 && styles.scheduleTableRowAlt]}>
                                                        <Text style={[styles.scheduleTableCell, { flex: 0.5 }]}>{item.period}</Text>
                                                        <Text style={styles.scheduleTableCell}>{formatNumber(item.principal)}</Text>
                                                        <Text style={styles.scheduleTableCell}>{formatNumber(item.interest)}</Text>
                                                        <Text style={[styles.scheduleTableCell, { fontWeight: '600', color: '#10b981' }]}>
                                                            {formatNumber(item.total)}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.previewBtn, loadingPreview && styles.previewBtnDisabled]}
                                    onPress={handlePreview}
                                    disabled={loadingPreview}
                                >
                                    {loadingPreview ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="calculator-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                                            <Text style={styles.previewBtnText}>Xem trước khoản vay</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}

                            <View style={{ height: 120 }} />
                        </ScrollView>
                    </TouchableWithoutFeedback>

                    {/* Footer Submit Button */}
                    {preview && (
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
                                onPress={handleCreateLoan}
                                disabled={creating}
                            >
                                {creating ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Text style={styles.submitBtnText}>Xác nhận vay ngay</Text>
                                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
        case 'active':
            return '#10b981';
        case 'closed':
            return '#6b7280';
        case 'pending':
            return '#f59e0b';
        default:
            return '#9ca3af';
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0e27',
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    refreshBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1a1f3a',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Wallet Card
    walletCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#374151',
    },
    walletHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    walletLabel: {
        fontSize: 14,
        color: '#9ca3af',
        fontWeight: '500',
    },
    statusBadge: {
        backgroundColor: '#10b981',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },
    walletBalance: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 16,
    },
    walletRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    walletRowItem: {
        flex: 1,
    },
    walletRowItemDivider: {
        width: 1,
        backgroundColor: '#374151',
        marginHorizontal: 16,
    },
    walletRowLabel: {
        fontSize: 12,
        color: '#9ca3af',
        marginBottom: 4,
    },
    walletRowValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '600',
    },
    walletProgressContainer: {
        marginTop: 4,
    },
    walletProgressBg: {
        height: 8,
        backgroundColor: '#374151',
        borderRadius: 4,
        overflow: 'hidden',
    },
    walletProgressFill: {
        height: '100%',
        backgroundColor: '#3b82f6',
        borderRadius: 4,
    },

    // Create Button
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 16,
        borderRadius: 16,
        marginBottom: 32,
    },
    createBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },

    // Section
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#9ca3af',
    },

    // Schedule Card
    scheduleCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#374151',
    },
    scheduleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2d3748',
    },
    scheduleLeft: {
        flex: 1,
    },
    scheduleDate: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '600',
        marginBottom: 4,
    },
    scheduleMonth: {
        fontSize: 12,
        color: '#9ca3af',
    },
    scheduleRight: {
        alignItems: 'flex-end',
    },
    scheduleAmount: {
        fontSize: 16,
        color: '#10b981',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    scheduleDetail: {
        fontSize: 11,
        color: '#6b7280',
    },

    // Loan Card
    loanCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#374151',
    },
    loanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    loanId: {
        fontSize: 14,
        color: '#9ca3af',
        fontWeight: '600',
    },
    loanStatus: {
        fontSize: 12,
        fontWeight: '600',
    },
    loanAmount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 12,
    },
    loanRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    loanLabel: {
        fontSize: 14,
        color: '#9ca3af',
    },
    loanValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '600',
    },

    // ==================== MODAL STYLES ====================
    modalContainer: {
        flex: 1,
        backgroundColor: '#0a0e27',
    },
    modalScroll: {
        padding: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
        paddingTop: 10,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1a1f3a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },

    // Input Section
    inputSection: {
        marginBottom: 32,
    },
    inputLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    inputIcon: {
        marginRight: 8,
    },
    inputLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },

    // Amount Input
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    amountInput: {
        fontSize: 48,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
        minWidth: 100,
    },
    currency: {
        fontSize: 28,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        marginLeft: 8,
        marginTop: 12,
    },
    limitText: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
        marginTop: 8,
    },

    // Pills
    pillsContainer: {
        gap: 10,
    },
    pill: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    pillActive: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    pillText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
    },
    pillTextActive: {
        color: '#fff',
        fontWeight: '600',
    },

    // Text Input
    textInput: {
        backgroundColor: '#1a1f3a',
        borderWidth: 1,
        borderColor: '#374151',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: '#fff',
    },

    // Preview Card
    previewCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 24,
        padding: 24,
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#374151',
    },
    previewHeader: {
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 16,
    },
    previewLabel: {
        fontSize: 14,
        color: '#9ca3af',
        marginBottom: 8,
    },
    previewAmount: {
        fontSize: 36,
        fontWeight: '700',
        color: '#10b981',
    },
    dashedLine: {
        height: 1,
        backgroundColor: '#374151',
        marginVertical: 16,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        marginBottom: 4,
    },
    previewRowLabel: {
        fontSize: 14,
        color: '#9ca3af',
    },
    previewRowValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },

    // Schedule Table
    scheduleTable: {
        marginTop: 16,
    },
    scheduleTableTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
        marginTop: 8,
    },
    scheduleTableHeader: {
        flexDirection: 'row',
        paddingVertical: 10,
        backgroundColor: '#374151',
        borderRadius: 8,
        paddingHorizontal: 8,
        marginBottom: 8,
    },
    scheduleTableHeaderText: {
        flex: 1,
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    scheduleTableRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 6,
        marginBottom: 2,
    },
    scheduleTableRowAlt: {
        backgroundColor: 'rgba(59,130,246,0.08)',
    },
    scheduleTableCell: {
        flex: 1,
        fontSize: 12,
        color: '#fff',
        textAlign: 'center',
        fontWeight: '500',
    },

    // Preview Button
    previewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 16,
        borderRadius: 16,
        marginTop: 20,
    },
    previewBtnDisabled: {
        opacity: 0.6,
    },
    previewBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },

    // Modal Footer
    modalFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 30,
        backgroundColor: '#0a0e27',
        borderTopWidth: 1,
        borderTopColor: '#374151',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 8,
    },
    submitBtnDisabled: {
        opacity: 0.6,
    },
    submitBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
});
