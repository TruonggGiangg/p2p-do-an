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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, CommonButton } from '../../../components';
import { loanService, LoanProduct, LoanProductConfig, LoanScheduleResult } from '../services/loan.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

const DEFAULT_PERIOD_OPTIONS = [3, 6, 9, 12, 18, 24];
const QUICK_AMOUNTS = [
    { label: '5 tr', value: 5000000 },
    { label: '10 tr', value: 10000000 },
    { label: '20 tr', value: 20000000 },
    { label: '50 tr', value: 50000000 },
];

type RouteParams = { product: LoanProduct; willing?: string };
type LoanCreateNav = NativeStackNavigationProp<RootStackParamList, 'LoanCreate'>;

// ── Step indicator: đơn giản Bước 1/2 ───────────────────────────────────────
function StepIndicator({ current, theme }: { current: number; theme: any }) {
    const c = theme.colors;
    return (
        <View style={[stepStyles.container, { backgroundColor: c.surfaceLight }]}>
            <View style={[stepStyles.pill, { backgroundColor: c.primary }]}>
                <Text style={stepStyles.pillText}>Bước {current + 1}/2</Text>
            </View>
            <Text style={[stepStyles.sub, { color: c.textSecondary }]}>
                {current === 0 ? 'Nhập thông tin vay' : 'Xác nhận & gửi đơn'}
            </Text>
        </View>
    );
}

