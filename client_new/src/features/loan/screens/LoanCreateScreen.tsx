/**
 * LoanCreateScreen — Tạo khoản vay
 * Design: Emerald Night / Precision Luminescence
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, KeyboardAvoidingView,
    Platform, Dimensions, StatusBar, Animated
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BinanceHeader } from '../../../components';
import { loanService, LoanProduct, LoanProductConfig } from '../services/loan.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function fmtShort(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + ' tr';
    return n.toLocaleString('vi-VN');
}

type RouteParams = { product: LoanProduct; willing?: string };
type LoanCreateNav = NativeStackNavigationProp<RootStackParamList, 'LoanCreate'>;

export default function LoanCreateScreen() {
    const { theme } = useTheme();
    const route = useRoute();
    const navigation = useNavigation<LoanCreateNav>();
    const insets = useSafeAreaInsets();
    const modal = useConfirmModal();
    const { product, willing: initialWilling } = (route.params || {}) as RouteParams;

    const [step, setStep] = useState(1);
    const [config, setConfig] = useState<LoanProductConfig | null>(null);
    const [amount, setAmount] = useState(5_000_000);
    const [periodMonth, setPeriodMonth] = useState(12);
    const [loading, setLoading] = useState(false);
    const [loadingConfig, setLoadingConfig] = useState(true);

    const minAmount = product?.minPrincipal || 1_000_000;
    const maxAmount = product?.maxPrincipal || 100_000_000;
    const minPeriod = config?.minNumberOfRepayments ?? 1;
    const maxPeriod = config?.maxNumberOfRepayments ?? 36;
    const annualRate = config?.annualRate ?? 0;
    const isAnnual = true;

    const progressAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.spring(progressAnim, { toValue: step, useNativeDriver: false }).start();
    }, [step]);

    const fetchConfig = useCallback(async () => {
        if (!product?.id) return;
        try {
            const cfg = await loanService.getProductConfig(product.id);
            setConfig(cfg);
            setPeriodMonth(cfg?.minNumberOfRepayments ?? 1);
        } catch {
            modal.error('Lỗi', 'Không thể tải cấu hình sản phẩm');
        } finally {
            setLoadingConfig(false);
        }
    }, [product?.id]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const onSubmit = async () => {
        if (amount < minAmount || amount > maxAmount) {
            modal.error('Lỗi', `Số tiền vay phải từ ${fmt(minAmount)} đến ${fmt(maxAmount)}`);
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setLoading(true);
        try {
            const schedule = await loanService.ratePreview({
                capital: amount,
                periodMonth,
                productId: product.id,
            });
            navigation.navigate('LoanConfirm', {
                product, 
                config: config!, 
                capital: amount,
                periodMonth, 
                willing: product.name, 
                schedule,
            });
        } catch (e) {
            modal.error('Lỗi', 'Không thể tính toán lịch trả nợ. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const StepperBar = () => {
        const activeColor = '#1E3A2F';
        const inactiveColor = theme.colors.textMuted + '25';
        return (
            <View style={styles.stepperContainer}>
                {[1, 2].map((s) => (
                    <View key={s} style={styles.stepSegmentWrapper}>
                        <View style={[styles.stepSegment, { backgroundColor: s <= step ? activeColor : inactiveColor, height: 4 }]} />
                    </View>
                ))}
            </View>
        );
    };

    const renderProductCard = () => (
        <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
                <View style={styles.loanBadge}><Text style={styles.loanBadgeText}>SẢN PHẨM VAY</Text></View>
                <View style={styles.verifiedRow}>
                    <Ionicons name="shield-checkmark" size={14} color="#059669" />
                    <Text style={styles.verifiedText}>Secure Lending</Text>
                </View>
            </View>
            <Text style={styles.loanTitle}>{product.name}</Text>
            <View style={styles.metricsList}>
                <View style={styles.metricItem}>
                    <View style={[styles.metricIconBg, { backgroundColor: '#F0FDF4' }]}><MaterialCommunityIcons name="trending-up" size={16} color="#059669" /></View>
                    <View style={styles.metricContent}>
                        <Text style={styles.metricLabel}>LÃI SUẤT</Text>
                        <Text style={[styles.metricValue, { color: '#059669' }]}>{annualRate.toFixed(1)}%/{isAnnual ? 'năm' : 'tháng'}</Text>
                    </View>
                </View>
                <View style={styles.metricItem}>
                    <View style={[styles.metricIconBg, { backgroundColor: '#EFF6FF' }]}><MaterialCommunityIcons name="calendar-clock" size={16} color="#2563EB" /></View>
                    <View style={styles.metricContent}>
                        <Text style={styles.metricLabel}>KỲ HẠN TỐI ĐA</Text>
                        <Text style={styles.metricValue}>{maxPeriod} tháng</Text>
                    </View>
                </View>
                <View style={styles.metricItem}>
                    <View style={[styles.metricIconBg, { backgroundColor: '#FFF7ED' }]}><MaterialCommunityIcons name="bank" size={16} color="#D97706" /></View>
                    <View style={styles.metricContent}>
                        <Text style={styles.metricLabel}>HẠN MỨC TỐI ĐA</Text>
                        <Text style={styles.metricValue}>{fmtShort(maxAmount)}</Text>
                    </View>
                </View>
            </View>
        </View>
    );

    if (!product) return null;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <BinanceHeader
                mode="standard"
                title="Nhập thông tin"
                showBack
                rightComponents={<Text style={[styles.stepIndicatorText, { color: theme.colors.textMuted }]}>{step}/2</Text>}
            />
            <StepperBar />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderProductCard()}
                <View style={styles.amountSelector}>
                    <Text style={styles.inputLabel}>Số tiền muốn vay</Text>
                    <View style={styles.counterContainer}>
                        <TouchableOpacity style={styles.counterBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAmount(a => Math.max(minAmount, a - 500_000)); }}>
                            <Ionicons name="remove" size={24} color="#1E3A2F" />
                        </TouchableOpacity>
                        <View style={styles.counterValueContainer}><Text style={styles.counterValueText}>{fmt(amount)}</Text></View>
                        <TouchableOpacity style={styles.counterBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAmount(a => Math.min(maxAmount, a + 500_000)); }}>
                            <Ionicons name="add" size={24} color="#1E3A2F" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.quickSelectRow}>
                        {[1_000_000, 5_000_000, 10_000_000, maxAmount].filter(v => v >= minAmount && v <= maxAmount).map(v => (
                            <TouchableOpacity key={v} style={[styles.quickSelectChip, amount === v && styles.quickSelectChipActive]} onPress={() => { Haptics.selectionAsync(); setAmount(v); }}>
                                <Text style={[styles.quickSelectText, amount === v && styles.quickSelectTextActive]}>{v === maxAmount ? 'Tối đa' : fmtShort(v)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
                <View style={styles.periodSelector}>
                    <Text style={styles.inputLabel}>Kỳ hạn vay (tháng)</Text>
                    <View style={styles.counterContainer}>
                        <TouchableOpacity style={styles.counterBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPeriodMonth(p => Math.max(minPeriod, p - 1)); }}>
                            <Ionicons name="remove" size={24} color="#1E3A2F" />
                        </TouchableOpacity>
                        <View style={styles.counterValueContainer}>
                            <Text style={styles.counterValueText}>{periodMonth}</Text>
                            <Text style={styles.counterUnitText}>THÁNG</Text>
                        </View>
                        <TouchableOpacity style={styles.counterBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPeriodMonth(p => Math.min(maxPeriod, p + 1)); }}>
                            <Ionicons name="add" size={24} color="#1E3A2F" />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
            <View style={[styles.bottomCta, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={onSubmit} disabled={loading} activeOpacity={0.7}>
                    {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                        <>
                            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>Tiếp tục</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    stepIndicatorText: { fontSize: 13, fontWeight: '700' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 100 },

    stepperContainer: { flexDirection: 'row', height: 4, marginHorizontal: 16, marginVertical: 8, gap: 4 },
    stepSegmentWrapper: { flex: 1 },
    stepSegment: { borderRadius: 2 },

    // Info Card
    infoCard: { backgroundColor: '#F9FAFB', borderRadius: 24, padding: 20, marginBottom: 24 },
    infoCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    loanBadge: { backgroundColor: '#1E3A2F10', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    loanBadgeText: { fontSize: 10, fontWeight: '800', color: '#1E3A2F' },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    verifiedText: { fontSize: 12, fontWeight: '600', color: '#059669' },
    loanTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 24 },
    metricsList: { gap: 16 },
    metricItem: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 16 },
    metricIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    metricContent: { flex: 1 },
    metricLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 2 },
    metricValue: { fontSize: 16, fontWeight: '700', color: '#111827' },

    // Selectors
    amountSelector: { marginBottom: 24 },
    periodSelector: { marginBottom: 24 },
    inputLabel: { fontSize: 14, fontWeight: '700', color: '#6B7280', marginBottom: 12 },
    counterContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', padding: 8, borderRadius: 20 },
    counterBtn: { width: 48, height: 48, backgroundColor: '#FFFFFF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
    counterValueContainer: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    counterValueText: { fontSize: 24, fontWeight: '800', color: '#111827' },
    counterUnitText: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginLeft: 6, marginTop: 4 },

    quickSelectRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    quickSelectChip: { flex: 1, paddingVertical: 10, backgroundColor: '#F9FAFB', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
    quickSelectChipActive: { backgroundColor: '#1E3A2F', borderColor: '#1E3A2F' },
    quickSelectText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
    quickSelectTextActive: { color: '#FFFFFF' },

    // Footer
    bottomCta: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    primaryBtn: { backgroundColor: '#1E3A2F', height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});
