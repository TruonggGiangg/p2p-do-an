import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Animated,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import { loanService, LoanProduct, LoanProductConfig, LoanScheduleResult } from '../services/loan.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_PERIOD_OPTIONS = [3, 6, 9, 12, 18, 24];
const QUICK_AMOUNTS = [
    { label: '5 triệu', value: 5000000, icon: 'cash' as const },
    { label: '10 triệu', value: 10000000, icon: 'cash-multiple' as const },
    { label: '20 triệu', value: 20000000, icon: 'wallet' as const },
    { label: '50 triệu', value: 50000000, icon: 'diamond-stone' as const },
];

type RouteParams = { product: LoanProduct; willing?: string };
type LoanCreateNav = NativeStackNavigationProp<RootStackParamList, 'LoanCreate'>;

// ── Step indicator: đơn giản Bước 1/2 ───────────────────────────────────────
function StepIndicator({ current, theme }: { current: number; theme: any }) {
    const c = theme.colors;
    return (
        <View style={[stepStyles.container, { backgroundColor: c.surfaceLight }]}>
            <View style={stepStyles.stepsRow}>
                {[0, 1].map((i) => (
                    <React.Fragment key={i}>
                        <View style={[
                            stepStyles.dot,
                            i <= current
                                ? { backgroundColor: c.primary }
                                : { backgroundColor: c.border },
                        ]}>
                            {i < current ? (
                                <MaterialCommunityIcons name="check" size={12} color="#000" />
                            ) : (
                                <Text style={[stepStyles.dotText, i <= current && { color: '#000' }]}>{i + 1}</Text>
                            )}
                        </View>
                        {i < 1 && (
                            <View style={[
                                stepStyles.connector,
                                i < current
                                    ? { backgroundColor: c.primary }
                                    : { backgroundColor: c.border },
                            ]} />
                        )}
                    </React.Fragment>
                ))}
            </View>
            <Text style={[stepStyles.label, { color: c.textPrimary }]}>
                {current === 0 ? 'Nhập thông tin vay' : 'Xác nhận & gửi đơn'}
            </Text>
        </View>
    );
}

const stepStyles = StyleSheet.create({
    container: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    stepsRow: { flexDirection: 'row', alignItems: 'center' },
    dot: {
        width: 26, height: 26, borderRadius: 13,
        justifyContent: 'center', alignItems: 'center',
    },
    dotText: { fontSize: 12, fontWeight: '700', color: '#888' },
    connector: { height: 2, flex: 1, marginHorizontal: 6, borderRadius: 1 },
    label: { fontSize: 14, fontWeight: '600' },
});

// ── Period Stepper ───────────────────────────────────────────────────────────────────────
const PERIOD_QUICK_OPTIONS = [3, 6, 12, 24];

