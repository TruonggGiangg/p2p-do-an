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
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import type { BnplLoan } from '../api/bnpl.api';

type RouteParams = { loan: BnplLoan };

/** strip trailing ₫/đ from Intl output */
const fmt = (n: number) => formatCurrency(n).replace(/\s*[₫đ]/g, '').trim();

const THUMB_SIZE = 48;
const TRACK_HEIGHT = 54;

export default function BNPLEarlyRepayScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { loan } = (route.params || {}) as RouteParams;
    const c = theme.colors;

    const [success, setSuccess] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [sliderWidth, setSliderWidth] = useState(0);

    // Slider state
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
            onPanResponderRelease: (_, gesture) => {
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

    const handleConfirmPayment = useCallback(() => {
        setProcessing(true);
        setTimeout(() => {
            setProcessing(false);
            setSuccess(true);
        }, 1500);
    }, []);

    if (!loan) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Trả nợ trước hạn" showBack />
            </View>
        );
    }

    const remaining = loan.outstandingBalance;

    // ── Success ──
    if (success) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Trả nợ trước hạn" showBack />
                <View style={styles.successContainer}>
                    <View style={[styles.successCircle, { backgroundColor: '#0ECB8118' }]}>
                        <MaterialCommunityIcons name="check-circle" size={64} color="#0ECB81" />
                    </View>
                    <Text style={[styles.successTitle, { color: c.textPrimary }]}>Thanh toán thành công!</Text>
                    <Text style={[styles.successSub, { color: c.textSecondary }]}>
                        Bạn đã thanh toán toàn bộ dư nợ {fmt(remaining)} đ cho khoản vay #{loan.fineractLoanId}.
                    </Text>
                    <TouchableOpacity
                        style={[styles.successBtn, { backgroundColor: c.primary }]}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.successBtnText, { color: c.onPrimary }]}>Quay lại</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Slider text opacity
    const estimatedMaxX = Dimensions.get('window').width - 80 - THUMB_SIZE - 6;
    const sliderTextOpacity = pan.interpolate({
        inputRange: [0, estimatedMaxX * 0.4],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Trả nợ trước hạn" showBack />

            <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100 }} showsVerticalScrollIndicator={false}>

                {/* Hero */}
                <View style={[styles.hero, { backgroundColor: c.primaryGlass }]}>
                    <MaterialCommunityIcons name="credit-card-fast-outline" size={36} color={c.primary} />
                    <Text style={[styles.heroLabel, { color: c.textSecondary }]}>Số tiền cần thanh toán</Text>
                    <Text style={[styles.heroAmount, { color: c.textPrimary }]}>{fmt(remaining)} đ</Text>
                </View>

                {/* Info Table */}
                <View style={styles.section}>
                    <CommonCard style={{ padding: 0, overflow: 'hidden' }}>
                        {[
                            { icon: 'file-document-outline' as const, label: 'Mã khoản vay', value: `#${loan.fineractLoanId}` },
                            { icon: 'cash-multiple' as const, label: 'Số tiền gốc', value: `${fmt(loan.principal)} đ` },
                            { icon: 'percent-outline' as const, label: 'Lãi phát sinh', value: `${fmt(loan.totalInterest)} đ` },
                            { icon: 'calendar-clock' as const, label: 'Số kỳ còn lại', value: `${loan.numberOfRepayments - (loan.repaymentSchedule?.filter(s => (s as any).status === 'paid' || (s as any).paid).length || 0)} kỳ` },
                            { icon: 'wallet-outline' as const, label: 'Tổng cần thanh toán', value: `${fmt(remaining)} đ`, bold: true },
                        ].map((row, idx, arr) => (
                            <View key={idx} style={[styles.infoRow, { borderBottomColor: c.border }, idx < arr.length - 1 && { borderBottomWidth: 1 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialCommunityIcons name={row.icon} size={16} color={c.textDim} />
                                    <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                </View>
                                <Text style={[styles.infoValue, { color: c.textPrimary, fontWeight: row.bold ? '800' : '600' }]}>{row.value}</Text>
                            </View>
                        ))}
                    </CommonCard>
                </View>

                {/* Notice */}
                <View style={[styles.notice, { backgroundColor: c.warningGlass, marginHorizontal: 16, marginTop: 12 }]}>
                    <MaterialCommunityIcons name="shield-check-outline" size={16} color={c.warning} />
                    <Text style={[styles.noticeText, { color: c.textDim }]}>
                        Thanh toán trước hạn sẽ đóng toàn bộ khoản vay. Hạn mức sẽ được khôi phục sau khi hoàn tất.
                    </Text>
                </View>
            </ScrollView>

            {/* Swipe to Pay (fixed at bottom) */}
            <View style={[styles.sliderContainer, { paddingBottom: Math.max(insets.bottom, 20) + 8, backgroundColor: c.background }]}>
                <View
                    style={[styles.sliderTrack, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#ECECEC' }]}
                    onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
                >
                    {/* Hint text */}
                    <Animated.View style={[styles.sliderTextWrap, { opacity: sliderTextOpacity }]}>
                        <Text style={[styles.sliderText, { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }]}>Trượt để thanh toán</Text>
                        <MaterialCommunityIcons name="chevron-triple-right" size={14} color={theme.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} />
                    </Animated.View>

                    {/* Thumb */}
                    <Animated.View
                        {...panResponder.panHandlers}
                        style={[
                            styles.sliderThumb,
                            {
                                transform: [{ translateX: pan }],
                                backgroundColor: c.primary,
                            },
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
    hero: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 8 },
    heroLabel: { fontSize: 13 },
    heroAmount: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    section: { paddingHorizontal: 16, paddingTop: 20 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
    infoLabel: { fontSize: 13 },
    infoValue: { fontSize: 13 },
    notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10 },
    noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },

    // Slider
    sliderContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    sliderTrack: {
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        justifyContent: 'center',
    },
    sliderTextWrap: {
        position: 'absolute',
        left: THUMB_SIZE + 12,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    sliderText: {
        fontSize: 13,
        fontWeight: '600',
    },
    sliderThumb: {
        width: THUMB_SIZE,
        height: THUMB_SIZE - 6,
        borderRadius: (THUMB_SIZE - 6) / 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },

    // Success
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, marginTop: -60 },
    successCircle: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    successTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
    successSub: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
    successBtn: { paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14 },
    successBtnText: { fontSize: 15, fontWeight: '700' },
});
