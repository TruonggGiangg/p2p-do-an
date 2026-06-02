import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    Modal,
    Keyboard,
    Animated,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { bnplAPI } from '../api/bnpl.api';
import type { BnplWalletInfo, BnplLoan, BnplTransaction, ConsolidatedScheduleItem, DelinquencyPolicyItem } from '../api/bnpl.api';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { BinanceHeader, CommonCard, CommonButton, CommonInput, FintechPullToRefresh, FintechScreenSkeleton, useConfirmModal } from '../../../components';
import { LinearGradient } from 'expo-linear-gradient';
import { formatNumber, parseNumber, formatCurrency } from '../../../shared/utils';
import { useDebounce } from '../../../shared/hooks';
import type { BnplApplication } from '../api/bnpl.api';

// ── Membership Tier ──────────────────────────────────────────────────────────
const TIERS = [
    { key: 'dong', label: 'Hạng Đồng', icon: 'medal-outline' as const, color: '#CD7F32', limit: 2_000_000, minSpend: 0 },
    { key: 'bac', label: 'Hạng Bạc', icon: 'medal' as const, color: '#9E9E9E', limit: 5_000_000, minSpend: 5_000_000 },
    { key: 'vang', label: 'Hạng Vàng', icon: 'star-circle' as const, color: '#CDEA2D', limit: 10_000_000, minSpend: 20_000_000 },
    { key: 'kimcuong', label: 'Kim Cương', icon: 'diamond-stone' as const, color: '#81D4FA', limit: 20_000_000, minSpend: 50_000_000 },
];

const BNPL_PURPOSE_OPTIONS = ['Tiêu dùng', 'Mua sắm', 'Du lịch', 'Giáo dục', 'Y tế', 'Khác'];

function getTier(creditLimit: number) {
    if (creditLimit <= 2_000_000) return TIERS[0];
    if (creditLimit <= 5_000_000) return TIERS[1];
    if (creditLimit <= 10_000_000) return TIERS[2];
    return TIERS[3];
}

