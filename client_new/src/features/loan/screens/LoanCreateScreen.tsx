/**
 * LoanCreateScreen — Tạo khoản vay
 * Design: Emerald Night / Precision Luminescence
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, KeyboardAvoidingView,
    Platform, Dimensions, StatusBar
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonInput } from '../../../components/common/CommonInput';
import { BinanceHeader } from '../../../components';
import { loanService, LoanProduct, LoanProductConfig, LoanScheduleResult, DelinquencyPolicyItem } from '../services/loan.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { useTheme } from '../../../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Step indicator ────────────────────────────
function StepIndicator({ current, theme }: { current: number, theme: any }) {
    const EMERALD_THEME = {
        ...theme.colors,
        surfaceHigh: theme.colors.surfaceBright,
        textDim: theme.mode === 'dark' ? theme.colors.textDim : theme.colors.textSecondary,
    };
    const stepS = StyleSheet.create({
        container: { paddingHorizontal: 20, paddingVertical: 14, gap: 10, marginBottom: 10 },
        label: { fontSize: 13, fontWeight: '600', color: EMERALD_THEME.textDim, textTransform: 'uppercase', letterSpacing: 1 },
        labelHighlight: { color: EMERALD_THEME.textPrimary },
        stepsRow: { flexDirection: 'row', alignItems: 'center' },
        dot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
        dotText: { fontSize: 11, fontWeight: '700', color: EMERALD_THEME.textDim },
        connector: { height: 2, flex: 1, marginHorizontal: 8, borderRadius: 1 },
    });
    return (
        <View style={stepS.container}>
            <Text style={stepS.label}>Bước {current + 1}/2: <Text style={stepS.labelHighlight}>{current === 0 ? 'Nhập thông tin' : 'Xác nhận đơn'}</Text></Text>
            <View style={stepS.stepsRow}>
                {[0, 1].map((i) => (
                    <React.Fragment key={i}>
                        <View style={[
                            stepS.dot,
                            i <= current ? { backgroundColor: EMERALD_THEME.primary } : { backgroundColor: EMERALD_THEME.surfaceHigh },
                        ]}>
                            {i < current ? (
                                <MaterialCommunityIcons name="check" size={12} color={EMERALD_THEME.onPrimary} />
                            ) : (
                                <Text style={[stepS.dotText, i <= current && { color: EMERALD_THEME.onPrimary }]}>{i + 1}</Text>
                            )}
                        </View>
                        {i < 1 && (
                            <View style={[
                                stepS.connector,
                                i < current ? { backgroundColor: EMERALD_THEME.primary } : { backgroundColor: EMERALD_THEME.surfaceHigh },
                            ]} />
                        )}
                    </React.Fragment>
                ))}
            </View>
        </View>
    );
}

const QUICK_AMOUNTS = [
    { label: '5 triệu', value: 5_000_000 },
    { label: '10 triệu', value: 10_000_000 },
    { label: '20 triệu', value: 20_000_000 },
    { label: '30 triệu', value: 30_000_000 },
    { label: '50 triệu', value: 50_000_000 },
    { label: '100 triệu', value: 100_000_000 },
];
const PERIOD_QUICK = [3, 6, 12, 24];

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

type RouteParams = { product: LoanProduct; willing?: string };
type LoanCreateNav = NativeStackNavigationProp<RootStackParamList, 'LoanCreate'>;

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function LoanCreateScreen() {
    const { theme } = useTheme();
    const EMERALD_THEME = {
        ...theme.colors,
        surfaceHigh: theme.colors.surfaceBright,
        textDim: theme.mode === 'dark' ? theme.colors.textDim : theme.colors.textSecondary,
    };
    const s = React.useMemo(() => getStyles(EMERALD_THEME), [EMERALD_THEME]);

    const route = useRoute();
    const navigation = useNavigation<LoanCreateNav>();
    const insets = useSafeAreaInsets();
    const { product, willing: initialWilling } = (route.params || {}) as RouteParams;

    const [config, setConfig] = useState<LoanProductConfig | null>(null);
    const [capital, setCapital] = useState('');
    const [periodMonth, setPeriodMonth] = useState(12);
    const [willing, setWilling] = useState(initialWilling ?? '');
    const [schedule, setSchedule] = useState<LoanScheduleResult | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [delinquencyPolicies, setDelinquencyPolicies] = useState<DelinquencyPolicyItem[]>([]);

    const minRep = config?.minNumberOfRepayments ?? 1;
    const maxRep = config?.maxNumberOfRepayments ?? 360;
    const capitalNum = parseInt(String(capital).replace(/\D/g, ''), 10) || 0;

    const periodChips = PERIOD_QUICK.filter(p => p >= minRep && p <= maxRep);
    if (periodChips.length === 0) periodChips.push(minRep);

    // ── Data fetching ──
    const fetchConfig = useCallback(async () => {
        if (!product?.id) return;
        try {
            const cfg = await loanService.getProductConfig(product.id);
            setConfig(cfg);
            setWilling(initialWilling || product.name || cfg?.name || cfg?.shortName || '');
            const minR = cfg?.minNumberOfRepayments ?? 1;
            const maxR = cfg?.maxNumberOfRepayments ?? 360;
            setPeriodMonth(prev => (prev >= minR && prev <= maxR ? prev : Math.max(minR, Math.min(maxR, 12))));
        } catch {
            Alert.alert('Lỗi', 'Không thể tải cấu hình sản phẩm');
        } finally {
            setLoadingConfig(false);
        }
    }, [product?.id, product?.name, initialWilling]);

    const fetchPreview = useCallback(async () => {
        if (!product?.id || capitalNum < 100000 || periodMonth < 1) return;
        setLoadingPreview(true);
        try {
            const result = await loanService.ratePreview({ capital: capitalNum, periodMonth, productId: product.id });
            setSchedule(result);
        } catch { setSchedule(null); }
        finally { setLoadingPreview(false); }
    }, [product?.id, capitalNum, periodMonth]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);
    useEffect(() => { const t = setTimeout(fetchPreview, 400); return () => clearTimeout(t); }, [fetchPreview]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            if (!product?.id) { setDelinquencyPolicies([]); return; }
            const policies = await loanService.getDelinquencyPolicies(product.id);
            if (mounted) {
                setDelinquencyPolicies((policies || []).sort((a, b) => a.debt_group - b.debt_group));
            }
        })();
        return () => { mounted = false; };
    }, [product?.id]);

    // ── Handlers ──
    const canProceed = !!schedule && capitalNum >= 100000 && periodMonth >= 1;

    const handleNext = () => {
        if (!product || capitalNum < 100000 || periodMonth < 1) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền và kỳ hạn hợp lệ');
            return;
        }
        if (!schedule) {
            Alert.alert('Lỗi', 'Đang tính toán lịch trả nợ, vui lòng đợi');
            return;
        }
        navigation.navigate('LoanConfirm', {
            product, config: config!, capital: capitalNum,
            periodMonth, willing: willing.trim(), schedule,
        });
    };

    // ── Fallback ──
    if (!product) {
        return (
            <View style={[s.container, { backgroundColor: EMERALD_THEME.background }]}>
                <BinanceHeader title="Tạo khoản vay" mode="standard" />
                <View style={s.centered}>
                    <Text style={{ color: EMERALD_THEME.textSecondary }}>Không có thông tin sản phẩm</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[s.container, { backgroundColor: EMERALD_THEME.background }]}>
            <StatusBar barStyle={theme.mode === 'dark' ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
            
            <BinanceHeader title={`Vay ${product.shortName || product.name}`} mode="standard" />

            <StepIndicator current={0} theme={theme} />

            <KeyboardAvoidingView
                style={s.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            >
                <ScrollView
                    contentContainerStyle={s.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* ══ Product Info Card ══ */}
                    <View style={s.card}>
                        <View style={s.infoHeader}>
                            <View style={s.infoIconWrap}>
                                <MaterialCommunityIcons name="file-document-outline" size={20} color={EMERALD_THEME.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.infoTitle} numberOfLines={1}>{product.name}</Text>
                                <Text style={s.infoSub}>
                                    {product.shortName} • Lãi suất {config ? `${+config.annualRate.toFixed(1)}%/năm` : '...'}
                                </Text>
                            </View>
                            <View style={s.verifiedBadge}>
                                <Text style={s.verifiedText}>HOẠT ĐỘNG</Text>
                            </View>
                        </View>
                    </View>

                    {/* ══ Số tiền vay ══ */}
                    <View style={s.card}>
                        <Text style={s.sectionTitle}>NHẬP SỐ TIỀN VAY</Text>
                        
                        {/* Amount input: Luminous styling */}
                        <View style={s.amountInputContainer}>
                            <TextInput
                                style={s.amountInput}
                                value={capital ? capital.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                                onChangeText={t => setCapital(t.replace(/\D/g, ''))}
                                placeholder="0"
                                placeholderTextColor={EMERALD_THEME.textDim}
                                keyboardType="number-pad"
                                selectTextOnFocus
                            />
                            <Text style={s.amountCurrency}>đ</Text>
                        </View>

                        {/* Quick amount chips */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                            {QUICK_AMOUNTS.filter(qa => {
                                const minP = product.minPrincipal || 0;
                                const maxP = product.maxPrincipal || 1_000_000_000;
                                return qa.value >= minP && qa.value <= maxP;
                            }).map(qa => {
                                const active = capitalNum === qa.value;
                                return (
                                    <TouchableOpacity
                                        key={qa.value}
                                        style={[
                                            s.chip,
                                            active && s.chipActive,
                                        ]}
                                        onPress={() => { setCapital(String(qa.value)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                    >
                                        <Text style={[s.chipText, active && s.chipTextActive]}>{qa.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* ══ Kỳ hạn vay ══ */}
                    <View style={s.card}>
                        <Text style={s.sectionTitle}>KỲ HẠN VAY</Text>
                        {loadingConfig ? (
                            <ActivityIndicator size="small" color={EMERALD_THEME.primary} />
                        ) : (
                            <>
                                {/* Counter */}
                                <View style={s.counterRow}>
                                    <TouchableOpacity
                                        style={s.counterBtn}
                                        onPress={() => { if (periodMonth > minRep) { setPeriodMonth(periodMonth - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
                                        disabled={periodMonth <= minRep}
                                        activeOpacity={0.6}
                                    >
                                        <Ionicons name="remove" size={24} color={periodMonth <= minRep ? EMERALD_THEME.textDim : EMERALD_THEME.primary} />
                                    </TouchableOpacity>
                                    
                                    <View style={s.counterInputContainer}>
                                        <TextInput
                                            style={s.counterInput}
                                            value={String(periodMonth)}
                                            onChangeText={t => {
                                                const v = parseInt(t.replace(/\D/g, ''), 10);
                                                if (!isNaN(v) && v >= minRep && v <= maxRep) setPeriodMonth(v);
                                                else if (t === '') setPeriodMonth(minRep);
                                            }}
                                            keyboardType="number-pad"
                                            selectTextOnFocus
                                        />
                                        <Text style={s.counterUnit}>tháng</Text>
                                    </View>

                                    <TouchableOpacity
                                        style={s.counterBtn}
                                        onPress={() => { if (periodMonth < maxRep) { setPeriodMonth(periodMonth + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
                                        disabled={periodMonth >= maxRep}
                                        activeOpacity={0.6}
                                    >
                                        <Ionicons name="add" size={24} color={periodMonth >= maxRep ? EMERALD_THEME.textDim : EMERALD_THEME.primary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Quick period chips */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                                    {periodChips.map(p => {
                                        const active = periodMonth === p;
                                        return (
                                            <TouchableOpacity
                                                key={p}
                                                style={[s.chip, active && s.chipActive]}
                                                onPress={() => { setPeriodMonth(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                            >
                                                <Text style={[s.chipText, active && s.chipTextActive]}>{p} tháng</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                                <Text style={s.rangeHint}>Từ {minRep} đến {maxRep} tháng</Text>
                            </>
                        )}
                    </View>

                    {/* ══ Lãi suất ══ */}
                    {config && (
                        <View style={s.card}>
                            <Text style={s.sectionTitle}>LÃI SUẤT ÁP DỤNG</Text>
                            <View style={s.rateRow}>
                                <View style={s.rateCol}>
                                    <Text style={s.rateLabel}>HÀNG THÁNG</Text>
                                    <Text style={s.rateValue}>{+config.monthlyRate.toFixed(2)}%</Text>
                                </View>
                                <View style={s.rateDivider} />
                                <View style={[s.rateCol, { alignItems: 'flex-end' }]}>
                                    <Text style={s.rateLabel}>HÀNG NĂM</Text>
                                    <Text style={[s.rateValue, { color: EMERALD_THEME.textPrimary }]}>≈ {+config.annualRate.toFixed(2)}%</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Footer Area inside scroll */}
                    <View style={s.footer}>
                        {schedule && capitalNum >= 100_000 && !loadingPreview && (
                            <View style={s.previewFooter}>
                                <View>
                                    <Text style={s.previewLabel}>TRẢ HÀNG THÁNG</Text>
                                    <Text style={s.previewValue}>{fmt(schedule.monthlyPay)} ₫</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={s.previewLabel}>TỔNG PHẢI TRẢ</Text>
                                    <Text style={s.previewSub}>{fmt(schedule.entirelyPay)} ₫</Text>
                                </View>
                            </View>
                        )}
                        <TouchableOpacity
                            style={[s.submitBtn, { backgroundColor: canProceed ? EMERALD_THEME.primary : theme.mode === 'dark' ? EMERALD_THEME.surfaceHigh : 'rgba(0,0,0,0.06)' }]}
                            onPress={handleNext}
                            disabled={!canProceed}
                            activeOpacity={0.85}
                        >
                            <Text style={[s.submitBtnText, { color: canProceed ? EMERALD_THEME.onPrimary : theme.mode === 'dark' ? EMERALD_THEME.textDim : 'rgba(0,0,0,0.3)' }]}>Tiếp tục</Text>
                            <MaterialCommunityIcons name="arrow-right" size={20} color={canProceed ? EMERALD_THEME.onPrimary : theme.mode === 'dark' ? EMERALD_THEME.textDim : 'rgba(0,0,0,0.3)'} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════
//  STYLES — Emerald Night
// ═══════════════════════════════════════════════════════════
const getStyles = (EMERALD_THEME: any) => StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    scroll: { padding: 20, paddingBottom: 24, gap: 16 },

    card: {
        backgroundColor: EMERALD_THEME.surface,
        borderRadius: 20,
        padding: 20,
    },

    // Info header
    infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    infoIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: EMERALD_THEME.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
    infoTitle: { fontSize: 16, fontWeight: '700', color: EMERALD_THEME.textPrimary, marginBottom: 4 },
    infoSub: { fontSize: 13, color: EMERALD_THEME.textSecondary },
    verifiedBadge: { backgroundColor: EMERALD_THEME.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    verifiedText: { fontSize: 10, fontWeight: '800', color: EMERALD_THEME.primary, letterSpacing: 0.5 },

    // Section 
    sectionTitle: { fontSize: 12, fontWeight: '700', color: EMERALD_THEME.textDim, letterSpacing: 1, marginBottom: 16 },

    // Amount input
    amountInputContainer: { 
        flexDirection: 'row', alignItems: 'baseline', 
        borderBottomWidth: 2, borderBottomColor: EMERALD_THEME.border, 
        paddingBottom: 8, marginBottom: 16
    },
    amountInput: { flex: 1, fontSize: 36, fontWeight: '800', color: EMERALD_THEME.primary, letterSpacing: 0.5 },
    amountCurrency: { fontSize: 24, fontWeight: '700', color: EMERALD_THEME.textSecondary, marginLeft: 8 },

    // Chips
    chipRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: EMERALD_THEME.surfaceHigh },
    chipActive: { backgroundColor: EMERALD_THEME.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: EMERALD_THEME.textSecondary },
    chipTextActive: { color: EMERALD_THEME.onPrimary },

    // Counter
    counterRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    counterBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: EMERALD_THEME.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
    counterInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: EMERALD_THEME.border, paddingBottom: 8 },
    counterInput: { fontSize: 32, fontWeight: '800', color: EMERALD_THEME.textPrimary, textAlign: 'center' },
    counterUnit: { fontSize: 16, fontWeight: '600', color: EMERALD_THEME.textSecondary, marginLeft: 6 },
    rangeHint: { fontSize: 12, textAlign: 'center', marginTop: 12, color: EMERALD_THEME.textDim },

    // Rate card
    rateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: EMERALD_THEME.surfaceHigh, borderRadius: 16, padding: 16 },
    rateCol: { flex: 1 },
    rateLabel: { fontSize: 10, fontWeight: '700', color: EMERALD_THEME.textDim, letterSpacing: 1, marginBottom: 4 },
    rateValue: { fontSize: 24, fontWeight: '800', color: EMERALD_THEME.primary, letterSpacing: -0.5 },
    rateDivider: { width: 1, height: 40, backgroundColor: EMERALD_THEME.border, marginHorizontal: 16 },

    // Footer
    footer: {
        width: '100%',
        paddingVertical: 16,
    },
    previewFooter: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    previewLabel: { fontSize: 10, fontWeight: '700', color: EMERALD_THEME.textDim, letterSpacing: 1, marginBottom: 4 },
    previewValue: { fontSize: 22, fontWeight: '800', color: EMERALD_THEME.primary },
    previewSub: { fontSize: 18, fontWeight: '700', color: EMERALD_THEME.textPrimary },

    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 18, borderRadius: 100, gap: 8,
    },
    submitBtnText: { fontSize: 16, fontWeight: '700' },
});