const stepStyles = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
    pillText: { fontSize: 13, fontWeight: '700', color: '#000' },
    sub: { fontSize: 13 },
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

    return (
        <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
            <View style={[stepperStyles.row, { borderColor }]}>
                <TouchableOpacity
                    style={[
                        stepperStyles.btn,
                        { backgroundColor: value <= min ? dimColor + '25' : primaryColor + '25', borderColor },
                        value <= min && stepperStyles.btnDisabled,
                    ]}
                    onPress={decrement}
                    disabled={value <= min}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="minus" size={24} color={value <= min ? dimColor : primaryColor} />
                </TouchableOpacity>

                <View style={stepperStyles.center}>
                    <View style={stepperStyles.inputRow}>
                        <TextInput
                            ref={inputRef}
                            style={[stepperStyles.input, { color: primaryColor }]}
                            value={inputText}
                            onChangeText={handleTextChange}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                        />
                        <Text style={[stepperStyles.unit, { color: dimColor }]}>%/tháng</Text>
                    </View>
                    <Text style={[stepperStyles.annual, { color: dimColor }]}>= {secondaryRate}%/năm</Text>
                </View>

                <TouchableOpacity
                    style={[
                        stepperStyles.btn,
                        { backgroundColor: value >= max ? dimColor + '25' : primaryColor + '25', borderColor },
                        value >= max && stepperStyles.btnDisabled,
                    ]}
                    onPress={increment}
                    disabled={value >= max}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="plus" size={24} color={value >= max ? dimColor : primaryColor} />
                </TouchableOpacity>
            </View>

            <Text style={[stepperStyles.rangeHint, { color: dimColor }]}>
                Khoảng: {+min.toFixed(1)}% – {+(Math.floor(max * 100 + 0.0001) / 100).toFixed(1)}% / tháng
            </Text>

            {isAboveDefault && (
                <View style={[stepperStyles.warning, { backgroundColor: primaryColor + '25' }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={14} color={primaryColor} />
                    <Text style={[stepperStyles.warningText, { color: primaryColor }]}>Lãi suất cao hơn mức khuyến nghị</Text>
                </View>
            )}
        </Animated.View>
    );
}

const stepperStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: 14,
        overflow: 'hidden',
    },
    btn: {
        width: 56, height: 56,
        justifyContent: 'center', alignItems: 'center',
        borderRightWidth: 1, borderLeftWidth: 1,
    },
    btnDisabled: { opacity: 0.6 },
    center: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
    input: { fontSize: 22, fontWeight: '800', textAlign: 'center', minWidth: 60 },
    unit: { fontSize: 13, fontWeight: '500' },
    annual: { fontSize: 12, marginTop: 2 },
    rangeHint: { fontSize: 11, marginTop: 8 },
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
                    {/* ── Một card gộp: Số tiền + Kỳ hạn + Lãi suất ── */}
                    <CommonCard style={[styles.mainCard, { backgroundColor: theme.colors.surface }]}>
                        {/* Số tiền */}
                        <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>1. Số tiền vay</Text>
                        <TextInput
                            style={[styles.amountInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
                            placeholder="Nhập số tiền (VD: 10.000.000)"
                            placeholderTextColor={theme.colors.textDim}
                            value={capital ? capital.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                            onChangeText={(t) => setCapital(t.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                        />
                        <View style={styles.quickAmountRow}>
                            {QUICK_AMOUNTS.map((qa) => {
                                const isSelected = capitalNum === qa.value;
                                return (
                                    <TouchableOpacity
                                        key={qa.value}
                                        style={[
                                            styles.quickChip,
                                            { borderColor: isSelected ? theme.colors.primary : theme.colors.border },
                                            isSelected && { backgroundColor: theme.colors.primary + '18' },
                                        ]}
                                        onPress={() => setCapital(String(qa.value))}
                                    >
                                        <Text style={[styles.quickChipText, { color: isSelected ? theme.colors.primary : theme.colors.textSecondary }]}>
                                            {qa.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {product?.minPrincipal != null && (
                            <Text style={[styles.hintSmall, { color: theme.colors.textDim }]}>
                                Hạn mức: {(product.minPrincipal / 1e6).toFixed(0)}tr – {(product.maxPrincipal! / 1e6).toFixed(0)}tr đ
                            </Text>
                        )}

                        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

                        {/* Kỳ hạn: chips + nhập tùy chọn theo min-max từ Fineract */}
                        <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>2. Kỳ hạn (tháng)</Text>
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

                        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

                        {/* Lãi suất */}
                        <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>3. Lãi suất</Text>
                        {loadingConfig ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : config && (
                            <>
                                {rateMode === 'default' ? (
                                    <View style={[styles.rateSimple, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '30' }]}>
                                        <Text style={[styles.rateSimpleMain, { color: theme.colors.primary }]}>
                                            {+config.monthlyRate.toFixed(2)}% / tháng
                                        </Text>
                                        <Text style={[styles.rateSimpleSub, { color: theme.colors.textSecondary }]}>
                                            ≈ {+config.annualRate.toFixed(2)}% / năm
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.rateCustomLink, { borderColor: theme.colors.border }]}
                                            onPress={() => setRateMode('custom')}
                                        >
                                            <MaterialCommunityIcons name="tune-variant" size={14} color={theme.colors.textDim} />
                                            <Text style={[styles.rateCustomLinkText, { color: theme.colors.textDim }]}>Tùy chỉnh</Text>
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
                                            <Text style={[styles.rateResetLinkText, { color: theme.colors.primary }]}>← Dùng lãi mặc định</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </>
                        )}

                        {/* Kết quả ước tính */}
                        {loadingPreview ? (
                            <View style={[styles.resultBox, { backgroundColor: theme.colors.surfaceLight }]}>
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                                <Text style={[styles.resultLabel, { color: theme.colors.textDim }]}>Đang tính...</Text>
                            </View>
                        ) : schedule && capitalNum >= 100000 ? (
                            <View style={[styles.resultBox, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '25' }]}>
                                <Text style={[styles.resultLabel, { color: theme.colors.textSecondary }]}>Trả hàng tháng</Text>
                                <Text style={[styles.resultAmount, { color: theme.colors.primary }]}>
                                    {schedule.monthlyPay.toLocaleString('vi-VN')} đ
                                </Text>
                                <Text style={[styles.resultTotal, { color: theme.colors.textDim }]}>
                                    Tổng trả: {schedule.entirelyPay.toLocaleString('vi-VN')} đ
                                </Text>
                            </View>
                        ) : null}
                    </CommonCard>

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* ── Sticky Bottom Bar ── */}
                <View style={[styles.stickyBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
                    {schedule && capitalNum >= 100000 ? (
                        <View style={styles.stickyBarInfo}>
                            <Text style={[styles.stickyLabel, { color: theme.colors.textDim }]}>Tổng trả ước tính</Text>
                            <Text style={[styles.stickyValue, { color: theme.colors.textPrimary }]}>
                                {schedule.entirelyPay.toLocaleString('vi-VN')} đ
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.stickyBarInfo}>
                            <Text style={[styles.stickyLabel, { color: theme.colors.textDim }]}>
                                {capitalNum < 100000 ? 'Số tiền tối thiểu 100.000 đ' : 'Đang tính toán...'}
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

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    keyboardContainer: { flex: 1 },
    scrollContainer: { flex: 1 },
    flex: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { padding: 16, marginBottom: 14, borderRadius: 16 },
    mainCard: { padding: 20, marginBottom: 16, borderRadius: 18 },
    loader: { marginVertical: 24 },

    sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
    divider: { height: 1, marginVertical: 18 },

    // Amount
    amountInput: {
        borderWidth: 1.5, borderRadius: 12, padding: 14,
        fontSize: 20, fontWeight: '700', marginBottom: 10,
    },
    hintSmall: { fontSize: 11, marginTop: 4 },
    quickAmountRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    rateSimple: { padding: 14, borderRadius: 12, borderWidth: 1 },
    rateSimpleMain: { fontSize: 20, fontWeight: '800' },
    rateSimpleSub: { fontSize: 12, marginTop: 4 },
    rateCustomLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
    rateCustomLinkText: { fontSize: 12, fontWeight: '600' },
    rateResetLink: { marginTop: 8 },
    rateResetLinkText: { fontSize: 12, fontWeight: '600' },
    resultBox: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
    resultLabel: { fontSize: 12, marginBottom: 4 },
    resultAmount: { fontSize: 20, fontWeight: '800' },
    resultTotal: { fontSize: 12, marginTop: 4 },
    quickChip: {
        flex: 1, paddingVertical: 8, borderRadius: 10,
        borderWidth: 1, alignItems: 'center',
    },
    quickChipText: { fontSize: 13, fontWeight: '600' },


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
    stickyValue: { fontSize: 16, fontWeight: '700' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12,
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
