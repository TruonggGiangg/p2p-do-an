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
    PanResponder,
    GestureResponderEvent,
    PanResponderGestureState,
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
    { label: '5 triệu', value: 5000000 },
    { label: '10 triệu', value: 10000000 },
    { label: '20 triệu', value: 20000000 },
    { label: '30 triệu', value: 30000000 },
    { label: '50 triệu', value: 50000000 },
    { label: '70 triệu', value: 70000000 },
    { label: '100 triệu', value: 100000000 },
];
const SLIDER_MIN = 5000000;
const SLIDER_MAX = 100000000;
const SLIDER_STEP = 1000000;

// ── Custom Amount Slider ─────────────────────────────────────────────────────
function AmountSlider({
    value,
    onChange,
    min = SLIDER_MIN,
    max = SLIDER_MAX,
    step = SLIDER_STEP,
    primaryColor,
    trackColor,
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    primaryColor: string;
    trackColor: string;
}) {
    const trackWidth = useRef(0);
    const panX = useRef(new Animated.Value(0)).current;
    const currentVal = useRef(value);

    const clamp = (v: number) => {
        const stepped = Math.round(v / step) * step;
        return Math.max(min, Math.min(max, stepped));
    };

    const valToX = (v: number, w: number) => ((v - min) / (max - min)) * w;
    const xToVal = (x: number, w: number) => min + (x / w) * (max - min);

    useEffect(() => {
        if (trackWidth.current > 0) {
            const x = valToX(value, trackWidth.current);
            panX.setValue(x);
            currentVal.current = value;
        }
    }, [value]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt: GestureResponderEvent) => {
                const x = evt.nativeEvent.locationX;
                const w = trackWidth.current;
                if (w <= 0) return;
                const newVal = clamp(xToVal(x, w));
                panX.setValue(valToX(newVal, w));
                currentVal.current = newVal;
                onChange(newVal);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            },
            onPanResponderMove: (_, gesture: PanResponderGestureState) => {
                const w = trackWidth.current;
                if (w <= 0) return;
                const curX = valToX(currentVal.current, w) + gesture.dx;
                const boundedX = Math.max(0, Math.min(w, curX));
                const newVal = clamp(xToVal(boundedX, w));
                panX.setValue(valToX(newVal, w));
                if (newVal !== currentVal.current) {
                    currentVal.current = newVal;
                    onChange(newVal);
                }
            },
        })
    ).current;

    return (
        <View
            style={sliderStyles.container}
            onLayout={(e) => {
                trackWidth.current = e.nativeEvent.layout.width;
                panX.setValue(valToX(value, e.nativeEvent.layout.width));
            }}
            {...panResponder.panHandlers}
        >
            <View style={[sliderStyles.track, { backgroundColor: trackColor }]}>
                <Animated.View
                    style={[
                        sliderStyles.trackFill,
                        { backgroundColor: primaryColor, width: panX },
                    ]}
                />
            </View>
            <Animated.View
                style={[
                    sliderStyles.thumb,
                    {
                        borderColor: primaryColor,
                        transform: [{ translateX: Animated.subtract(panX, 11) }],
                    },
                ]}
            >
                <View style={[sliderStyles.thumbDot, { backgroundColor: primaryColor }]} />
            </Animated.View>
        </View>
    );
}

const sliderStyles = StyleSheet.create({
    container: { height: 36, justifyContent: 'center', marginTop: 2 },
    track: { height: 4, borderRadius: 2, overflow: 'hidden' },
    trackFill: { height: '100%', borderRadius: 2 },
    thumb: {
        position: 'absolute',
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 3,
        backgroundColor: '#fff',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
        justifyContent: 'center',
        alignItems: 'center',
    },
    thumbDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});

type RouteParams = { product: LoanProduct; willing?: string };
type LoanCreateNav = NativeStackNavigationProp<RootStackParamList, 'LoanCreate'>;

// ── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current, theme }: { current: number; theme: any }) {
    const c = theme.colors;
    return (
        <View style={stepStyles.container}>
            <View style={stepStyles.stepsRow}>
                {[0, 1].map((i) => (
                    <React.Fragment key={i}>
                        <View style={[
                            stepStyles.dot,
                            i <= current
                                ? { backgroundColor: c.primary }
                                : { backgroundColor: c.border + '60' },
                        ]}>
                            {i < current ? (
                                <MaterialCommunityIcons name="check" size={11} color="#fff" />
                            ) : (
                                <Text style={[stepStyles.dotText, i <= current && { color: '#000' }]}>{i + 1}</Text>
                            )}
                        </View>
                        {i < 1 && (
                            <View style={[
                                stepStyles.connector,
                                i < current
                                    ? { backgroundColor: c.primary }
                                    : { backgroundColor: c.border + '40' },
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
    container: { paddingHorizontal: 20, paddingVertical: 14, gap: 6 },
    stepsRow: { flexDirection: 'row', alignItems: 'center' },
    dot: {
        width: 24, height: 24, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
    },
    dotText: { fontSize: 11, fontWeight: '700', color: '#999' },
    connector: { height: 2, flex: 1, marginHorizontal: 8, borderRadius: 1 },
    label: { fontSize: 15, fontWeight: '600', marginTop: 2 },
});

// ── Period Stepper ───────────────────────────────────────────────────────────
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

    const animateBounce = () => {
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.96, duration: 50, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();
    };

    const decrement = () => {
        if (value <= min) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChange(clamp(value - 1));
        animateBounce();
    };
    const increment = () => {
        if (value >= max) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChange(clamp(value + 1));
        animateBounce();
    };

    const handleTextChange = (t: string) => {
        setInputText(t);
        const num = parseInt(t, 10);
        if (!isNaN(num)) onChange(clamp(num));
    };

    const quickChips = PERIOD_QUICK_OPTIONS.filter((p) => p >= min && p <= max);

    return (
        <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
            {quickChips.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={periodStepperStyles.chipRow}
                    style={{ marginBottom: 16 }}
                >
                    {quickChips.map((p) => {
                        const active = value === p;
                        return (
                            <TouchableOpacity
                                key={p}
                                style={[
                                    periodStepperStyles.chip,
                                    { borderColor: active ? primaryColor : borderColor + '50' },
                                    active && { backgroundColor: primaryColor + '10' },
                                ]}
                                onPress={() => { onChange(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    periodStepperStyles.chipText,
                                    { color: active ? primaryColor : dimColor },
                                ]}>
                                    {p} tháng
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            <View style={[periodStepperStyles.row, { borderColor: borderColor + '30' }]}>
                <TouchableOpacity
                    style={[
                        periodStepperStyles.btn,
                        { backgroundColor: value <= min ? dimColor + '08' : primaryColor + '10' },
                    ]}
                    onPress={decrement}
                    disabled={value <= min}
                    activeOpacity={0.6}
                >
                    <MaterialCommunityIcons
                        name="minus"
                        size={22}
                        color={value <= min ? dimColor + '40' : primaryColor}
                    />
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
                </View>

                <TouchableOpacity
                    style={[
                        periodStepperStyles.btn,
                        { backgroundColor: value >= max ? dimColor + '08' : primaryColor + '10' },
                    ]}
                    onPress={increment}
                    disabled={value >= max}
                    activeOpacity={0.6}
                >
                    <MaterialCommunityIcons
                        name="plus"
                        size={22}
                        color={value >= max ? dimColor + '40' : primaryColor}
                    />
                </TouchableOpacity>
            </View>
            <Text style={[periodStepperStyles.rangeHint, { color: dimColor }]}>
                Khoảng: {min} – {max} tháng
            </Text>
        </Animated.View>
    );
}

const periodStepperStyles = StyleSheet.create({
    chipRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 2 },
    chip: {
        paddingHorizontal: 20, paddingVertical: 9,
        borderRadius: 24, borderWidth: 1.2,
    },
    chipText: { fontSize: 13, fontWeight: '600' },
    row: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1.2, borderRadius: 16, overflow: 'hidden',
    },
    btn: {
        width: 54, height: 54,
        justifyContent: 'center', alignItems: 'center',
    },
    center: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    input: { fontSize: 26, fontWeight: '800', textAlign: 'center', minWidth: 50 },
    unit: { fontSize: 12, fontWeight: '500', marginTop: 1 },
    rangeHint: { fontSize: 11, marginTop: 8, textAlign: 'center' },
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
                    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '25' }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primary + '12' }]}>
                                <MaterialCommunityIcons name="cash-fast" size={18} color={theme.colors.primary} />
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

                        <View style={[styles.amountInputWrapper, { borderColor: theme.colors.border + '40' }]}>
                            <TextInput
                                style={[styles.amountInput, { color: theme.colors.textPrimary }]}
                                placeholder="0"
                                placeholderTextColor={theme.colors.textDim + '40'}
                                value={capital ? capital.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                onChangeText={(t) => setCapital(t.replace(/\D/g, ''))}
                                keyboardType="number-pad"
                            />
                            <Text style={[styles.amountCurrency, { color: theme.colors.textDim }]}>VND</Text>
                        </View>

                        <AmountSlider
                            value={capitalNum || SLIDER_MIN}
                            onChange={(v) => setCapital(String(v))}
                            min={SLIDER_MIN}
                            max={SLIDER_MAX}
                            primaryColor={theme.colors.primary}
                            trackColor={theme.colors.border + '40'}
                        />
                        <View style={styles.sliderLabels}>
                            <Text style={[styles.sliderLabelText, { color: theme.colors.textDim }]}>5 triệu</Text>
                            <Text style={[styles.sliderLabelText, { color: theme.colors.textDim }]}>100 triệu</Text>
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.quickAmountScroll}
                            style={{ marginTop: 10 }}
                        >
                            {QUICK_AMOUNTS.map((qa) => {
                                const isSelected = capitalNum === qa.value;
                                return (
                                    <TouchableOpacity
                                        key={qa.value}
                                        style={[
                                            styles.quickChip,
                                            { borderColor: isSelected ? theme.colors.primary : theme.colors.border + '50' },
                                            isSelected && { backgroundColor: theme.colors.primary + '10' },
                                        ]}
                                        onPress={() => { setCapital(String(qa.value)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[
                                            styles.quickChipText,
                                            { color: isSelected ? theme.colors.primary : theme.colors.textSecondary },
                                        ]}>
                                            {qa.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* ── Section 2: Kỳ hạn ── */}
                    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '25' }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: '#6C5CE7' + '12' }]}>
                                <MaterialCommunityIcons name="calendar-clock" size={18} color="#6C5CE7" />
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
                    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '25' }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: '#00B894' + '12' }]}>
                                <MaterialCommunityIcons name="percent-outline" size={18} color="#00B894" />
                            </View>
                            <View style={styles.sectionHeaderText}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Lãi suất</Text>
                            </View>
                        </View>

                        {loadingConfig ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : config && (
                            <View style={[styles.rateCard, { backgroundColor: '#00B894' + '06', borderColor: '#00B894' + '18' }]}>
                                <View style={styles.rateCardTop}>
                                    <View style={{ alignItems: 'center', flex: 1 }}>
                                        <Text style={[styles.rateMainValue, { color: '#00B894' }]}>
                                            {+config.monthlyRate.toFixed(2)}%
                                        </Text>
                                        <Text style={[styles.rateMainLabel, { color: theme.colors.textDim }]}>mỗi tháng</Text>
                                    </View>
                                    <View style={[styles.rateDividerV, { backgroundColor: theme.colors.border + '30' }]} />
                                    <View style={{ alignItems: 'center', flex: 1 }}>
                                        <Text style={[styles.rateSubValue, { color: theme.colors.textSecondary }]}>
                                            ≈ {+config.annualRate.toFixed(2)}%
                                        </Text>
                                        <Text style={[styles.rateMainLabel, { color: theme.colors.textDim }]}>mỗi năm</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* ── Preview kết quả ── */}
                    {loadingPreview ? (
                        <View style={[styles.previewCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '25' }]}>
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                            <Text style={[styles.previewLoading, { color: theme.colors.textDim }]}>Đang tính toán...</Text>
                        </View>
                    ) : schedule && capitalNum >= 100000 ? (
                        <View style={[styles.previewCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '25' }]}>
                            <View style={styles.previewRow}>
                                <View style={styles.previewItem}>
                                    <Text style={[styles.previewItemLabel, { color: theme.colors.textDim }]}>Trả hàng tháng</Text>
                                    <Text style={[styles.previewItemValue, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                                        {formatCurrency(schedule.monthlyPay)} đ
                                    </Text>
                                </View>
                                <View style={[styles.previewDivider, { backgroundColor: theme.colors.border + '30' }]} />
                                <View style={styles.previewItem}>
                                    <Text style={[styles.previewItemLabel, { color: theme.colors.textDim }]}>Tổng phải trả</Text>
                                    <Text style={[styles.previewTotalValue, { color: theme.colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                                        {formatCurrency(schedule.entirelyPay)} đ
                                    </Text>
                                </View>
                            </View>
                            <View style={[styles.previewInterest, { backgroundColor: theme.colors.surfaceLight }]}>
                                <MaterialCommunityIcons name="information-outline" size={13} color={theme.colors.textDim} />
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
                    borderTopColor: theme.colors.border + '20',
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
                        style={[
                            styles.nextBtn,
                            { backgroundColor: canProceed ? theme.colors.primary : theme.colors.border + '40' },
                        ]}
                        onPress={handleNext}
                        disabled={!canProceed}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.nextBtnText, { color: canProceed ? '#000' : theme.colors.textDim }]}>Tiếp tục</Text>
                        <MaterialCommunityIcons name="arrow-right" size={16} color={canProceed ? '#000' : theme.colors.textDim} />
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
    scrollContent: { padding: 16, paddingBottom: 24, gap: 14 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Section cards
    section: {
        padding: 20,
        borderRadius: 22,
        borderWidth: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 18,
    },
    sectionIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionHeaderText: { flex: 1 },
    sectionTitle: { fontSize: 15, fontWeight: '600' },
    sectionHint: { fontSize: 11, marginTop: 2, opacity: 0.7 },

    // Amount
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: 14,
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    amountInput: {
        flex: 1,
        fontSize: 26,
        fontWeight: '700',
        paddingVertical: 12,
        letterSpacing: 0.3,
    },
    amountCurrency: {
        fontSize: 13,
        fontWeight: '600',
        opacity: 0.4,
        marginLeft: 8,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    sliderLabelText: { fontSize: 11, fontWeight: '500' },
    quickAmountScroll: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 2,
    },
    quickChip: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 24,
        borderWidth: 1.2,
    },
    quickChipText: { fontSize: 12, fontWeight: '600' },

    // Rate
    rateCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
    },
    rateCardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        paddingVertical: 2,
    },
    rateMainValue: { fontSize: 26, fontWeight: '800' },
    rateMainLabel: { fontSize: 11, marginTop: 2, opacity: 0.7 },
    rateSubValue: { fontSize: 17, fontWeight: '700' },
    rateDividerV: { width: 1, height: 32 },

    // Preview
    previewCard: {
        borderRadius: 22,
        borderWidth: 1,
        padding: 20,
    },
    previewLoading: { textAlign: 'center', marginTop: 8, fontSize: 13 },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    previewItem: { flex: 1, alignItems: 'center' },
    previewItemLabel: { fontSize: 12, marginBottom: 4 },
    previewItemValue: { fontSize: 18, fontWeight: '800', minWidth: 60 },
    previewTotalValue: { fontSize: 15, fontWeight: '700', minWidth: 60 },
    previewDivider: { width: 1, height: 36, marginHorizontal: 10 },
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
    },
    stickyBarInfo: { flex: 1 },
    stickyLabel: { fontSize: 12, marginBottom: 2 },
    stickyValue: { fontSize: 16, fontWeight: '700' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 13, paddingHorizontal: 26, borderRadius: 14,
    },
    nextBtnText: { fontSize: 14, fontWeight: '700' },
});