function PeriodStepper({
    value,
    onChange,
    min,
    max,
    primaryColor,
    textColor,
    borderColor,
    dimColor,
}: {
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    primaryColor: string;
    textColor: string;
    borderColor: string;
    dimColor: string;
}) {
    const pressAnim = useRef(new Animated.Value(1)).current;
    const [inputText, setInputText] = useState(String(value));

    useEffect(() => {
        setInputText(String(value));
    }, [value]);

    const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));

    const decrement = () => {
        if (value <= min) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const next = clamp(value - 1);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.94, duration: 60, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
    };
    const increment = () => {
        if (value >= max) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const next = clamp(value + 1);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.94, duration: 60, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
    };

    const handleTextChange = (t: string) => {
        setInputText(t);
        const num = parseInt(t, 10);
        if (!isNaN(num)) onChange(clamp(num));
    };

    const quickChips = PERIOD_QUICK_OPTIONS.filter((p) => p >= min && p <= max);

    return (
        <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
            {/* Quick chips */}
            {quickChips.length > 0 && (
                <View style={periodStepperStyles.chipRow}>
                    {quickChips.map((p) => (
                        <TouchableOpacity
                            key={p}
                            style={[
                                periodStepperStyles.chip,
                                { borderColor: value === p ? primaryColor : borderColor },
                                value === p && { backgroundColor: primaryColor + '18' },
                            ]}
                            onPress={() => onChange(p)}
                        >
                            <Text style={[periodStepperStyles.chipText, { color: value === p ? primaryColor : dimColor }]}>
                                {p} tháng
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Stepper: nhập số tháng tùy chọn trong khoảng min-max */}
            <View style={[periodStepperStyles.row, { borderColor }]}>
                <TouchableOpacity
                    style={[
                        periodStepperStyles.btn,
                        { backgroundColor: value <= min ? dimColor + '30' : primaryColor + '25', borderColor },
                        value <= min && periodStepperStyles.btnDisabled,
                    ]}
                    onPress={decrement}
                    disabled={value <= min}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="minus" size={22} color={value <= min ? dimColor : primaryColor} />
                </TouchableOpacity>

                <View style={periodStepperStyles.center}>
                    <TextInput
                        style={[periodStepperStyles.input, { color: primaryColor }]}
                        value={inputText}
                        onChangeText={handleTextChange}
                        keyboardType="number-pad"
                        selectTextOnFocus
                    />
                    <Text style={[periodStepperStyles.unit, { color: dimColor }]}>tháng</Text>
                    <Text style={[periodStepperStyles.rangeHint, { color: dimColor }]}>
                        Khoảng: {min} – {max} tháng
                    </Text>
                </View>

                <TouchableOpacity
                    style={[
                        periodStepperStyles.btn,
                        { backgroundColor: value >= max ? dimColor + '30' : primaryColor + '25', borderColor },
                        value >= max && periodStepperStyles.btnDisabled,
                    ]}
                    onPress={increment}
                    disabled={value >= max}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="plus" size={22} color={value >= max ? dimColor : primaryColor} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const periodStepperStyles = StyleSheet.create({
    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
    chipText: { fontSize: 14, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, overflow: 'hidden' },
    btn: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderLeftWidth: 1 },
    btnDisabled: { opacity: 0.6 },
    center: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    input: { fontSize: 24, fontWeight: '800', textAlign: 'center', minWidth: 50 },
    unit: { fontSize: 13, fontWeight: '500', marginTop: 2 },
    rangeHint: { fontSize: 11, marginTop: 4 },
});

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function LoanCreateScreen() {
    const { theme } = useTheme();
    const route = useRoute();
    const navigation = useNavigation<LoanCreateNav>();
    const insets = useSafeAreaInsets();
    const { product, willing: initialWilling } = (route.params || {}) as RouteParams;
    const [step, setStep] = useState(0); // 0 = input, 1 = confirm

    const [config, setConfig] = useState<LoanProductConfig | null>(null);
    const [capital, setCapital] = useState('');
    const [periodMonth, setPeriodMonth] = useState(12);
    const [customPeriod, setCustomPeriod] = useState('');
    // willing được fix cứng theo tên sản phẩm
    const [willing, setWilling] = useState(initialWilling ?? '');
    const [schedule, setSchedule] = useState<LoanScheduleResult | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [loadingPreview, setLoadingPreview] = useState(false);

    const minRep = config?.minNumberOfRepayments ?? 1;
    const maxRep = config?.maxNumberOfRepayments ?? 360;
    const periodOptions = DEFAULT_PERIOD_OPTIONS.filter((p) => p >= minRep && p <= maxRep);
    if (periodOptions.length === 0) periodOptions.push(minRep);
    const effectivePeriod = customPeriod ? parseInt(customPeriod, 10) || periodMonth : periodMonth;
    const capitalNum = parseInt(String(capital).replace(/\D/g, ''), 10) || 0;

    const fetchConfig = useCallback(async () => {
        if (!product?.id) return;
        try {
            const c = await loanService.getProductConfig(product.id);
            setConfig(c);
            // Fix cứng mục đích theo tên sản phẩm
            setWilling(initialWilling || product.name || c?.name || c?.shortName || '');
            const minR = c?.minNumberOfRepayments ?? 1;
            const maxR = c?.maxNumberOfRepayments ?? 360;
            setPeriodMonth((prev) => (prev >= minR && prev <= maxR ? prev : Math.max(minR, Math.min(maxR, 12))));
        } catch (e) {
            Alert.alert('Lỗi', 'Không thể tải cấu hình sản phẩm');
        } finally {
            setLoadingConfig(false);
        }
    }, [product?.id, product?.name, initialWilling]);

    const fetchPreview = useCallback(async () => {
        if (!product?.id || capitalNum < 100000 || effectivePeriod < 1) return;
        setLoadingPreview(true);
        try {
            const result = await loanService.ratePreview({
                capital: capitalNum,
                periodMonth: effectivePeriod,
                productId: product.id,
            });
            setSchedule(result);
        } catch (e) {
            setSchedule(null);
        } finally {
            setLoadingPreview(false);
        }
    }, [product?.id, capitalNum, effectivePeriod]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    useEffect(() => {
        const t = setTimeout(fetchPreview, 400);
        return () => clearTimeout(t);
    }, [fetchPreview]);

    const handleNext = () => {
        if (!product || capitalNum < 100000 || effectivePeriod < 1) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền và kỳ hạn hợp lệ');
            return;
        }
        if (!schedule) {
            Alert.alert('Lỗi', 'Đang tính toán lịch trả nợ, vui lòng đợi');
            return;
        }
        navigation.navigate('LoanConfirm', {
            product,
            config: config!,
            capital: capitalNum,
            periodMonth: effectivePeriod,
            willing: willing.trim(),
            schedule,
        });
    };

    if (!product) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <BinanceHeader showBack title="Tạo khoản vay" />
                <View style={styles.centered}>
                    <Text style={{ color: theme.colors.textSecondary }}>Không có thông tin sản phẩm</Text>
                </View>
            </View>
        );
    }

    const canProceed = !!schedule && capitalNum >= 100000 && effectivePeriod >= 1;

    const formatCurrency = (n: number) => n.toLocaleString('vi-VN');

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader showBack title={`Vay ${product.shortName || product.name}`} />
            <StepIndicator current={0} theme={theme} />

            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <ScrollView
                    style={styles.scrollContainer}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Section 1: Số tiền vay ── */}
                    <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                                <MaterialCommunityIcons name="cash-fast" size={20} color={theme.colors.primary} />
                            </View>
                            <View style={styles.sectionHeaderText}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Số tiền vay</Text>
                                {product?.minPrincipal != null && (
                                    <Text style={[styles.sectionHint, { color: theme.colors.textDim }]}>
                                        {formatCurrency(product.minPrincipal)} – {formatCurrency(product.maxPrincipal!)} đ
                                    </Text>
                                )}
                            </View>
                        </View>

                        <View style={[styles.amountInputWrapper, { borderColor: theme.colors.primary + '40' }]}>
                            <TextInput
                                style={[styles.amountInput, { color: theme.colors.textPrimary }]}
                                placeholder="0"
                                placeholderTextColor={theme.colors.textDim + '60'}
                                value={capital ? capital.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                onChangeText={(t) => setCapital(t.replace(/\D/g, ''))}
                                keyboardType="number-pad"
                            />
                            <Text style={[styles.amountCurrency, { color: theme.colors.textDim }]}>VND</Text>
                        </View>

                        <View style={styles.quickAmountGrid}>
                            {QUICK_AMOUNTS.map((qa) => {
                                const isSelected = capitalNum === qa.value;
                                return (
                                    <TouchableOpacity
                                        key={qa.value}
                                        style={[
                                            styles.quickChip,
                                            { borderColor: isSelected ? theme.colors.primary : theme.colors.border + '80' },
                                            isSelected && { backgroundColor: theme.colors.primary + '12' },
                                        ]}
                                        onPress={() => { setCapital(String(qa.value)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons
                                            name={qa.icon}
                                            size={16}
                                            color={isSelected ? theme.colors.primary : theme.colors.textDim}
                                        />
                                        <Text style={[
                                            styles.quickChipText,
                                            { color: isSelected ? theme.colors.primary : theme.colors.textSecondary },
                                        ]}>
                                            {qa.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* ── Section 2: Kỳ hạn ── */}
                    <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: '#6C5CE7' + '15' }]}>
                                <MaterialCommunityIcons name="calendar-clock" size={20} color="#6C5CE7" />
                            </View>
                            <View style={styles.sectionHeaderText}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Kỳ hạn vay</Text>
                                <Text style={[styles.sectionHint, { color: theme.colors.textDim }]}>
                                    {minRep} – {maxRep} tháng
                                </Text>
                            </View>
                        </View>

                        {loadingConfig ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : (
                            <PeriodStepper
                                value={effectivePeriod}
                                onChange={(v) => { setPeriodMonth(v); setCustomPeriod(''); }}
                                min={minRep}
                                max={maxRep}
                                primaryColor={theme.colors.primary}
                                textColor={theme.colors.textPrimary}
                                borderColor={theme.colors.border}
                                dimColor={theme.colors.textDim}
                            />
                        )}
                    </View>

                    {/* ── Section 3: Lãi suất (cố định theo sản phẩm Fineract) ── */}
                    <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: '#00B894' + '15' }]}>
                                <MaterialCommunityIcons name="percent-outline" size={20} color="#00B894" />
                            </View>
                            <View style={styles.sectionHeaderText}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Lãi suất</Text>
                                <Text style={[styles.sectionHint, { color: theme.colors.textDim }]}>
                                    Theo sản phẩm vay mặc định
                                </Text>
                            </View>
                        </View>

                        {loadingConfig ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : config && (
                            <View style={[styles.rateCard, { backgroundColor: '#00B894' + '08', borderColor: '#00B894' + '20' }]}>
                                <View style={styles.rateCardTop}>
                                    <View style={{ alignItems: 'center', flex: 1 }}>
                                        <Text style={[styles.rateMainValue, { color: '#00B894' }]}>
                                            {+config.monthlyRate.toFixed(2)}%
                                        </Text>
                                        <Text style={[styles.rateMainLabel, { color: theme.colors.textDim }]}>mỗi tháng</Text>
                                    </View>
                                    <View style={[styles.rateDividerV, { backgroundColor: theme.colors.border }]} />
                                    <View style={{ alignItems: 'center', flex: 1 }}>
                                        <Text style={[styles.rateSubValue, { color: theme.colors.textSecondary }]}>
                                            ≈ {+config.annualRate.toFixed(2)}%
                                        </Text>
                                        <Text style={[styles.rateMainLabel, { color: theme.colors.textDim }]}>mỗi năm</Text>
                                    </View>
                                </View>
                                <View style={[styles.rateInfoBadge, { backgroundColor: '#00B894' + '12' }]}>
                                    <MaterialCommunityIcons name="shield-check" size={14} color="#00B894" />
                                    <Text style={[styles.rateInfoText, { color: '#00B894' }]}>
                                        Lãi suất cố định theo sản phẩm vay
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* ── Preview kết quả ── */}
                    {loadingPreview ? (
                        <View style={[styles.previewCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                            <Text style={[styles.previewLoading, { color: theme.colors.textDim }]}>Đang tính toán...</Text>
                        </View>
                    ) : schedule && capitalNum >= 100000 ? (
                        <View style={[styles.previewCard, { backgroundColor: theme.colors.primary + '08', borderColor: theme.colors.primary + '20' }]}>
                            <View style={styles.previewRow}>
                                <View style={styles.previewItem}>
                                    <Text style={[styles.previewItemLabel, { color: theme.colors.textDim }]}>Trả hàng tháng</Text>
                                    <Text style={[styles.previewItemValue, { color: theme.colors.primary }]}>
                                        {formatCurrency(schedule.monthlyPay)} đ
                                    </Text>
                                </View>
                                <View style={[styles.previewDivider, { backgroundColor: theme.colors.border }]} />
                                <View style={styles.previewItem}>
                                    <Text style={[styles.previewItemLabel, { color: theme.colors.textDim }]}>Tổng phải trả</Text>
                                    <Text style={[styles.previewTotalValue, { color: theme.colors.textPrimary }]}>
                                        {formatCurrency(schedule.entirelyPay)} đ
                                    </Text>
                                </View>
                            </View>
                            <View style={[styles.previewInterest, { backgroundColor: theme.colors.surfaceLight }]}>
                                <MaterialCommunityIcons name="information-outline" size={14} color={theme.colors.textDim} />
                                <Text style={[styles.previewInterestText, { color: theme.colors.textDim }]}>
                                    Tổng lãi: {formatCurrency(schedule.entirelyPay - capitalNum)} đ
                                </Text>
                            </View>
                        </View>
                    ) : null}

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* ── Sticky Bottom Bar ── */}
                <View style={[styles.stickyBar, {
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.border,
                    paddingBottom: Math.max(insets.bottom, 12),
                }]}>
                    {schedule && capitalNum >= 100000 ? (
                        <View style={styles.stickyBarInfo}>
                            <Text style={[styles.stickyLabel, { color: theme.colors.textDim }]}>Trả hàng tháng</Text>
                            <Text style={[styles.stickyValue, { color: theme.colors.primary }]}>
                                {formatCurrency(schedule.monthlyPay)} đ
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.stickyBarInfo}>
                            <Text style={[styles.stickyLabel, { color: theme.colors.textDim }]}>
                                {capitalNum < 100000 ? 'Nhập số tiền tối thiểu 100.000 đ' : 'Đang tính toán...'}
                            </Text>
                        </View>
                    )}
                    <TouchableOpacity
                        style={[styles.nextBtn, { backgroundColor: canProceed ? theme.colors.primary : theme.colors.border }]}
                        onPress={handleNext}
                        disabled={!canProceed}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.nextBtnText, { color: canProceed ? '#000' : theme.colors.textDim }]}>Tiếp tục</Text>
                        <MaterialCommunityIcons name="arrow-right" size={18} color={canProceed ? '#000' : theme.colors.textDim} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    keyboardContainer: { flex: 1 },
    scrollContainer: { flex: 1 },
    flex: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24, gap: 12 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Section cards
    section: {
        padding: 20,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    sectionIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionHeaderText: { flex: 1 },
    sectionTitle: { fontSize: 16, fontWeight: '700' },
    sectionHint: { fontSize: 12, marginTop: 2 },

    // Amount
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 2,
        borderRadius: 16,
        paddingHorizontal: 16,
        marginBottom: 14,
    },
    amountInput: {
        flex: 1,
        fontSize: 28,
        fontWeight: '800',
        paddingVertical: 14,
        letterSpacing: 0.5,
    },
    amountCurrency: {
        fontSize: 14,
        fontWeight: '700',
        opacity: 0.5,
        marginLeft: 8,
    },
    quickAmountGrid: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    quickChip: {
        flex: 1,
        minWidth: (SCREEN_WIDTH - 72) / 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    quickChipText: { fontSize: 12, fontWeight: '600' },

    // Rate
    rateCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
    },
    rateCardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        paddingVertical: 4,
    },
    rateMainValue: { fontSize: 28, fontWeight: '800' },
    rateMainLabel: { fontSize: 11, marginTop: 2 },
    rateSubValue: { fontSize: 18, fontWeight: '700' },
    rateDividerV: { width: 1, height: 36 },
    rateInfoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignSelf: 'center',
    },
    rateInfoText: { fontSize: 12, fontWeight: '600' },

    // Preview
    previewCard: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    previewLoading: { textAlign: 'center', marginTop: 8, fontSize: 13 },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    previewItem: { flex: 1, alignItems: 'center' },
    previewItemLabel: { fontSize: 12, marginBottom: 4 },
    previewItemValue: { fontSize: 22, fontWeight: '800' },
    previewTotalValue: { fontSize: 18, fontWeight: '700' },
    previewDivider: { width: 1, height: 40, marginHorizontal: 12 },
    previewInterest: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    previewInterestText: { fontSize: 12, fontWeight: '500' },

    // Sticky bottom bar
    stickyBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderTopWidth: 1, gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06, shadowRadius: 6, elevation: 8,
    },
    stickyBarInfo: { flex: 1 },
    stickyLabel: { fontSize: 12, marginBottom: 2 },
    stickyValue: { fontSize: 17, fontWeight: '800' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14,
    },
    nextBtnText: { fontSize: 15, fontWeight: '700' },
});