interface PreviewData {
    amount: number;
    numberOfRepayments: number;
    monthlyRate: number;
    annualRate: number;
    monthlyPayment: number;
    totalRepayment: number;
    totalInterest: number;
    totalFees: number;
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
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const modal = useConfirmModal();
    const [wallet, setWallet] = useState<BnplWalletInfo | null>(null);
    const [loans, setLoans] = useState<BnplLoan[]>([]);
    const [schedule, setSchedule] = useState<ConsolidatedScheduleItem[]>([]);
    const [scheduleSummary, setScheduleSummary] = useState<{ totalMonths: number; totalDue: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [creating, setCreating] = useState(false);
    const creatingRef = useRef(false);
    const [balanceVisible, setBalanceVisible] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [successLoan, setSuccessLoan] = useState<BnplLoan | null>(null);
    const [currentApplication, setCurrentApplication] = useState<BnplApplication | null>(null);
    // BNPL flow state machine
    type BnplFlowStatus = 'loading' | 'no_wallet' | 'registration' | 'pending_approval' | 'pending_signature' | 'active';
    const [bnplStatus, setBnplStatus] = useState<BnplFlowStatus>('loading');
    const [menuVisible, setMenuVisible] = useState(false);
    // Registration form
    const [regForm, setRegForm] = useState({
        fullName: user?.name || `${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim(),
        cccd: '',
        address: '',
        purpose: '',
        occupation: '',
        income: '',
    });
    const [submittingReg, setSubmittingReg] = useState(false);
    // Terms & signature
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [signatureChecked, setSignatureChecked] = useState(false);
    const [delinquencyPolicies, setDelinquencyPolicies] = useState<DelinquencyPolicyItem[]>([]);

    // Form state
    const [amountRaw, setAmountRaw] = useState('5000000');
    const [loanPurpose, setLoanPurpose] = useState('Mua sắm');
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

    // Auto-fetch preview silently when amount or repayments change
    useEffect(() => {
        const amount = parseInt(amountRaw) || 0;
        if (amount >= 500000 && amount <= 50000000 && wallet && amount <= wallet.availableCredit) {
            const timer = setTimeout(async () => {
                try {
                    setLoadingPreview(true);
                    const previewData = await bnplAPI.previewLoan({
                        amount,
                        numberOfRepayments,
                    });
                    setPreview(previewData);
                    Animated.timing(previewFadeAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                    }).start();
                } catch (error) {
                    console.warn('Silent preview failed:', error);
                } finally {
                    setLoadingPreview(false);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setPreview(null);
        }
    }, [amountRaw, numberOfRepayments, wallet]);

    useEffect(() => {
        fetchData();
        fetchDelinquencyPolicies();
    }, []);

    const fetchDelinquencyPolicies = async () => {
        const policies = await bnplAPI.getDelinquencyPolicies();
        setDelinquencyPolicies((policies || []).sort((a, b) => a.debt_group - b.debt_group));
    };

    const fetchData = async () => {
        const MIN_DISPLAY_MS = 1700;
        const minDelay = new Promise(resolve => setTimeout(resolve, MIN_DISPLAY_MS));
        try {
            await Promise.all([
                minDelay,
                (async () => {
                    let walletData = null;
                    let loansData: { loans: BnplLoan[] } = { loans: [] };
                    let scheduleData: { schedule: ConsolidatedScheduleItem[]; summary: { totalMonths: number; totalDue: number } } = { schedule: [], summary: { totalMonths: 0, totalDue: 0 } };
                    let transData: { transactions: BnplTransaction[] } = { transactions: [] };
                    let applicationData = null;

                    try {
                        walletData = await bnplAPI.getWallet();
                    } catch (e) {
                        console.warn('getWallet failed, using mock');
                    }
                    try {
                        loansData = await bnplAPI.getLoans();
                    } catch (e) {}
                    try {
                        scheduleData = await bnplAPI.getConsolidatedSchedule();
                    } catch (e) {}
                    try {
                        transData = await bnplAPI.getTransactions(20);
                    } catch (e) {}
                    try {
                        applicationData = await bnplAPI.getCurrentApplication();
                    } catch (e) {}

                    setWallet(walletData || {
                        id: "mock-wallet-id",
                        creditLimit: 10000000,
                        usedCredit: 0,
                        availableCredit: 10000000,
                        balance: 10000000,
                        status: "active",
                        activeLoansCount: 0
                    });
                    setLoans(loansData?.loans || []);
                    setSchedule(scheduleData?.schedule || []);
                    setScheduleSummary(scheduleData?.summary || { totalMonths: 0, totalDue: 0 });
                    setTransactions(transData?.transactions || []);
                    setCurrentApplication(applicationData);

                    if (applicationData) {
                        setRegForm(prev => ({
                            ...prev,
                            address: applicationData.address || prev.address,
                            occupation: applicationData.occupation || prev.occupation,
                            purpose: applicationData.purpose || prev.purpose,
                            income: applicationData.income != null ? String(applicationData.income) : prev.income,
                        }));
                    }

                    // Bỏ qua hồ sơ duyệt mặc định cho vào màn hình Ví trả sau luôn
                    setBnplStatus('active');
                })()
            ]);
        } catch (error: any) {
            console.error('Failed to fetch BNPL data:', error);
            setWallet({
                id: "mock-wallet-id",
                creditLimit: 10000000,
                usedCredit: 0,
                availableCredit: 10000000,
                balance: 10000000,
                status: "active",
                activeLoansCount: 0
            });
            setBnplStatus('active');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
    }, []);

    // ==================== PREVIEW HANDLER ====================
    const handlePreview = useCallback(async () => {
        const amount = parseInt(amountRaw) || 0;

        // Client-side validation (server will also validate)
        if (!amount || amount < 500000) {
            modal.error('Lỗi', 'Số tiền vay tối thiểu là 500,000 đ');
            return;
        }

        if (amount > 50000000) {
            modal.error('Lỗi', 'Số tiền vay tối đa là 50,000,000 đ');
            return;
        }

        // Check available credit before preview (business logic validation)
        if (wallet && amount > wallet.availableCredit) {
            modal.error(
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
            modal.error('Lỗi', errorMessage);
            setPreview(null);
        } finally {
            setLoadingPreview(false);
        }
    }, [amountRaw, numberOfRepayments, wallet]);

    // ==================== CREATE HANDLER ====================
    const handleCreateLoan = useCallback(async () => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        setCreating(true);
        const amount = parseInt(amountRaw) || 0;
        let currentPreview = preview;

        if (!currentPreview) {
            if (!amount || amount < 500000) {
                modal.error('Lỗi', 'Số tiền vay tối thiểu là 500,000 đ');
                creatingRef.current = false;
                setCreating(false);
                return;
            }

            if (amount > 50000000) {
                modal.error('Lỗi', 'Số tiền vay tối đa là 50,000,000 đ');
                creatingRef.current = false;
                setCreating(false);
                return;
            }

            if (wallet && amount > wallet.availableCredit) {
                modal.error(
                    'Vượt hạn mức',
                    `Số tiền vay vượt quá hạn mức khả dụng.\nHạn mức còn lại: ${formatCurrency(wallet.availableCredit)}`
                );
                creatingRef.current = false;
                setCreating(false);
                return;
            }

            try {
                setCreating(true);
                currentPreview = await bnplAPI.previewLoan({
                    amount,
                    numberOfRepayments,
                });
                setPreview(currentPreview);
            } catch (error: any) {
                const errorMessage = error.response?.data?.message || 'Không thể xem trước khoản vay';
                modal.error('Lỗi', errorMessage);
                creatingRef.current = false;
                setCreating(false);
                return;
            }
        }

        // Re-validate credit limit (may have changed since preview)
        if (wallet && amount > wallet.availableCredit) {
            modal.error(
                'Vượt hạn mức',
                `Số tiền vay vượt quá hạn mức khả dụng.\nHạn mức còn lại: ${formatCurrency(wallet.availableCredit)}\n\nVui lòng làm mới dữ liệu để kiểm tra lại.`
            );
            await fetchData();
            creatingRef.current = false;
            setCreating(false);
            return;
        }

        setCreating(true);
        try {
            const loan = await bnplAPI.createLoan({
                amount,
                description: loanDescription || undefined,
                purpose: loanPurpose || undefined,
                numberOfRepayments,
            });

            modal.show({
                title: 'Thành công',
                message: `Đã tạo khoản vay ${formatCurrency(loan.principal)}\nTổng phải trả: ${formatCurrency(loan.totalRepayment)}`,
                variant: 'success',
                confirmText: 'OK',
                onConfirm: () => {
                    setCreateModalVisible(false);
                    setAmountRaw('5000000');
                    setLoanDescription('');
                    setNumberOfRepayments(3);
                    setPreview(null);
                },
            });

            // Refresh all data after successful creation
            await fetchData();
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'Không thể tạo khoản vay';
            modal.error('Lỗi', errorMessage);

            if (error.response?.status === 400 && errorMessage.includes('hạn mức')) {
                await fetchData();
            }
        } finally {
            creatingRef.current = false;
            setCreating(false);
        }
    }, [amountRaw, loanDescription, numberOfRepayments, preview, wallet]);

    const formatPercentage = (rate: number) => {
        return `${rate.toFixed(2)}%`;
    };

    if (loading && !refreshing) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <BinanceHeader title="Ví Trả Sau" />
                <View style={{ marginTop: Platform.OS === 'ios' ? 28 : 40 }}>
                    <FintechScreenSkeleton variant="bnpl" style={{ paddingHorizontal: 20 }} />
                </View>
            </View>
        );
    }

    const progressPercentage = wallet && wallet.creditLimit > 0
        ? Math.min((wallet.usedCredit / wallet.creditLimit) * 100, 100)
        : 0;

    const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : Math.max(70, 56 + insets.bottom);
    const currentTier = wallet ? getTier(wallet.creditLimit) : TIERS[0];
    const c = theme.colors;

    // ── fallback: show schedule items as transactions when empty
    const displayTransactions = transactions.length > 0
        ? transactions
        : schedule.slice(0, 10).map((s, i) => ({
            id: `sched-${i}`,
            amount: -s.totalDue,
            description: `Trả kỳ ${i + 1} - ${s.month}`,
            date: s.dueDate,
            type: 'payment',
        }));

    // ── Registration form submit
    const handleSubmitRegistration = async () => {
        if (!regForm.fullName.trim() || !regForm.cccd.trim() || !regForm.address.trim()) {
            modal.error('Thiếu thông tin', 'Vui lòng điền đầy đủ thông tin bắt buộc.');
            return;
        }
        setSubmittingReg(true);
        try {
            const submitted = await bnplAPI.submitApplication({
                requestedLimit: wallet?.creditLimit || 5000000,
                requestedTermMonths: numberOfRepayments,
                income: regForm.income ? Number(regForm.income) : undefined,
                occupation: regForm.occupation || undefined,
                purpose: regForm.purpose || undefined,
                address: regForm.address,
            });
            setCurrentApplication(submitted);
            setBnplStatus(submitted.status === 'approved' ? 'pending_signature' : 'pending_approval');
            await fetchData();
        } catch (error: any) {
            modal.error('Lỗi', error?.response?.data?.message || error?.message || 'Không thể gửi hồ sơ BNPL');
        } finally {
            setSubmittingReg(false);
        }
    };

    const handleActivateWallet = async () => {
        if (!termsAccepted || !signatureChecked) {
            modal.error('ChÆ°a xÃ¡c nháº­n', 'Vui lÃ²ng Ä‘á»c Ä‘iá»u khoáº£n vÃ  xÃ¡c nháº­n chá»¯ kÃ½ sá»‘.');
            return;
        }

        try {
            setCreating(true);
            const signatureText = regForm.fullName || user?.name || 'Khach hang';
            await bnplAPI.activateWallet(signatureText);
            setBnplStatus('active');
            await fetchData();
        } catch (error: any) {
            modal.error('Lá»—i', error?.response?.data?.message || error?.message || 'Khong the kich hoat vi BNPL');
        } finally {
            setCreating(false);
        }
    };

    const mapPolicyActions = (policy: DelinquencyPolicyItem) => {
        const actions: string[] = [];
        if (policy.send_notification) actions.push('Thông báo');
        if (policy.send_email) actions.push('Gửi email');
        if (policy.send_sms) actions.push('Gửi SMS');
        if (policy.apply_penalty) actions.push('Áp dụng lãi phạt');
        if (policy.block_new_loan) actions.push('Chặn vay mới');
        const stageLabel: Record<string, string> = {
            NONE: 'Theo dõi',
            REMINDER: 'Nhắc nợ',
            WARNING: 'Cảnh báo',
            COLLECTION: 'Chuyển thu hồi',
            LEGAL: 'Xử lý pháp lý',
            WRITE_OFF: 'Nợ mất vốn',
        };
        actions.push(stageLabel[policy.collection_stage] || policy.collection_stage);
        if (policy.legal_escalation) actions.push('Escalation pháp lý');
        return actions.join(', ');
    };

    const formatPolicyGroup = (policy: DelinquencyPolicyItem) => {
        if (policy.debt_group_name?.trim()) {
            return `#${policy.debt_group} - ${policy.debt_group_name}`;
        }
        return `#${policy.debt_group}`;
    };

    const formatPolicyDays = (policy: DelinquencyPolicyItem) => {
        const min = policy.min_days ?? 0;
        const max = policy.max_days;
        if (max == null || max >= 99999) {
            return `>= ${min} ngày`;
        }
        return `${min} - ${max} ngày`;
    };

    // ── Render: No Wallet
    const renderNoWallet = () => (
        <View style={styles.flowContainer}>
            <View style={styles.flowIllustration}>
                <MaterialCommunityIcons name="wallet-plus-outline" size={80} color={c.primary} />
            </View>
            <Text style={[styles.flowTitle, { color: c.textPrimary }]}>Ví Trả Sau BNPL</Text>
            <Text style={[styles.flowDesc, { color: c.textMuted }]}>
                Mua trước, trả sau với hạn mức lên đến 50 triệu đồng. Lãi suất ưu đãi, duyệt nhanh trong 24 giờ.
            </Text>
            <View style={styles.flowFeatureList}>
                {['Hạn mức đến 50 triệu đồng', 'Lãi suất từ 1.8%/tháng', 'Duyệt trong 24 giờ làm việc', 'Không cần tài sản thế chấp'].map((f) => (
                    <View key={f} style={styles.flowFeatureRow}>
                        <MaterialCommunityIcons name="check-circle" size={16} color={c.success} />
                        <Text style={[styles.flowFeatureText, { color: c.textSecondary }]}>{f}</Text>
                    </View>
                ))}
            </View>
            <TouchableOpacity
                style={[styles.flowBtn, { backgroundColor: c.primary }]}
                activeOpacity={0.85}
                onPress={() => setBnplStatus('registration')}
            >
                <Text style={styles.flowBtnText}>Đăng ký Ví Trả Sau</Text>
            </TouchableOpacity>
        </View>
    );

    // ── Render: Registration Form
    const renderRegistration = () => (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <ScrollView
                    contentContainerStyle={[styles.regScrollContent, { paddingBottom: tabBarHeight + 32 }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={Keyboard.dismiss}
                >
                    <Text style={[styles.regTitle, { color: c.textPrimary }]}>Thông tin đăng ký</Text>
                    <Text style={[styles.regDesc, { color: c.textMuted }]}>Vui lòng điền đầy đủ thông tin để đăng ký Ví Trả Sau</Text>

                    <CommonInput
                        label="Họ và tên *"
                        value={regForm.fullName}
                        onChangeText={v => setRegForm(f => ({ ...f, fullName: v }))}
                        placeholder="Nhập họ tên đầy đủ"
                        autoCapitalize="words"
                    />

                    <CommonInput
                        label="Số CCCD / CMND *"
                        value={regForm.cccd}
                        onChangeText={v => setRegForm(f => ({ ...f, cccd: v }))}
                        placeholder="Nhập số CCCD / CMND"
                        keyboardType="numeric"
                        maxLength={12}
                    />

                    <CommonInput
                        label="Địa chỉ thường trú *"
                        value={regForm.address}
                        onChangeText={v => setRegForm(f => ({ ...f, address: v }))}
                        placeholder="Nhập địa chỉ thường trú"
                        multiline
                        numberOfLines={2}
                        textAlignVertical="top"
                    />

                    <Text style={[styles.regLabel, { color: c.textSecondary }]}>Mục đích vay</Text>
                    <View style={styles.regPillRow}>
                        {['Tiêu dùng', 'Mua sắm', 'Du lịch', 'Giáo dục', 'Y tế', 'Khác'].map(p => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.regPill, regForm.purpose === p && { backgroundColor: c.primary + '30', borderColor: c.primary }]}
                                onPress={() => setRegForm(f => ({ ...f, purpose: p }))}
                            >
                                <Text style={[styles.regPillText, { color: regForm.purpose === p ? c.primary : c.textSecondary }]}>{p}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <CommonInput
                        label="Nghề nghiệp"
                        value={regForm.occupation}
                        onChangeText={v => setRegForm(f => ({ ...f, occupation: v }))}
                        placeholder="VD: Nhân viên văn phòng, Kinh doanh..."
                    />

                    <CommonInput
                        label="Thu nhập hàng tháng"
                        value={regForm.income}
                        onChangeText={v => setRegForm(f => ({ ...f, income: v.replace(/\D/g, '') }))}
                        placeholder="Nhập thu nhập ước tính"
                        keyboardType="numeric"
                        suffix="₫"
                    />

                    <TouchableOpacity
                        style={[styles.flowBtn, { backgroundColor: c.primary, marginTop: 24 }]}
                        activeOpacity={0.85}
                        onPress={handleSubmitRegistration}
                        disabled={submittingReg}
                    >
                        {submittingReg
                            ? <ActivityIndicator color={c.onPrimary} />
                            : <Text style={styles.flowBtnText}>Nộp đơn đăng ký</Text>
                        }
                    </TouchableOpacity>
                    <TouchableOpacity style={{ alignItems: 'center', marginTop: 12 }} onPress={() => setBnplStatus('no_wallet')}>
                        <Text style={[{ color: c.textMuted, fontSize: 13 }]}>Hủy đăng ký</Text>
                    </TouchableOpacity>
                </ScrollView>
        </KeyboardAvoidingView>
    );

    // ── Render: Pending Approval
    const renderPendingApproval = () => (
        <View style={styles.flowContainer}>
            <View style={[styles.flowIllustration, { backgroundColor: c.warning + '15' }]}>
                <MaterialCommunityIcons name="clock-time-four-outline" size={72} color={c.warning} />
            </View>
            <Text style={[styles.flowTitle, { color: c.textPrimary }]}>Đang xử lý hồ sơ</Text>
            <Text style={[styles.flowDesc, { color: c.textMuted }]}>
                Hồ sơ đăng ký của bạn đang được xem xét. Thời gian phê duyệt thường mất{' '}
                <Text style={{ fontWeight: '700', color: c.textPrimary }}>ít nhất 24 giờ làm việc</Text>.
            </Text>
            <CommonCard style={{ width: '100%', marginTop: 20 }}>
                <View style={styles.pendingInfoRow}>
                    <MaterialCommunityIcons name="account-outline" size={18} color={c.textMuted} />
                    <Text style={[styles.pendingInfoText, { color: c.textSecondary }]}>{regForm.fullName || 'Khách hàng'}</Text>
                </View>
                <View style={styles.pendingInfoRow}>
                    <MaterialCommunityIcons name="calendar-outline" size={18} color={c.textMuted} />
                    <Text style={[styles.pendingInfoText, { color: c.textSecondary }]}>
                        Nộp đơn: {new Date().toLocaleDateString('vi-VN')}
                    </Text>
                </View>
                <View style={styles.pendingInfoRow}>
                    <MaterialCommunityIcons name="information-outline" size={18} color={c.warning} />
                    <Text style={[styles.pendingInfoText, { color: c.warning }]}>Chờ phê duyệt</Text>
                </View>
            </CommonCard>
            <Text style={[{ color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 }]}>
                Bạn sẽ nhận được thông báo qua ứng dụng và email khi hồ sơ được phê duyệt.
            </Text>
            {/* DEV helper – tap to advance to signature step */}
            <TouchableOpacity
                style={[styles.flowBtn, { backgroundColor: c.primaryGlass, marginTop: 24 }]}
                onPress={() => setBnplStatus('pending_signature')}
            >
                <Text style={[styles.flowBtnText, { color: c.primary }]}>Mô phỏng: Đã được duyệt →</Text>
            </TouchableOpacity>
        </View>
    );

    // ── Render: Pending Signature (Terms + Digital Sign)
    const renderPendingSignature = () => (
        <ScrollView
            contentContainerStyle={[styles.regScrollContent, { paddingBottom: tabBarHeight + 48 }]}
            showsVerticalScrollIndicator={false}
        >
            <Text style={[styles.regTitle, { color: c.textPrimary }]}>Ký hợp đồng điện tử</Text>
            <Text style={[styles.regDesc, { color: c.textMuted }]}>
                Vui lòng đọc kỹ điều khoản dịch vụ và xác nhận chữ ký số để kích hoạt Ví Trả Sau.
            </Text>

            {/* Contract preview box */}
            <CommonCard style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <MaterialCommunityIcons name="file-document-outline" size={24} color={c.primary} />
                    <Text style={[{ marginLeft: 10, fontWeight: '700', fontSize: 15, color: c.textPrimary }]}>
                        Hợp đồng dịch vụ Ví Trả Sau
                    </Text>
                </View>
                <Text style={[{ color: c.textMuted, fontSize: 12, lineHeight: 20 }]}>
                    Đây là hợp đồng cung cấp dịch vụ tín dụng tiêu dùng giữa Bên A (VentoPay) và Bên B (Khách hàng).{'\n\n'}
                    <Text style={{ fontWeight: '600', color: c.textSecondary }}>Lãi suất:</Text> 1.8%/tháng{'\n'}
                    <Text style={{ fontWeight: '600', color: c.textSecondary }}>Hạn mức khởi đầu:</Text> 10,000,000 đ{'\n'}
                    <Text style={{ fontWeight: '600', color: c.textSecondary }}>Phí trả nợ trước hạn:</Text> 2% số dư còn lại{'\n'}
                    <Text style={{ fontWeight: '600', color: c.textSecondary }}>Thời gian vay tối đa:</Text> 12 tháng{'\n\n'}
                    Khách hàng đồng ý tuân thủ các điều khoản và điều kiện của hợp đồng, bao gồm nhưng không giới hạn: thanh toán đúng hạn, thông báo khi thay đổi thông tin cá nhân, và chịu trách nhiệm về các khoản vay phát sinh.
                </Text>
                <TouchableOpacity
                    style={[{ flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: c.primaryGlass }]}
                    onPress={() => modal.alert('PDF', 'Mở file PDF hợp đồng...')}
                >
                    <MaterialCommunityIcons name="file-pdf-box" size={20} color={c.primary} />
                    <Text style={[{ marginLeft: 8, color: c.primary, fontWeight: '600', fontSize: 13 }]}>Xem hợp đồng đầy đủ (PDF)</Text>
                </TouchableOpacity>

                <View style={[styles.policyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
                    <Text style={[styles.policyTitle, { color: c.textPrimary }]}>Chính sách nợ quá hạn</Text>

                    <View style={[styles.policyHeaderRow, { borderBottomColor: c.border }]}>
                        <Text style={[styles.policyHeadText, styles.policyColGroup, { color: c.textSecondary }]}>Nhóm</Text>
                        <Text style={[styles.policyHeadText, styles.policyColRange, { color: c.textSecondary }]}>Ngày quá hạn</Text>
                        <Text style={[styles.policyHeadText, styles.policyColAction, { color: c.textSecondary }]}>Hành động</Text>
                    </View>

                    {delinquencyPolicies.length > 0 ? (
                        delinquencyPolicies.map((policy) => (
                            <View key={policy._id} style={[styles.policyDataRow, { borderBottomColor: c.border }]}>
                                <Text style={[styles.policyCellText, styles.policyColGroup, { color: c.textPrimary }]}>
                                    {formatPolicyGroup(policy)}
                                </Text>
                                <Text style={[styles.policyCellText, styles.policyColRange, { color: c.textPrimary }]}>
                                    {formatPolicyDays(policy)}
                                </Text>
                                <Text style={[styles.policyCellText, styles.policyColAction, { color: c.textPrimary }]}>
                                    {mapPolicyActions(policy)}
                                </Text>
                            </View>
                        ))
                    ) : (
                        <Text style={[styles.policyEmptyText, { color: c.textMuted }]}>Chưa tải được chính sách nợ quá hạn.</Text>
                    )}
                </View>
            </CommonCard>

            {/* Terms checkbox */}
            <TouchableOpacity
                style={[styles.checkRow]}
                onPress={() => setTermsAccepted(v => !v)}
                activeOpacity={0.8}
            >
                <View style={[styles.checkbox, termsAccepted && { backgroundColor: c.primary, borderColor: c.primary }]}>
                    {termsAccepted && <MaterialCommunityIcons name="check" size={14} color={c.onPrimary} />}
                </View>
                <Text style={[styles.checkLabel, { color: c.textSecondary }]}>
                    Tôi đã đọc và đồng ý với{' '}
                    <Text style={{ color: c.primary, fontWeight: '600' }}>chính sách xử lý nợ quá hạn</Text>
                    {' '}và các điều khoản dịch vụ.
                </Text>
            </TouchableOpacity>

            {/* Signature checkbox */}
            <TouchableOpacity
                style={[styles.checkRow, { marginTop: 10 }]}
                onPress={() => setSignatureChecked(v => !v)}
                activeOpacity={0.8}
            >
                <View style={[styles.checkbox, signatureChecked && { backgroundColor: c.primary, borderColor: c.primary }]}>
                    {signatureChecked && <MaterialCommunityIcons name="check" size={14} color={c.onPrimary} />}
                </View>
                <Text style={[styles.checkLabel, { color: c.textSecondary }]}>
                    Tôi xác nhận <Text style={{ fontWeight: '600', color: c.textPrimary }}>chữ ký số</Text> dưới đây là hợp lệ và mang giá trị pháp lý
                </Text>
            </TouchableOpacity>

            {/* Mock digital signature */}
            <View style={[styles.signatureBox, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text style={[{ color: c.textMuted, fontSize: 12, marginBottom: 8 }]}>Chữ ký số của bạn:</Text>
                <Text style={[{ color: c.primary, fontSize: 22, fontStyle: 'italic', fontFamily: 'serif' }]}>
                    {regForm.fullName || 'Chữ ký'}
                </Text>
                <Text style={[{ color: c.textMuted, fontSize: 10, marginTop: 6 }]}>
                    Ký bằng mã OTP xác thực tại {new Date().toLocaleString('vi-VN')}
                </Text>
            </View>

            <TouchableOpacity
                style={[styles.flowBtn, { backgroundColor: termsAccepted && signatureChecked ? c.primary : c.border, marginTop: 24 }]}
                activeOpacity={0.85}
                onPress={handleActivateWallet}
            >
                <Text style={[styles.flowBtnText, { color: termsAccepted && signatureChecked ? c.onPrimary : c.textMuted }]}>
                    Xác nhận & Kích hoạt ví
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                title="Ví Trả Sau"
                rightComponents={
                    bnplStatus === 'active' ? (
                        <TouchableOpacity
                            onPress={() => setMenuVisible(v => !v)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{ padding: 4 }}
                        >
                            <MaterialCommunityIcons name="dots-vertical" size={22} color={c.textPrimary} />
                        </TouchableOpacity>
                    ) : undefined
                }
            />

            {/* ── State machine routing ── */}
            {bnplStatus === 'no_wallet' && renderNoWallet()}
            {bnplStatus === 'registration' && renderRegistration()}
            {bnplStatus === 'pending_approval' && renderPendingApproval()}
            {bnplStatus === 'pending_signature' && renderPendingSignature()}

            {bnplStatus === 'active' && (
                <FintechPullToRefresh
                    onRefresh={onRefresh}
                    refreshing={refreshing}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + insets.bottom + 32 }]}
                    topOffset={Platform.OS === 'ios' ? -15 : 0}
                >
                    {/* ── Wallet Info Card ── */}
                    {wallet && (
                        <CommonCard style={styles.walletCard}>
                            {/* Tier badge + balance visibility toggle */}
                            <View style={styles.walletHeaderRow}>
                                <View style={[styles.tierPill, { backgroundColor: currentTier.color + '25' }]}>
                                    <MaterialCommunityIcons name={currentTier.icon} size={13} color={currentTier.color} />
                                    <Text style={[styles.tierPillText, { color: currentTier.color }]}>{currentTier.label}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setBalanceVisible(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <MaterialCommunityIcons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={c.textDim} />
                                </TouchableOpacity>
                            </View>
                            <Text style={[styles.walletLabel, { color: theme.colors.textMuted, marginTop: 12 }]}>Hạn mức khả dụng</Text>
                            <Text style={[styles.walletBalance, { color: theme.colors.textPrimary }]}>
                                {balanceVisible ? formatCurrency(wallet!.availableCredit) : '*** *** VND'}
                            </Text>
                            <View style={styles.walletRow}>
                                <View style={styles.walletRowItem}>
                                    <Text style={[styles.walletRowLabel, { color: theme.colors.textMuted }]}>Tổng hạn mức</Text>
                                    <Text style={[styles.walletRowValue, { color: theme.colors.textPrimary }]}>
                                        {balanceVisible ? formatCurrency(wallet!.creditLimit) : '*** ***'}
                                    </Text>
                                </View>
                                <View style={[styles.walletRowItemDivider, { backgroundColor: theme.colors.border }]} />
                                <View style={styles.walletRowItem}>
                                    <Text style={[styles.walletRowLabel, { color: theme.colors.textMuted }]}>Đã sử dụng</Text>
                                    <Text style={[styles.walletRowValue, { color: theme.colors.textPrimary }]}>
                                        {balanceVisible ? formatCurrency(wallet!.usedCredit) : '*** ***'}
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
                                            borderRadius: theme.radius.pill,
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
                                                borderRadius: theme.radius.pill,
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
                                        Còn lại {balanceVisible ? formatCurrency(wallet!.availableCredit) : '*** ***'}
                                    </Text>
                                </View>
                            </View>
                            {/* Repay button */}
                            <TouchableOpacity
                                style={[styles.repayBtn, { backgroundColor: c.primary }]}
                                activeOpacity={0.8}
                                onPress={() => navigation.navigate('BNPLLoanList', { loans })}
                            >
                                <MaterialCommunityIcons name="credit-card-refresh-outline" size={16} color={c.onPrimary} />
                                <Text style={[styles.repayBtnText, { color: c.onPrimary }]}>Thanh toán dư nợ</Text>
                            </TouchableOpacity>
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
                            <View>
                                {loans.map((loan) => (
                                        <TouchableOpacity
                                            key={loan.id}
                                            activeOpacity={0.85}
                                            onPress={() => navigation.navigate('BNPLLoanDetail', { loan })}
                                        >
                                            <CommonCard style={[styles.loanCard, { overflow: 'hidden' }]}>
                                                <View style={styles.loanHeader}>
                                                    <Text style={[styles.loanId, { color: theme.colors.textMuted }]}>
                                                        #{loan.fineractLoanId}
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                                                            <Text style={[styles.loanStatus, { color: getStatusColor(loan.status, theme) }]}>
                                                                {getStatusLabel(loan.status)}
                                                            </Text>
                                                        </View>
                                                        <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
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
                                                {loan.purpose ? (
                                                    <View style={styles.loanRow}>
                                                        <Text style={[styles.loanLabel, { color: theme.colors.textMuted }]}>Mục đích</Text>
                                                        <Text style={[styles.loanValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                                            {loan.purpose}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                                <View style={styles.loanRow}>
                                                    <Text style={[styles.loanLabel, { color: theme.colors.textMuted }]}>Còn nợ</Text>
                                                    <Text style={[styles.loanValue, { color: theme.colors.error }]}>
                                                        {formatCurrency(loan.outstandingBalance)}
                                                    </Text>
                                                </View>
                                            </CommonCard>
                                        </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}

                    <View style={{ height: 40 }} />
                </FintechPullToRefresh>
            )}

            {/* ==================== SUCCESS SCREEN ==================== */}
            {successLoan && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background, zIndex: 100, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
                    <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#0ECB8118', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
                        <MaterialCommunityIcons name="check-circle" size={64} color="#0ECB81" />
                    </View>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 10, textAlign: 'center' }}>Tạo khoản vay thành công!</Text>
                    <Text style={{ fontSize: 14, lineHeight: 22, color: c.textSecondary, textAlign: 'center', marginBottom: 8 }}>
                        Khoản vay {formatCurrency(successLoan.principal)} đã được giải ngân thành công.
                    </Text>
                    <Text style={{ fontSize: 13, color: c.textDim, textAlign: 'center', marginBottom: 32 }}>
                        Số tiền đã được cộng vào tài khoản của bạn. Bạn có thể xem chi tiết khoản vay bên dưới.
                    </Text>
                    <View style={{ width: '100%', padding: 16, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, marginBottom: 24 }}>
                        {[
                            { label: 'Mã khoản vay', value: `#${successLoan.fineractLoanId}` },
                            { label: 'Số tiền vay', value: formatCurrency(successLoan.principal) },
                            { label: 'Số kỳ trả', value: `${successLoan.numberOfRepayments} kỳ` },
                            { label: 'Mục đích', value: successLoan.purpose || 'Chưa ghi nhận' },
                        ].map((row, idx, arr) => (
                            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                                <Text style={{ fontSize: 13, color: c.textSecondary }}>{row.label}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>{row.value}</Text>
                            </View>
                        ))}
                    </View>
                    <TouchableOpacity
                        style={{ backgroundColor: c.primary, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14, width: '100%', alignItems: 'center' }}
                        activeOpacity={0.85}
                        onPress={() => setSuccessLoan(null)}
                    >
                        <Text style={{ fontSize: 15, fontWeight: '700', color: c.onPrimary }}>Quay lại</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ==================== CREATE LOAN MODAL ==================== */}
            <Modal
                visible={createModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCreateModalVisible(false)}
            >
                <View style={[styles.modalContainer, { backgroundColor: c.background }]}>
                    <BinanceHeader title="Tạo khoản vay" showBack={false} rightComponents={
                        <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                            <MaterialCommunityIcons name="close" size={24} color={c.textPrimary} />
                        </TouchableOpacity>
                    } />
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                    >
                        <ScrollView
                                style={{ flex: 1 }}
                                contentContainerStyle={[styles.modalScroll, { paddingBottom: Platform.OS === 'ios' ? insets.bottom + 24 : 24 }]}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                showsVerticalScrollIndicator={false}
                                onScrollBeginDrag={Keyboard.dismiss}
                            >

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

                                {/* Purpose Selector */}
                                <View style={styles.inputSection}>
                                    <View style={styles.inputLabelRow}>
                                        <MaterialCommunityIcons
                                            name="tag-outline"
                                            size={18}
                                            color={theme.colors.textMuted}
                                            style={styles.inputIcon}
                                        />
                                        <Text style={[styles.inputLabel, { color: theme.colors.textPrimary }]}>Mục đích khoản BNPL</Text>
                                    </View>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
                                        {BNPL_PURPOSE_OPTIONS.map((purpose) => (
                                            <TouchableOpacity
                                                key={purpose}
                                                onPress={() => setLoanPurpose(purpose)}
                                                style={[
                                                    styles.pill,
                                                    {
                                                        backgroundColor:
                                                            loanPurpose === purpose
                                                                ? theme.colors.primaryGlass
                                                                : theme.colors.glassLight,
                                                        borderColor:
                                                            loanPurpose === purpose
                                                                ? theme.colors.primaryBorder
                                                                : theme.colors.border,
                                                        borderRadius: theme.radius.pill,
                                                    },
                                                    loanPurpose === purpose && styles.pillActive,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.pillText,
                                                        {
                                                            color:
                                                                loanPurpose === purpose
                                                                    ? theme.colors.primary
                                                                    : theme.colors.textSecondary,
                                                        },
                                                        loanPurpose === purpose && styles.pillTextActive,
                                                    ]}
                                                >
                                                    {purpose}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>

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
                                        {Array.from({ length: 12 }, (_, index) => index + 1).map((months) => (
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
                                                        borderRadius: theme.radius.pill,
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

                                {/* Quick Amount Badges */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                                    {[500000, 1000000, 2000000, 3000000, 5000000, 10000000].map((amt) => (
                                        <TouchableOpacity
                                            key={amt}
                                            onPress={() => {
                                                setAmountRaw(String(amt));
                                                setPreview(null);
                                            }}
                                            style={{
                                                paddingHorizontal: 14,
                                                paddingVertical: 8,
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: parseInt(amountRaw) === amt ? theme.colors.primaryBorder : theme.colors.border,
                                                backgroundColor: parseInt(amountRaw) === amt ? theme.colors.primaryGlass : theme.colors.glassLight,
                                            }}
                                        >
                                            <Text style={{
                                                fontSize: 12,
                                                fontWeight: '600',
                                                color: parseInt(amountRaw) === amt ? theme.colors.primary : theme.colors.textSecondary,
                                            }}>
                                                {amt >= 1000000 ? `${amt / 1000000}M` : `${amt / 1000}K`}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
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
                                                <Text style={[styles.previewRowLabel, { color: theme.colors.textMuted }]}>Cách tính lãi</Text>
                                                <Text style={[styles.previewRowValue, { color: theme.colors.textPrimary }]}>
                                                    {(preview?.interestType || 'declining_balance') === 'declining_balance'
                                                        ? 'Dư nợ giảm dần'
                                                        : preview?.interestType || 'Dư nợ giảm dần'}
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
                                                <Text style={[styles.previewRowLabel, { color: theme.colors.textMuted }]}>Phí</Text>
                                                <Text style={[styles.previewRowValue, { color: theme.colors.textPrimary }]}>
                                                    {formatCurrency(preview?.totalFees || 0)}
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
                                            <View style={styles.previewRow}>
                                                <Text style={[styles.previewRowLabel, { color: theme.colors.textMuted }]}>Kỳ hạn</Text>
                                                <Text style={[styles.previewRowValue, { color: theme.colors.textPrimary }]}>
                                                    {preview?.numberOfRepayments || numberOfRepayments} tháng
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
                                ) : null}

                                <View style={{ height: 20 }} />
                            </ScrollView>
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
                                title="Tạo khoản vay"
                                onPress={handleCreateLoan}
                                icon="plus-circle"
                                loading={creating || loadingPreview}
                                disabled={creating || loadingPreview}
                                style={styles.submitBtn}
                            />
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ── 3-dot dropdown menu ── Modal so it renders above everything on Android ── */}
            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
                statusBarTranslucent
            >
                <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={1}
                    onPress={() => setMenuVisible(false)}
                >
                    <View style={[styles.dropdownMenu, { backgroundColor: c.surface, borderColor: c.border, shadowColor: '#000' }]}>
                        {[
                            { icon: 'format-list-bulleted', label: 'Xem danh sách khoản vay', action: () => { setMenuVisible(false); navigation.navigate('BNPLLoanList', { loans }); } },
                            { icon: 'history', label: 'Lịch sử giao dịch', action: () => { setMenuVisible(false); navigation.navigate('BNPLTransactionHistory'); } },
                        ].map((item) => (
                            <TouchableOpacity key={item.label} style={[styles.dropdownItem, { borderBottomColor: c.border }]} onPress={item.action}>
                                <MaterialCommunityIcons name={item.icon as any} size={18} color={c.textSecondary} />
                                <Text style={[styles.dropdownItemText, { color: c.textPrimary }]}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
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

const getStatusLabel = (status: string): string => {
    switch (status.toLowerCase()) {
        case 'active': return 'Hoạt động';
        case 'closed': return 'Đã tất toán';
        case 'pending': return 'Chờ duyệt';
        default: return status;
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingHorizontal: 20,
        width: '100%',
        maxWidth: '100%',
    },

    // Membership Tier
    tierSection: { marginBottom: 20, width: '100%' },
    tierCard: { padding: 18 },
    tierHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    tierLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tierIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    tierName: { fontSize: 16, fontWeight: '700' },
    tierSub: { fontSize: 12, marginTop: 1 },
    tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    tierBadgeText: { fontSize: 11, fontWeight: '600' },
    tierLevels: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    tierLevelItem: { alignItems: 'center', gap: 4 },
    tierLevelDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    tierLevelLabel: { fontSize: 9, fontWeight: '500', textAlign: 'center' },
    tierConnector: { flex: 1, height: 2, marginBottom: 16, marginHorizontal: 2 },
    tierDivider: { height: 1, marginBottom: 12 },
    tierLimitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tierLimitLabel: { fontSize: 13 },
    tierLimitValue: { fontSize: 16, fontWeight: '700' },
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
        padding: 20,
        paddingBottom: 30,
        borderTopWidth: 1,
    },
    submitBtn: {},

    // Wallet card redesign styles
    walletHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    tierPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    tierPillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    repayBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderRadius: 10,
        marginTop: 16,
    },
    repayBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },

    // Transaction history styles
    txCard: { marginBottom: 24, width: '100%' },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    txIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    txInfo: { flex: 1, minWidth: 0 },
    txDesc: { fontSize: 13, fontWeight: '600', marginBottom: 2, flexShrink: 1 },
    txDate: { fontSize: 11 },
    txAmount: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
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

    // ── Flow state screens
    flowContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
        alignItems: 'center',
    },
    flowIllustration: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(245, 197, 24, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    flowTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 12,
    },
    flowDesc: {
        fontSize: 14,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 24,
    },
    flowFeatureList: {
        width: '100%',
        marginBottom: 32,
        gap: 10,
    },
    flowFeatureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    flowFeatureText: {
        fontSize: 14,
    },
    flowBtn: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flowBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },

    // ── Registration form
    regScrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    regTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 6,
    },
    regDesc: {
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 20,
    },
    regLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
        marginTop: 14,
    },
    regInput: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
    },
    regInputMulti: {
        minHeight: 72,
        textAlignVertical: 'top',
        paddingTop: 12,
    },
    regPillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    regPill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(150,150,150,0.3)',
    },
    regPillText: {
        fontSize: 12,
        fontWeight: '600',
    },

    // ── Pending approval
    pendingInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
    },
    pendingInfoText: {
        fontSize: 14,
    },

    // ── Terms & signature
    checkRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginTop: 20,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: 'rgba(150,150,150,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginTop: 1,
    },
    checkLabel: {
        flex: 1,
        fontSize: 13,
        lineHeight: 20,
    },
    signatureBox: {
        width: '100%',
        borderWidth: 1.5,
        borderRadius: 12,
        padding: 20,
        marginTop: 24,
        alignItems: 'center',
        borderStyle: 'dashed',
    },

    policyCard: {
        marginTop: 14,
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
    },
    policyTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 10,
    },
    policyHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 8,
        borderBottomWidth: 1,
    },
    policyDataRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 8,
        borderBottomWidth: 0.5,
    },
    policyHeadText: {
        fontSize: 12,
        fontWeight: '700',
    },
    policyCellText: {
        fontSize: 12,
        lineHeight: 18,
    },
    policyColGroup: {
        flex: 0.7,
    },
    policyColRange: {
        flex: 1,
    },
    policyColAction: {
        flex: 1.6,
    },
    policyEmptyText: {
        marginTop: 8,
        fontSize: 12,
        fontStyle: 'italic',
    },

    // ── Dropdown menu
    dropdownMenu: {
        position: 'absolute',
        top: 56,
        right: 16,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 16,
        minWidth: 220,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
        borderBottomWidth: 1,
    },
    dropdownItemText: {
        fontSize: 14,
        fontWeight: '500',
    },
});
