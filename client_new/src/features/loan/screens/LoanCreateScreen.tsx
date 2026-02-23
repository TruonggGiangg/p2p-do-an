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

// ── Step indicator ──────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
    const steps = ['Thông tin', 'Xác nhận', 'Hoàn tất'];
    return (
        <View style={stepStyles.container}>
            {steps.map((label, idx) => {
                const done = idx < current;
                const active = idx === current;
                return (
                    <React.Fragment key={idx}>
                        <View style={stepStyles.step}>
                            <View style={[
                                stepStyles.dot,
                                done && stepStyles.dotDone,
                                active && stepStyles.dotActive,
                            ]}>
                                {done
                                    ? <MaterialCommunityIcons name="check" size={12} color="#fff" />
                                    : <Text style={[stepStyles.dotText, active && { color: '#fff' }]}>{idx + 1}</Text>
                                }
                            </View>
                            <Text style={[
                                stepStyles.label,
                                active && stepStyles.labelActive,
                                done && stepStyles.labelDone,
                            ]}>{label}</Text>
                        </View>
                        {idx < steps.length - 1 && <View style={[stepStyles.line, done && stepStyles.lineDone]} />}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

const stepStyles = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    step: { alignItems: 'center', gap: 4 },
    dot: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center',
    },
    dotActive: { backgroundColor: '#F5A623' },
    dotDone: { backgroundColor: '#4CAF50' },
    dotText: { fontSize: 12, fontWeight: '700', color: '#888' },
    label: { fontSize: 10, color: '#aaa', fontWeight: '500' },
    labelActive: { color: '#F5A623', fontWeight: '700' },
    labelDone: { color: '#4CAF50' },
    line: { flex: 1, height: 2, backgroundColor: '#ddd', marginHorizontal: 4, marginBottom: 14 },
    lineDone: { backgroundColor: '#4CAF50' },
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
        const next = clamp(value - step);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();
    };
    const increment = () => {
        const next = clamp(value + step);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
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
                    style={[stepperStyles.btn, { backgroundColor: value <= min ? borderColor : primaryColor + '20', borderColor }]}
                    onPress={decrement}
                    disabled={value <= min}
                >
                    <MaterialCommunityIcons name="minus" size={20} color={value <= min ? dimColor : primaryColor} />
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
                    style={[stepperStyles.btn, { backgroundColor: value >= max ? borderColor : primaryColor + '20', borderColor }]}
                    onPress={increment}
                    disabled={value >= max}
                >
                    <MaterialCommunityIcons name="plus" size={20} color={value >= max ? dimColor : primaryColor} />
                </TouchableOpacity>
            </View>

            <View style={stepperStyles.rangeRow}>
                <View style={{ flex: 1 }}>
                    <Text style={[stepperStyles.rangeText, { color: dimColor }]}>Min: {+min.toFixed(2)}%</Text>
                    {isProductAnnual && (
                        <Text style={[stepperStyles.rangeSub, { color: dimColor }]}>({+(min * 12).toFixed(1)}%/năm)</Text>
                    )}
                </View>
                <View style={[stepperStyles.rangeBar, { backgroundColor: dimColor + '30', marginHorizontal: 8 }]}>
                    <View style={[
                        stepperStyles.rangeBarFill,
                        { backgroundColor: primaryColor, width: `${Math.min(100, Math.max(0, ((value - min) / Math.max(0.01, (max - min))) * 100))}%` }
                    ]} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[stepperStyles.rangeText, { color: dimColor, textAlign: 'right' }]}>
                        Max: {+(Math.floor(max * 100 + 0.0001) / 100).toFixed(2)}%
                    </Text>
                    {isProductAnnual && (
                        <Text style={[stepperStyles.rangeSub, { color: dimColor, textAlign: 'right' }]}>
                            ({+(max * 12).toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0*$/, '$1')}%/năm)
                        </Text>
                    )}
                </View>
            </View>

            {isAboveDefault && (
                <View style={[stepperStyles.warning, { backgroundColor: '#FF6B0020' }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#FF6B00" />
                    <Text style={stepperStyles.warningText}>Lãi suất cao hơn mức khuyến nghị</Text>
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
        width: 52, height: 52,
        justifyContent: 'center', alignItems: 'center',
        borderRightWidth: 1, borderLeftWidth: 1,
    },
    center: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
    input: { fontSize: 22, fontWeight: '800', textAlign: 'center', minWidth: 60 },
    unit: { fontSize: 13, fontWeight: '500' },
    annual: { fontSize: 12, marginTop: 2 },
    rangeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    rangeText: { fontSize: 11, fontWeight: '700' },
    rangeSub: { fontSize: 9, marginTop: 1 },
    rangeBar: { flex: 2, height: 4, borderRadius: 2, overflow: 'hidden' },
    rangeBarFill: { height: '100%', borderRadius: 2 },
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
        const next = clamp(value - 1);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();
    };
    const increment = () => {
        const next = clamp(value + 1);
        onChange(next);
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();
    };

    const handleTextChange = (t: string) => {
        setInputText(t);
        const num = parseInt(t, 10);
        if (!isNaN(num)) onChange(clamp(num));
    };

    const quickChips = PERIOD_QUICK_OPTIONS.filter((p) => p >= min && p <= max);
    const progress = Math.min(1, Math.max(0, (value - min) / Math.max(1, max - min)));

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
                                {p} th
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Stepper row */}
            <View style={[periodStepperStyles.row, { borderColor }]}>
                <TouchableOpacity
                    style={[periodStepperStyles.btn, { backgroundColor: value <= min ? borderColor : primaryColor + '20', borderColor }]}
                    onPress={decrement}
                    disabled={value <= min}
                >
                    <MaterialCommunityIcons name="minus" size={20} color={value <= min ? dimColor : primaryColor} />
                </TouchableOpacity>

                <View style={periodStepperStyles.center}>
                    <View style={periodStepperStyles.inputRow}>
                        <TextInput
                            style={[periodStepperStyles.input, { color: primaryColor }]}
                            value={inputText}
                            onChangeText={handleTextChange}
                            keyboardType="number-pad"
                            selectTextOnFocus
                        />
                        <Text style={[periodStepperStyles.unit, { color: dimColor }]}>tháng</Text>
                    </View>
                    <Text style={[periodStepperStyles.sub, { color: dimColor }]}>
                        trong {min} – {max} tháng
                    </Text>
                </View>

                <TouchableOpacity
                    style={[periodStepperStyles.btn, { backgroundColor: value >= max ? borderColor : primaryColor + '20', borderColor }]}
                    onPress={increment}
                    disabled={value >= max}
                >
                    <MaterialCommunityIcons name="plus" size={20} color={value >= max ? dimColor : primaryColor} />
                </TouchableOpacity>
            </View>

            {/* Progress bar */}
            <View style={periodStepperStyles.rangeRow}>
                <Text style={[periodStepperStyles.rangeText, { color: dimColor }]}>Min: {min}th</Text>
                <View style={[periodStepperStyles.rangeBar, { backgroundColor: dimColor + '30' }]}>
                    <View style={[periodStepperStyles.rangeBarFill, { backgroundColor: primaryColor, width: `${progress * 100}%` }]} />
                </View>
                <Text style={[periodStepperStyles.rangeText, { color: dimColor }]}>Max: {max}th</Text>
            </View>
        </Animated.View>
    );
}

const periodStepperStyles = StyleSheet.create({
    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
    chipText: { fontSize: 13, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, overflow: 'hidden' },
    btn: { width: 52, height: 52, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderLeftWidth: 1 },
    center: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    input: { fontSize: 28, fontWeight: '800', textAlign: 'center', minWidth: 60 },
    unit: { fontSize: 14, fontWeight: '500' },
    sub: { fontSize: 11, marginTop: 2 },
    rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    rangeText: { fontSize: 11, width: 46 },
    rangeBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
    rangeBarFill: { height: '100%', borderRadius: 2 },
});

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function LoanCreateScreen() {
    const { theme } = useTheme();
    const route = useRoute();
    const navigation = useNavigation<LoanCreateNav>();
    const { product, willing: initialWilling } = (route.params || {}) as RouteParams;

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
            <StepIndicator current={0} />

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={80}
            >
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Số tiền vay ── */}
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.cardLabel, { color: theme.colors.textDim }]}>Số tiền vay (VND)</Text>
                        <TextInput
                            style={[styles.amountInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
                            placeholder="10.000.000"
                            placeholderTextColor={theme.colors.textDim}
                            value={capital ? capital.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                            onChangeText={(t) => setCapital(t.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                        />
                        {/* Quick amount chips */}
                        <View style={styles.quickAmountRow}>
                            {QUICK_AMOUNTS.map((qa) => {
                                const isSelected = capitalNum === qa.value;
                                return (
                                    <TouchableOpacity
                                        key={qa.value}
                                        style={[
                                            styles.quickChip,
                                            { borderColor: isSelected ? theme.colors.primary : theme.colors.border },
                                            isSelected && { backgroundColor: theme.colors.primary + '15' },
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
                        {config?.inMultiplesOf && config.inMultiplesOf > 1 && (
                            <View style={styles.hintRow}>
                                <MaterialCommunityIcons name="information-outline" size={13} color={theme.colors.textDim} />
                                <Text style={[styles.hint, { color: theme.colors.textDim }]}>
                                    Làm tròn theo bội số {config.inMultiplesOf.toLocaleString('vi-VN')} VND
                                </Text>
                            </View>
                        )}
                    </CommonCard>

                    {/* ── Kỳ hạn ── */}
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.rateTitleRow}>
                            <Text style={[styles.cardLabel, { color: theme.colors.textDim, marginBottom: 0 }]}>Kỳ hạn</Text>
                            {(minRep !== 1 || maxRep !== 360) && (
                                <View style={[styles.calcMethodBadge, { backgroundColor: theme.colors.surfaceLight }]}>
                                    <Text style={[styles.calcMethodText, { color: theme.colors.textSecondary }]}>
                                        {minRep} – {maxRep} tháng
                                    </Text>
                                </View>
                            )}
                        </View>
                        {loadingConfig ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : (
                            <PeriodStepper
                                value={effectivePeriod}
                                onChange={(v) => {
                                    setPeriodMonth(v);
                                    setCustomPeriod('');
                                }}
                                min={minRep}
                                max={maxRep}
                                primaryColor={theme.colors.primary}
                                textColor={theme.colors.textPrimary}
                                borderColor={theme.colors.border}
                                dimColor={theme.colors.textDim}
                            />
                        )}
                    </CommonCard>

                    {/* ── Lãi suất ── */}
                    {loadingConfig ? (
                        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
                    ) : config && (
                        <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                            <View style={styles.rateTitleRow}>
                                <Text style={[styles.cardLabel, { color: theme.colors.textDim, marginBottom: 0 }]}>Lãi suất</Text>
                                <View style={[styles.calcMethodBadge, { backgroundColor: theme.colors.surfaceLight }]}>
                                    <Text style={[styles.calcMethodText, { color: theme.colors.textSecondary }]}>
                                        {config.interestType}
                                    </Text>
                                </View>
                            </View>

                            {/* Toggle: Mặc định / Tự chọn */}
                            <View style={[styles.toggleRow, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                                <TouchableOpacity
                                    style={[
                                        styles.toggleBtn,
                                        rateMode === 'default' && { backgroundColor: theme.colors.primary }
                                    ]}
                                    onPress={() => setRateMode('default')}
                                >
                                    <MaterialCommunityIcons
                                        name="lock-outline"
                                        size={16}
                                        color={rateMode === 'default' ? '#fff' : theme.colors.textDim}
                                    />
                                    <Text style={[styles.toggleText, { color: rateMode === 'default' ? '#fff' : theme.colors.textDim }]}>
                                        Mặc định
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.toggleBtn,
                                        rateMode === 'custom' && { backgroundColor: theme.colors.primary }
                                    ]}
                                    onPress={() => setRateMode('custom')}
                                >
                                    <MaterialCommunityIcons
                                        name="tune-variant"
                                        size={16}
                                        color={rateMode === 'custom' ? '#fff' : theme.colors.textDim}
                                    />
                                    <Text style={[styles.toggleText, { color: rateMode === 'custom' ? '#fff' : theme.colors.textDim }]}>
                                        Tự chọn
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {rateMode === 'default' ? (
                                /* Default rate display */
                                <View style={[styles.defaultRateBox, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '25' }]}>
                                    <Text style={[styles.defaultRateMainText, { color: theme.colors.primary }]}>
                                        {+config.monthlyRate.toFixed(2)}% / tháng
                                    </Text>
                                    <Text style={[styles.defaultRateAnnualText, { color: theme.colors.textSecondary }]}>
                                        tương đương {+config.annualRate.toFixed(2)}% / năm
                                    </Text>
                                </View>
                            ) : (
                                /* Custom rate stepper */
                                <View style={{ marginTop: 12 }}>
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
                                </View>
                            )}

                            {/* Live monthly estimate */}
                            {loadingPreview ? (
                                <View style={styles.estimateLoading}>
                                    <ActivityIndicator size="small" color={theme.colors.primary} />
                                    <Text style={[styles.estimateText, { color: theme.colors.textDim }]}>Đang tính...</Text>
                                </View>
                            ) : schedule && capitalNum >= 100000 ? (
                                <View style={[styles.estimateBox, { backgroundColor: theme.colors.primary + '08', borderColor: theme.colors.primary + '20' }]}>
                                    <MaterialCommunityIcons name="calendar-check-outline" size={16} color={theme.colors.primary} />
                                    <Text style={[styles.estimateLabel, { color: theme.colors.textDim }]}>Trả hàng tháng ≈</Text>
                                    <Text style={[styles.estimateAmount, { color: theme.colors.primary }]}>
                                        {schedule.monthlyPay.toLocaleString('vi-VN')} đ
                                    </Text>
                                </View>
                            ) : null}
                        </CommonCard>
                    )}

                    {/* ── Mục đích vay (cố định theo sản phẩm) ── */}
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.cardLabel, { color: theme.colors.textDim }]}>Mục đích vay</Text>
                        <View style={[styles.purposeFixed, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '30' }]}>
                            <MaterialCommunityIcons name="bullseye-arrow" size={20} color={theme.colors.primary} />
                            <Text style={[styles.purposeFixedText, { color: theme.colors.primary }]}>{willing || product.name}</Text>
                            <View style={[styles.purposeFixedBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                                <MaterialCommunityIcons name="lock-outline" size={12} color={theme.colors.primary} />
                                <Text style={[styles.purposeFixedBadgeText, { color: theme.colors.primary }]}>Cố định</Text>
                            </View>
                        </View>
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
                            <Text style={[styles.stickyLabel, { color: theme.colors.textDim }]}>Nhập đủ thông tin để xem ước tính</Text>
                        </View>
                    )}
                    <TouchableOpacity
                        style={[styles.nextBtn, { backgroundColor: canProceed ? theme.colors.primary : theme.colors.border }]}
                        onPress={handleNext}
                        disabled={!canProceed}
                    >
                        <Text style={[styles.nextBtnText, { color: canProceed ? '#fff' : theme.colors.textDim }]}>Tiếp tục</Text>
                        <MaterialCommunityIcons name="arrow-right" size={18} color={canProceed ? '#fff' : theme.colors.textDim} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { padding: 16, marginBottom: 14, borderRadius: 16 },
    loader: { marginVertical: 24 },

    // Labels
    cardLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },

    // Amount
    amountInput: {
        borderWidth: 1.5, borderRadius: 12, padding: 14,
        fontSize: 22, fontWeight: '700', marginBottom: 12,
    },
    quickAmountRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    quickChip: {
        flex: 1, paddingVertical: 8, borderRadius: 10,
        borderWidth: 1, alignItems: 'center',
    },
    quickChipText: { fontSize: 13, fontWeight: '600' },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    hint: { fontSize: 12 },

    // Period
    periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    periodChip: {
        paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 12, borderWidth: 1.5,
        alignItems: 'center', flexDirection: 'row', gap: 2,
    },
    periodText: { fontSize: 15 },
    periodUnit: { fontSize: 10 },
    customPeriodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    customPeriodLabel: { fontSize: 13 },
    customPeriodInput: {
        borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
        fontSize: 15, fontWeight: '600', width: 70, textAlign: 'center',
    },

    // Rate
    rateTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    calcMethodBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    calcMethodText: { fontSize: 11, fontWeight: '600' },

    toggleRow: {
        flexDirection: 'row',
        borderWidth: 1.5,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 14,
    },
    toggleBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 10,
    },
    toggleText: { fontSize: 14, fontWeight: '600' },

    defaultRateBox: {
        alignItems: 'center', padding: 16,
        borderRadius: 12, borderWidth: 1,
    },
    defaultRateMainText: { fontSize: 24, fontWeight: '800' },
    defaultRateAnnualText: { fontSize: 13, marginTop: 4 },

    estimateLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    estimateText: { fontSize: 13 },
    estimateBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1,
    },
    estimateLabel: { fontSize: 13, flex: 1 },
    estimateAmount: { fontSize: 16, fontWeight: '800' },

    // Purpose
    purposeSelect: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
        borderRadius: 12, padding: 14, gap: 10,
    },
    purposeText: { flex: 1, fontSize: 15 },
    customPurposeInput: {
        borderWidth: 1, borderRadius: 10, padding: 12,
        fontSize: 14, marginTop: 10,
    },

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
    // Purpose fixed
    purposeFixed: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 14, borderRadius: 12, borderWidth: 1.5,
    },
    purposeFixedText: { flex: 1, fontSize: 15, fontWeight: '700' },
    purposeFixedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    },
    purposeFixedBadgeText: { fontSize: 11, fontWeight: '700' },
});
