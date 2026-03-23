/**
 * LoanCreateScreen — Tạo khoản vay
 * Design: Finesse Wallet — Deep Teal + Lime Green
 * Đồng bộ với InvestmentFlowScreen pattern
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, KeyboardAvoidingView,
    Platform, Dimensions,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonInput } from '../../../components/common/CommonInput';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard } from '../../../components';
import { loanService, LoanProduct, LoanProductConfig, LoanScheduleResult, DelinquencyPolicyItem } from '../services/loan.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Step indicator: đồng bộ với LoanConfirmScreen ────────────────────────────
function StepIndicator({ current, theme: t }: { current: number; theme: any }) {
    const c = t.colors;
    return (
        <View style={stepS.container}>
            <View style={stepS.stepsRow}>
                {[0, 1].map((i) => (
                    <React.Fragment key={i}>
                        <View style={[
                            stepS.dot,
                            i <= current
                                ? { backgroundColor: c.primary }
                                : { backgroundColor: c.border + '60' },
                        ]}>
                            {i < current ? (
                                <MaterialCommunityIcons name="check" size={11} color="#fff" />
                            ) : (
                                <Text style={[stepS.dotText, i <= current && { color: '#fff' }]}>{i + 1}</Text>
                            )}
                        </View>
                        {i < 1 && (
                            <View style={[
                                stepS.connector,
                                i < current
                                    ? { backgroundColor: c.primary }
                                    : { backgroundColor: c.border + '40' },
                            ]} />
                        )}
                    </React.Fragment>
                ))}
            </View>
            <Text style={[stepS.label, { color: c.textPrimary }]}>
                {current === 0 ? 'Nhập thông tin vay' : 'Xác nhận & gửi đơn'}
            </Text>
        </View>
    );
}

const stepS = StyleSheet.create({
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
    const c = theme.colors;
    const route = useRoute();
    const navigation = useNavigation<LoanCreateNav>();
    const { product, willing: initialWilling } = (route.params || {}) as RouteParams;

    const [config, setConfig] = useState<LoanProductConfig | null>(null);
    const [capital, setCapital] = useState('');
    const [periodMonth, setPeriodMonth] = useState(12);
    const [willing, setWilling] = useState(initialWilling ?? '');
    const [schedule, setSchedule] = useState<LoanScheduleResult | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [delinquencyPolicies, setDelinquencyPolicies] = useState<DelinquencyPolicyItem[]>([]);
    const [acceptedDelinquencyPolicy, setAcceptedDelinquencyPolicy] = useState(false);

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
                setAcceptedDelinquencyPolicy(false);
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

    const mapPolicyActions = (policy: DelinquencyPolicyItem) => {
        const actions: string[] = [];
        if (policy.send_notification) actions.push('Thông báo');
        if (policy.send_email) actions.push('Email');
        if (policy.send_sms) actions.push('SMS');
        if (policy.apply_penalty) actions.push('Lãi phạt');
        if (policy.block_new_loan) actions.push('Chặn vay mới');
        const stageLabel: Record<string, string> = {
            NONE: 'Theo dõi', REMINDER: 'Nhắc nợ', WARNING: 'Cảnh báo',
            COLLECTION: 'Thu hồi', LEGAL: 'Pháp lý', WRITE_OFF: 'Mất vốn',
        };
        actions.push(stageLabel[policy.collection_stage] || policy.collection_stage);
        if (policy.legal_escalation) actions.push('Escalation');
        return actions.join(', ');
    };

    // ── Fallback ──
    if (!product) {
        return (
            <View style={[s.container, { backgroundColor: c.background }]}>
                <BinanceHeader showBack title="Tạo khoản vay" />
                <View style={s.centered}>
                    <Text style={{ color: c.textSecondary }}>Không có thông tin sản phẩm</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[s.container, { backgroundColor: c.background }]}>
            <BinanceHeader showBack title={`Vay ${product.shortName || product.name}`} />
            <StepIndicator current={0} theme={theme} />

            <KeyboardAvoidingView
                style={s.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <ScrollView
                    contentContainerStyle={s.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* ══ Product Info Card ══ */}
                    <CommonCard style={[s.card, { backgroundColor: c.surface }]}>
                        <View style={s.infoHeader}>
                            <LinearGradient
                                colors={[c.primary, c.success]}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={s.infoIcon}
                            >
                                <MaterialCommunityIcons name="file-document-outline" size={18} color={c.onPrimary} />
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                                <Text style={[s.infoTitle, { color: c.text }]} numberOfLines={1}>{product.name}</Text>
                                <Text style={[s.infoSub, { color: c.textMuted }]}>
                                    {product.shortName} • Lãi suất {config ? `${+config.annualRate.toFixed(1)}%/năm` : '...'}
                                </Text>
                            </View>
                            <View style={[s.verifiedBadge, { backgroundColor: c.successGlass }]}>
                                <Ionicons name="shield-checkmark" size={11} color={c.success} />
                                <Text style={[s.verifiedText, { color: c.success }]}>Hoạt động</Text>
                            </View>
                        </View>
                        <View style={[s.metricsGrid, { backgroundColor: c.background }]}>
                            <View style={s.metricItem}>
                                <Text style={[s.metricLabel, { color: c.textMuted }]}>VỐN VAY</Text>
                                <Text style={[s.metricValue, { color: c.primary }]}>
                                    {(product.minPrincipal || 0) >= 1_000_000
                                        ? `${((product.minPrincipal || 0) / 1_000_000).toFixed(0)} – ${((product.maxPrincipal || 0) / 1_000_000).toFixed(0)} triệu`
                                        : `${fmt(product.minPrincipal || 0)} – ${fmt(product.maxPrincipal || 0)} đ`}
                                </Text>
                            </View>
                            <View style={[s.metricDivider, { backgroundColor: c.border }]} />
                            <View style={[s.metricItem, { alignItems: 'flex-end' }]}>
                                <Text style={[s.metricLabel, { color: c.textMuted }]}>KỲ HẠN</Text>
                                <Text style={[s.metricValue, { color: c.textPrimary }]}>
                                    {minRep} – {maxRep} tháng
                                </Text>
                            </View>
                        </View>
                    </CommonCard>

                    {/* ══ Số tiền vay ══ */}
                    <CommonCard style={[s.card, { backgroundColor: c.surface }]}>
                        <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Nhập số tiền vay</Text>
                        {/* Amount input */}
                        <CommonInput
                            variant="standard"
                            value={capital ? capital.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                            onChangeText={t => setCapital(t.replace(/\D/g, ''))}
                            placeholder="Nhập số tiền"
                            suffix="₫"
                            keyboardType="number-pad"
                            icon="cash-fast"
                            selectTextOnFocus
                        />

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
                                            { borderColor: active ? c.primary : c.textMuted + '30' },
                                            active && { backgroundColor: c.primaryGlass },
                                        ]}
                                        onPress={() => { setCapital(String(qa.value)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                    >
                                        <Text style={[s.chipText, { color: active ? c.primary : c.textSecondary }]}>{qa.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </CommonCard>

                    {/* ══ Kỳ hạn vay ══ */}
                    <CommonCard style={[s.card, { backgroundColor: c.surface }]}>
                        <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Kỳ hạn vay</Text>
                        {loadingConfig ? (
                            <ActivityIndicator size="small" color={c.primary} />
                        ) : (
                            <>
                                {/* Counter — compact */}
                                <View style={s.counterRow}>
                                    <TouchableOpacity
                                        style={[s.counterBtn, { backgroundColor: c.surfaceBright }]}
                                        onPress={() => { if (periodMonth > minRep) { setPeriodMonth(periodMonth - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
                                        disabled={periodMonth <= minRep}
                                        activeOpacity={0.6}
                                    >
                                        <Ionicons name="remove" size={20} color={periodMonth <= minRep ? c.textDim : c.text} />
                                    </TouchableOpacity>
                                    <CommonInput
                                        variant="compact"
                                        value={String(periodMonth)}
                                        onChangeText={t => {
                                            const v = parseInt(t.replace(/\D/g, ''), 10);
                                            if (!isNaN(v) && v >= minRep && v <= maxRep) setPeriodMonth(v);
                                            else if (t === '') setPeriodMonth(minRep);
                                        }}
                                        suffix="tháng"
                                        keyboardType="number-pad"
                                        containerStyle={{ flex: 1 }}
                                        selectTextOnFocus
                                    />
                                    <TouchableOpacity
                                        style={[s.counterBtn, { backgroundColor: c.surfaceBright }]}
                                        onPress={() => { if (periodMonth < maxRep) { setPeriodMonth(periodMonth + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
                                        disabled={periodMonth >= maxRep}
                                        activeOpacity={0.6}
                                    >
                                        <Ionicons name="add" size={20} color={periodMonth >= maxRep ? c.textDim : c.text} />
                                    </TouchableOpacity>
                                </View>

                                {/* Quick period chips */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                                    {periodChips.map(p => {
                                        const active = periodMonth === p;
                                        return (
                                            <TouchableOpacity
                                                key={p}
                                                style={[
                                                    s.chip,
                                                    { borderColor: active ? c.primary : c.textMuted + '30' },
                                                    active && { backgroundColor: c.primaryGlass },
                                                ]}
                                                onPress={() => { setPeriodMonth(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                            >
                                                <Text style={[s.chipText, { color: active ? c.primary : c.textSecondary }]}>{p} tháng</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>

                                <Text style={[s.rangeHint, { color: c.textMuted }]}>
                                    Từ {minRep} đến {maxRep} tháng
                                </Text>
                            </>
                        )}
                    </CommonCard>

                    {/* ══ Lãi suất ══ */}
                    {config && (
                        <CommonCard style={[s.card, { backgroundColor: c.surface }]}>
                            <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Lãi suất áp dụng</Text>
                            <View style={[s.rateRow, { backgroundColor: c.background, borderRadius: 14, padding: 16 }]}>
                                <View style={s.rateCol}>
                                    <Text style={[s.rateLabel, { color: c.textMuted }]}>HÀNG THÁNG</Text>
                                    <Text style={[s.rateValue, { color: c.primary }]}>{+config.monthlyRate.toFixed(2)}%</Text>
                                </View>
                                <View style={[s.rateDivider, { backgroundColor: c.border }]} />
                                <View style={[s.rateCol, { alignItems: 'flex-end' }]}>
                                    <Text style={[s.rateLabel, { color: c.textMuted }]}>HÀNG NĂM</Text>
                                    <Text style={[s.rateValue, { color: c.textPrimary }]}>≈ {+config.annualRate.toFixed(2)}%</Text>
                                </View>
                            </View>
                        </CommonCard>
                    )}

                    {/* ══ Dự tính khoản trả ══ */}
                    {(loadingPreview || (schedule && capitalNum >= 100000)) && (
                        <CommonCard style={[s.card, { backgroundColor: c.surface }]}>
                            <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Dự tính khoản trả</Text>
                            {loadingPreview ? (
                                <View style={s.loadingBox}>
                                    <ActivityIndicator size="small" color={c.primary} />
                                    <Text style={[s.loadingText, { color: c.textSecondary }]}>Đang tính toán...</Text>
                                </View>
                            ) : schedule ? (
                                <>
                                    <View style={[s.previewColumns, { backgroundColor: c.background, borderRadius: 14, padding: 16 }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.previewLabel, { color: c.textMuted }]}>TRẢ HÀNG THÁNG</Text>
                                            <Text style={[s.previewBig, { color: c.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                                                {fmt(schedule.monthlyPay)} ₫
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                            <Text style={[s.previewLabel, { color: c.textMuted }]}>TỔNG PHẢI TRẢ</Text>
                                            <Text style={[s.previewMid, { color: c.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                                                {fmt(schedule.entirelyPay)} ₫
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[s.previewInterest, { backgroundColor: c.background }]}>
                                        <MaterialCommunityIcons name="trending-up" size={14} color={c.primary} />
                                        <Text style={[s.previewInterestText, { color: c.textSecondary }]}>
                                            Tổng lãi: <Text style={{ color: c.primary, fontWeight: '700' }}>{fmt(schedule.entirelyPay - capitalNum)} ₫</Text>
                                        </Text>
                                    </View>
                                </>
                            ) : null}
                        </CommonCard>
                    )}

                    {/* ══ Submit Button (full-width, same as LoanConfirm) ══ */}
                    <TouchableOpacity
                        style={[s.submitBtn, { backgroundColor: canProceed ? c.primary : c.border }]}
                        onPress={handleNext}
                        disabled={!canProceed}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="arrow-forward" size={20} color={canProceed ? '#fff' : c.textDim} />
                        <Text style={[s.submitBtnText, { color: canProceed ? '#fff' : c.textDim }]}>Tiếp tục</Text>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════
//  STYLES — follows InvestmentFlowScreen pattern
// ═══════════════════════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 16, paddingBottom: 24 },

    // Step badge (unused)
    stepBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    stepBadgeText: { fontSize: 12, fontWeight: '700' },

    // Card — đồng bộ với LoanConfirmScreen
    card: { padding: 16, marginBottom: 14, borderRadius: 16 },

    // Info header
    infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    infoIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    infoTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    infoSub: { fontSize: 12, marginTop: 3 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    verifiedText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

    // Metrics grid — Stitch: tonal surface, clean 2-col
    metricsGrid: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, overflow: 'hidden' },
    metricItem: { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
    metricRight: {},
    metricDivider: { width: 1, height: 32 },
    metricLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', marginBottom: 6 },
    metricValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

    // Section — Stitch: editorial section headers
    sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, marginBottom: 12, marginTop: 22 },

    // Amount input (unused, CommonInput replaces this)
    amountBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16 },
    amountInput: { flex: 1, fontSize: 28, fontWeight: '800', paddingVertical: 14, letterSpacing: 0.5 },
    currencyLabel: { fontSize: 20, fontWeight: '800', marginLeft: 8 },

    // Chips — horizontal scroll, single row
    chipRow: { flexDirection: 'row', gap: 10, paddingVertical: 4, marginTop: 10 },
    chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1.2 },
    chipText: { fontSize: 13, fontWeight: '600' },

    // Counter — compact row with CommonInput
    counterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    counterBtn: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    rangeHint: { fontSize: 11, textAlign: 'center', marginTop: 6, fontWeight: '500' },

    // Rate card — Stitch: editorial numbers
    rateCard: { borderRadius: 20, padding: 22, marginBottom: 6 },
    rateRow: { flexDirection: 'row', alignItems: 'center' },
    rateCol: { flex: 1 },
    rateLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
    rateValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
    rateDivider: { width: 1, height: 40, marginHorizontal: 16 },

    // Preview — Stitch: gradient card
    previewCard: { borderRadius: 20, padding: 22, marginBottom: 6 },
    previewColumns: { flexDirection: 'row', gap: 16 },
    previewLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
    previewBig: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    previewMid: { fontSize: 17, fontWeight: '700' },
    previewInterest: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, padding: 14, borderRadius: 14 },
    previewInterestText: { fontSize: 13 },

    // Loading
    loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 12 },
    loadingText: { fontSize: 13 },

    // Policy table
    policyHint: { fontSize: 12, marginBottom: 12 },
    policyRow: { flexDirection: 'row', paddingVertical: 10, gap: 6 },
    policyCell: { fontSize: 11, lineHeight: 16 },
    policyCellFlex1: { flex: 1 },
    policyCellFlex2: { flex: 1.8 },

    // Terms
    termsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginTop: 4 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    termsText: { fontSize: 13, flex: 1 },

    // Submit button — đồng bộ với LoanConfirmScreen
    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 4,
    },
    submitBtnText: { fontSize: 16, fontWeight: '700' },
});
