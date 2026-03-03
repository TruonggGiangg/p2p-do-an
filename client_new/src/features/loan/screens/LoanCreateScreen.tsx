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
    Modal,
    FlatList,
    Animated,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, CommonButton } from '../../../components';
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

// ── Rate Stepper ─────────────────────────────────────────────────────────────
function RateStepper({
    value,
    onChange,
    min,
    max,
    step = 0.1,
    primaryColor,
    textColor,
    borderColor,
    dimColor,
    isProductAnnual,
}: {
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step?: number;
    primaryColor: string;
    textColor: string;
    borderColor: string;
    dimColor: string;
    isProductAnnual?: boolean;
}) {
    const pressAnim = useRef(new Animated.Value(1)).current;
    const inputRef = useRef<TextInput>(null);
    const [inputText, setInputText] = useState(value.toFixed(1));

    useEffect(() => {
        const s = value.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0*$/, '$1');
        setInputText(s.indexOf('.') === -1 ? s + '.0' : s);
    }, [value]);

    const clamp = (v: number) => {
        const clamped = Math.max(min, Math.min(max, v));
        // Use floor to strictly prevent exceeding the max limit
        return Math.floor(clamped * 100 + 0.0001) / 100;
    };

    const decrement = () => {
        if (value <= min) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const next = clamp(value - step);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.94, duration: 60, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
    };
    const increment = () => {
        if (value >= max) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const next = clamp(value + step);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.94, duration: 60, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
    };

    const handleTextChange = (t: string) => {
        setInputText(t);
        const num = parseFloat(t);
        if (!isNaN(num)) onChange(clamp(num));
    };

    const secondaryRate = (value * 12).toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0*$/, '$1');
    const isAboveDefault = value >= max - 0.001; // warn if at max or high
    // Progress bar percentage for visual indicator
    const progressPct = max > min ? ((value - min) / (max - min)) * 100 : 50;

    return (
        <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
            {/* Main rate display card */}
            <View style={[stepperStyles.rateCard, { backgroundColor: primaryColor + '08', borderColor: primaryColor + '20' }]}>
                <View style={stepperStyles.rateDisplay}>
                    <View style={stepperStyles.inputRow}>
                        <TextInput
                            ref={inputRef}
                            style={[stepperStyles.input, { color: primaryColor }]}
                            value={inputText}
                            onChangeText={handleTextChange}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                        />
                        <Text style={[stepperStyles.unit, { color: primaryColor + '99' }]}>%/tháng</Text>
                    </View>
                    <View style={[stepperStyles.annualBadge, { backgroundColor: primaryColor + '15' }]}>
                        <MaterialCommunityIcons name="calendar-month" size={12} color={primaryColor} />
                        <Text style={[stepperStyles.annualText, { color: primaryColor }]}>≈ {secondaryRate}%/năm</Text>
                    </View>
                </View>

                {/* Visual progress bar */}
                <View style={stepperStyles.progressContainer}>
                    <View style={[stepperStyles.progressBg, { backgroundColor: dimColor + '20' }]}>
                        <View style={[
                            stepperStyles.progressFill,
                            {
                                backgroundColor: isAboveDefault ? '#FF6B00' : primaryColor,
                                width: `${Math.min(100, Math.max(0, progressPct))}%`,
                            },
                        ]} />
                    </View>
                    <View style={stepperStyles.progressLabels}>
                        <Text style={[stepperStyles.progressLabel, { color: dimColor }]}>{+min.toFixed(1)}%</Text>
                        <Text style={[stepperStyles.progressLabel, { color: dimColor }]}>{+(Math.floor(max * 100 + 0.0001) / 100).toFixed(1)}%</Text>
                    </View>
                </View>
            </View>

            {/* +/- buttons row */}
            <View style={stepperStyles.btnRow}>
                <TouchableOpacity
                    style={[
                        stepperStyles.btn,
                        { backgroundColor: value <= min ? dimColor + '15' : primaryColor + '15', borderColor: value <= min ? dimColor + '30' : primaryColor + '30' },
                    ]}
                    onPress={decrement}
                    disabled={value <= min}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="minus" size={22} color={value <= min ? dimColor : primaryColor} />
                    <Text style={[stepperStyles.btnLabel, { color: value <= min ? dimColor : primaryColor }]}>Giảm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        stepperStyles.btn,
                        { backgroundColor: value >= max ? dimColor + '15' : primaryColor + '15', borderColor: value >= max ? dimColor + '30' : primaryColor + '30' },
                    ]}
                    onPress={increment}
                    disabled={value >= max}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="plus" size={22} color={value >= max ? dimColor : primaryColor} />
                    <Text style={[stepperStyles.btnLabel, { color: value >= max ? dimColor : primaryColor }]}>Tăng</Text>
                </TouchableOpacity>
            </View>

            {isAboveDefault && (
                <View style={[stepperStyles.warning, { backgroundColor: '#FF6B00' + '15' }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#FF6B00" />
                    <Text style={[stepperStyles.warningText, { color: '#FF6B00' }]}>Lãi suất ở mức cao nhất cho phép</Text>
                </View>
            )}
        </Animated.View>
    );
}

