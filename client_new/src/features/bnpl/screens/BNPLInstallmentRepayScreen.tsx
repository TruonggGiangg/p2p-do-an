import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Animated,
    PanResponder,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import { bnplAPI } from '../api/bnpl.api';
import type { BnplLoan, RepaymentScheduleItem } from '../api/bnpl.api';

type RouteParams = {
    loan: BnplLoan;
    installment: RepaymentScheduleItem;
};

const fmt = (n: number) => {
    if (n == null || isNaN(n)) return '0';
    return formatCurrency(n).replace(/\s*[₫đ]/g, '').trim();
};

const THUMB_SIZE = 48;
const TRACK_HEIGHT = 54;

export default function BNPLInstallmentRepayScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { loan, installment } = (route.params || {}) as RouteParams;
    const c = theme.colors;

    const [success, setSuccess] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [sliderWidth, setSliderWidth] = useState(0);
    const idempotencyKeyRef = useRef(`bnpl-inst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    const pan = useRef(new Animated.Value(0)).current;
    const sliderComplete = useRef(false);

    const getMaxX = useCallback(() => Math.max(sliderWidth - THUMB_SIZE - 6, 1), [sliderWidth]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !sliderComplete.current && !processing,
            onMoveShouldSetPanResponder: (_, g) => !sliderComplete.current && !processing && Math.abs(g.dx) > 5,
            onPanResponderGrant: () => {
                pan.setOffset((pan as any).__getValue?.() || 0);
                pan.setValue(0);
            },
            onPanResponderMove: (_, gesture) => {
                const maxX = Dimensions.get('window').width - 80 - THUMB_SIZE - 6;
                const x = Math.max(0, Math.min(gesture.dx + ((pan as any).__getOffset?.() || 0), maxX));
                pan.setOffset(0);
                pan.setValue(x);
            },
            onPanResponderRelease: () => {
                pan.flattenOffset();
                const maxX = Dimensions.get('window').width - 80 - THUMB_SIZE - 6;
                const currentX = (pan as any).__getValue?.() || 0;
                if (currentX >= maxX * 0.8) {
                    sliderComplete.current = true;
                    Animated.spring(pan, { toValue: maxX, useNativeDriver: false, friction: 8, tension: 40 }).start(() => {
                        handleConfirmPayment();
                    });
                } else {
                    Animated.spring(pan, { toValue: 0, useNativeDriver: false, friction: 7, tension: 50 }).start();
                }
            },
        })
    ).current;

    const handleConfirmPayment = useCallback(async () => {
        if (!loan?.id || !installment) return;
        setProcessing(true);
        try {
            await bnplAPI.repayLoan(
                loan.id,
                installment.total,
                undefined,
                idempotencyKeyRef.current,
            );
            setSuccess(true);
        } catch (error: any) {
            Alert.alert('Lỗi', error?.response?.data?.message || error?.message || 'Không thể thanh toán kỳ này');
            sliderComplete.current = false;
            Animated.spring(pan, { toValue: 0, useNativeDriver: false, friction: 7, tension: 50 }).start();
        } finally {
            setProcessing(false);
        }
    }, [loan?.id, installment, pan]);

    if (!loan || !installment) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Thanh toán kỳ" showBack />
            </View>
        );
    }

    if (success) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Thanh toán kỳ" showBack />
                <View style={styles.successContainer}>
                    <View style={[styles.successCircle, { backgroundColor: '#0ECB8118' }]}>
                        <MaterialCommunityIcons name="check-circle" size={64} color="#0ECB81" />
                    </View>
                    <Text style={[styles.successTitle, { color: c.textPrimary }]}>Thanh toán thành công!</Text>
                    <Text style={[styles.successSub, { color: c.textSecondary }]}>
                        Kỳ {installment.period} của khoản vay #{loan.fineractLoanId} đã được thanh toán{'\n'}
                        {fmt(installment.total)} đ đã được ghi nhận.
                    </Text>
                    <TouchableOpacity
                        style={[styles.successBtn, { backgroundColor: c.primary }]}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.successBtnText, { color: c.onPrimary }]}>Quay lại chi tiết khoản vay</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const estimatedMaxX = Dimensions.get('window').width - 80 - THUMB_SIZE - 6;
    const sliderTextOpacity = pan.interpolate({
        inputRange: [0, estimatedMaxX * 0.4],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const formatDueDate = (raw: string) => {
        try {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        } catch { }
        return raw;
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title={`Thanh toán kỳ ${installment.period}`} showBack />

            <ScrollView
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <View style={[styles.hero, { backgroundColor: c.primaryGlass }]}>
                    <View style={[styles.periodBadge, { backgroundColor: c.primary + '22' }]}>
                        <Text style={[styles.periodBadgeText, { color: c.primary }]}>Kỳ {installment.period}</Text>
                    </View>
                    <Text style={[styles.heroLabel, { color: c.textSecondary }]}>Số tiền thanh toán kỳ này</Text>
                    <Text style={[styles.heroAmount, { color: c.textPrimary }]}>{fmt(installment.total)} đ</Text>
                    <Text style={[styles.heroDue, { color: c.textDim }]}>
                        Hạn: {formatDueDate(installment.dueDate)}
                    </Text>
                </View>

                {/* Breakdown */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Chi tiết thanh toán</Text>
                    <CommonCard style={{ padding: 0, overflow: 'hidden' }}>
                        {[
                            { icon: 'file-document-outline' as const,  label: 'Mã khoản vay',    value: `#${loan.fineractLoanId}` },
                            { icon: 'calendar-outline' as const,        label: 'Kỳ thanh toán',   value: `Kỳ ${installment.period}` },
                            { icon: 'calendar-clock' as const,          label: 'Ngày đến hạn',    value: formatDueDate(installment.dueDate) },
                            { icon: 'cash-multiple' as const,           label: 'Gốc phải trả',    value: `${fmt(installment.principal)} đ` },
                            { icon: 'percent-outline' as const,         label: 'Lãi phải trả',    value: `${fmt(installment.interest)} đ` },
                            { icon: 'wallet-outline' as const,          label: 'Tổng phải trả',   value: `${fmt(installment.total)} đ`, bold: true },
                        ].map((row, idx, arr) => (
                            <View
                                key={idx}
                                style={[
                                    styles.infoRow,
                                    { borderBottomColor: c.border },
                                    idx < arr.length - 1 && { borderBottomWidth: 1 },
                                ]}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialCommunityIcons name={row.icon} size={16} color={c.textDim} />
                                    <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                </View>
                                <Text style={[styles.infoValue, { color: row.bold ? c.textPrimary : c.textPrimary, fontWeight: row.bold ? '800' : '500' }]}>
                                    {row.value}
                                </Text>
                            </View>
                        ))}
                    </CommonCard>
                </View>

                {/* Notice */}
                <View style={[styles.notice, { backgroundColor: c.glassLight, marginHorizontal: 16, marginTop: 12 }]}>
                    <MaterialCommunityIcons name="information-outline" size={16} color={c.primary} />
                    <Text style={[styles.noticeText, { color: c.textDim }]}>
                        Thanh toán đúng hạn giúp cải thiện điểm tín dụng và tăng hạn mức vay của bạn.
                    </Text>
                </View>
            </ScrollView>

            {/* Swipe to pay */}
            <View style={[styles.sliderContainer, { paddingBottom: Math.max(insets.bottom, 20) + 8, backgroundColor: c.background }]}>
                <View
                    style={[styles.sliderTrack, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#ECECEC' }]}
                    onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
                >
                    <Animated.View style={[styles.sliderTextWrap, { opacity: sliderTextOpacity }]}>
                        <Text style={[styles.sliderText, { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }]}>
                            Trượt để thanh toán kỳ {installment.period}
                        </Text>
                        <MaterialCommunityIcons name="chevron-triple-right" size={14} color={theme.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} />
                    </Animated.View>

                    <Animated.View
                        {...panResponder.panHandlers}
                        style={[
                            styles.sliderThumb,
                            { transform: [{ translateX: pan }], backgroundColor: c.primary },
                        ]}
                    >
                        {processing ? (
                            <MaterialCommunityIcons name="loading" size={20} color={c.onPrimary} />
                        ) : (
                            <MaterialCommunityIcons name="arrow-right" size={20} color={c.onPrimary} />
                        )}
                    </Animated.View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 6 },
    periodBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 4 },
    periodBadgeText: { fontSize: 13, fontWeight: '700' },
    heroLabel: { fontSize: 13 },
    heroAmount: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    heroDue: { fontSize: 12, marginTop: 2 },
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 16,
    },
    infoLabel: { fontSize: 13 },
    infoValue: { fontSize: 13 },
    notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10 },
    noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },

    sliderContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 16 },
    sliderTrack: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, justifyContent: 'center' },
    sliderTextWrap: {
        position: 'absolute', left: THUMB_SIZE + 12, right: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    sliderText: { fontSize: 13, fontWeight: '600' },
    sliderThumb: {
        width: THUMB_SIZE, height: THUMB_SIZE - 6,
        borderRadius: (THUMB_SIZE - 6) / 2,
        justifyContent: 'center', alignItems: 'center',
        marginLeft: 3,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, marginTop: -60 },
    successCircle: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    successTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
    successSub: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
    successBtn: { paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14 },
    successBtnText: { fontSize: 15, fontWeight: '700' },
});