const stepperStyles = StyleSheet.create({
    rateCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
    },
    rateDisplay: {
        alignItems: 'center',
        marginBottom: 16,
    },
    inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    input: { fontSize: 36, fontWeight: '800', textAlign: 'center', minWidth: 70 },
    unit: { fontSize: 14, fontWeight: '600' },
    annualBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginTop: 6,
    },
    annualText: { fontSize: 12, fontWeight: '600' },
    progressContainer: { paddingHorizontal: 4 },
    progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    progressLabel: { fontSize: 11, fontWeight: '500' },
    btnRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    btn: {
        flex: 1,
        flexDirection: 'row',
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
    },
    btnLabel: { fontSize: 13, fontWeight: '600' },
    warning: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        padding: 8, borderRadius: 8, marginTop: 8,
    },
    warningText: { fontSize: 12, color: '#FF6B00', fontWeight: '500' },
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
    // Rate mode: 'default' | 'custom'
    const [rateMode, setRateMode] = useState<'default' | 'custom'>('default');
    const [customRate, setCustomRate] = useState(0);
    const [schedule, setSchedule] = useState<LoanScheduleResult | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [loadingPreview, setLoadingPreview] = useState(false);

    const minRep = config?.minNumberOfRepayments ?? 1;
    const maxRep = config?.maxNumberOfRepayments ?? 360;
    const periodOptions = DEFAULT_PERIOD_OPTIONS.filter((p) => p >= minRep && p <= maxRep);
    if (periodOptions.length === 0) periodOptions.push(minRep);
    const effectivePeriod = customPeriod ? parseInt(customPeriod, 10) || periodMonth : periodMonth;
    const defaultRate = config?.monthlyRate ?? 0;
    // Dùng min/max lãi suất từ Fineract (minInterestRatePerPeriod, maxInterestRatePerPeriod)
    const rateMin = config?.minInterestRatePerPeriod != null
        ? (config.isAnnual ? config.minInterestRatePerPeriod / 12 : config.minInterestRatePerPeriod)
        : Math.max(0.1, +(defaultRate - 2).toFixed(1));
    const rateMax = config?.maxInterestRatePerPeriod != null
        ? (config.isAnnual ? config.maxInterestRatePerPeriod / 12 : config.maxInterestRatePerPeriod)
        : Math.max(defaultRate, +(defaultRate + 2).toFixed(1));
    const effectiveRate = rateMode === 'custom' ? customRate : defaultRate;
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
            // Normalize min/max to monthly
            const isAnnual = c?.isAnnual ?? false;
            const normMin = c?.minInterestRatePerPeriod != null
                ? (isAnnual ? c.minInterestRatePerPeriod / 12 : c.minInterestRatePerPeriod)
                : Math.max(0.1, +(c.monthlyRate - 2).toFixed(1));
            const normMax = c?.maxInterestRatePerPeriod != null
                ? (isAnnual ? c.maxInterestRatePerPeriod / 12 : c.maxInterestRatePerPeriod)
                : Math.max(c.monthlyRate, +(c.monthlyRate + 2).toFixed(1));

            setCustomRate(() => {
                const initRate = c?.monthlyRate ?? 1.5;
                return Math.max(normMin, Math.min(normMax, initRate));
            });
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
                monthlyRatePercent: effectiveRate > 0 ? effectiveRate : undefined,
            });
            setSchedule(result);
        } catch (e) {
            setSchedule(null);
        } finally {
            setLoadingPreview(false);
        }
    }, [product?.id, capitalNum, effectivePeriod, effectiveRate]);

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
        if (effectiveRate > rateMax + 0.0001 || effectiveRate < rateMin - 0.0001) {
            Alert.alert('Lỗi', `Lãi suất phải nằm trong khoảng ${+rateMin.toFixed(2)}% - ${+rateMax.toFixed(2)}% / tháng`);
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
            monthlyRatePercent: rateMode === 'custom' ? effectiveRate : undefined,
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

                    {/* ── Section 3: Lãi suất ── */}
                    <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: '#00B894' + '15' }]}>
                                <MaterialCommunityIcons name="percent-outline" size={20} color="#00B894" />
                            </View>
                            <View style={styles.sectionHeaderText}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Lãi suất</Text>
                                <Text style={[styles.sectionHint, { color: theme.colors.textDim }]}>
                                    {rateMode === 'default' ? 'Lãi suất mặc định' : 'Tuỳ chỉnh'}
                                </Text>
                            </View>
                        </View>

                        {loadingConfig ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : config && (
                            <>
                                {rateMode === 'default' ? (
                                    <View style={[styles.rateCard, { backgroundColor: theme.colors.primary + '06', borderColor: theme.colors.primary + '18' }]}>
                                        <View style={styles.rateCardTop}>
                                            <View>
                                                <Text style={[styles.rateMainValue, { color: theme.colors.primary }]}>
                                                    {+config.monthlyRate.toFixed(2)}%
                                                </Text>
                                                <Text style={[styles.rateMainLabel, { color: theme.colors.textDim }]}>mỗi tháng</Text>
                                            </View>
                                            <View style={[styles.rateDividerV, { backgroundColor: theme.colors.border }]} />
                                            <View>
                                                <Text style={[styles.rateSubValue, { color: theme.colors.textSecondary }]}>
                                                    ≈ {+config.annualRate.toFixed(2)}%
                                                </Text>
                                                <Text style={[styles.rateMainLabel, { color: theme.colors.textDim }]}>mỗi năm</Text>
                                            </View>
                                            <View style={[styles.recommendBadge, { backgroundColor: '#00B894' + '15' }]}>
                                                <MaterialCommunityIcons name="star" size={10} color="#00B894" />
                                                <Text style={styles.recommendBadgeText}>Tốt nhất</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.customizeBtn, { borderColor: theme.colors.border }]}
                                            onPress={() => setRateMode('custom')}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialCommunityIcons name="tune-variant" size={14} color={theme.colors.textDim} />
                                            <Text style={[styles.customizeBtnText, { color: theme.colors.textDim }]}>Tuỳ chỉnh lãi suất</Text>
                                            <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textDim} />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View>
                                        <RateStepper
                                            value={customRate}
                                            onChange={setCustomRate}
                                            min={rateMin}
                                            max={rateMax}
                                            step={0.1}
                                            primaryColor={theme.colors.primary}
                                            textColor={theme.colors.textPrimary}
                                            borderColor={theme.colors.border}
                                            dimColor={theme.colors.textDim}
                                            isProductAnnual={config.isAnnual}
                                        />
                                        <TouchableOpacity onPress={() => setRateMode('default')} style={styles.rateResetLink}>
                                            <MaterialCommunityIcons name="arrow-left" size={14} color={theme.colors.primary} />
                                            <Text style={[styles.rateResetLinkText, { color: theme.colors.primary }]}>Dùng lãi mặc định</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </>
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
        gap: 16,
    },
    rateMainValue: { fontSize: 28, fontWeight: '800' },
    rateMainLabel: { fontSize: 11, marginTop: 2 },
    rateSubValue: { fontSize: 18, fontWeight: '700' },
    rateDividerV: { width: 1, height: 36 },
    recommendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 'auto',
    },
    recommendBadgeText: { fontSize: 10, fontWeight: '700', color: '#00B894' },
    customizeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    customizeBtnText: { fontSize: 12, fontWeight: '600', flex: 1 },
    rateResetLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
    rateResetLinkText: { fontSize: 13, fontWeight: '600' },

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

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
    modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
    purposeItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10,
    },
    purposeItemText: { fontSize: 15, fontWeight: '500' },
    modalClose: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    modalCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
