import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard, CommonButton } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import type { BnplLoan } from '../api/bnpl.api';

type RouteParams = { loan: BnplLoan };

const EARLY_PREPAY_FEE_RATE = 0.02; // 2% phí trả trước hạn

export default function BNPLEarlyRepayScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { loan } = (route.params || {}) as RouteParams;
    const c = theme.colors;
    const [isPaying, setIsPaying] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const sliderAnim = useState(new Animated.Value(0))[0];
    const [sliderPressed, setSliderPressed] = useState(false);

    if (!loan) return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Trả nợ trước hạn" showBack />
        </View>
    );

    const principal = loan.outstandingBalance * 0.9; // approx principal remaining
    const currentInterest = loan.outstandingBalance * 0.018; // 1.8% kỳ hiện tại
    const prepayFee = loan.outstandingBalance * EARLY_PREPAY_FEE_RATE;
    const total = loan.outstandingBalance + currentInterest + prepayFee;
    const mockBalance = 1_021_062;
    const today = new Date().toLocaleDateString('vi-VN');

    const handleConfirm = () => {
        if (mockBalance < total) {
            Alert.alert('Không đủ số dư', `Số dư tài khoản không đủ để tất toán.\nCần: ${formatCurrency(total)}\nSố dư: ${formatCurrency(mockBalance)}`);
            return;
        }
        setIsPaying(true);
        setTimeout(() => {
            setIsPaying(false);
            setIsDone(true);
        }, 1500);
    };

    if (isDone) {
        return (
            <View style={[styles.container, { backgroundColor: c.background }]}>
                <BinanceHeader title="Trả nợ trước hạn" showBack />
                <View style={styles.successContainer}>
                    <View style={[styles.successIcon, { backgroundColor: '#0ECB8120' }]}>
                        <MaterialCommunityIcons name="check-circle" size={64} color="#0ECB81" />
                    </View>
                    <Text style={[styles.successTitle, { color: c.textPrimary }]}>Thanh toán thành công!</Text>
                    <Text style={[styles.successSub, { color: c.textSecondary }]}>
                        Khoản vay #{loan.fineractLoanId} đã được tất toán hoàn toàn
                    </Text>
                    <CommonCard style={styles.successCard}>
                        <Text style={[styles.successAmt, { color: '#0ECB81' }]}>
                            -{formatCurrency(total)} đ
                        </Text>
                        <Text style={[styles.successDate, { color: c.textDim }]}>{today}</Text>
                    </CommonCard>
                    <CommonButton
                        title="Quay về ví trả sau"
                        onPress={() => navigation.popToTop()}
                        style={{ marginTop: 24 }}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Trả nợ trước hạn" showBack />
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                    {/* Info table */}
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Thông tin trả nợ</Text>
                    <CommonCard style={{ padding: 0, marginBottom: 20 }}>
                        {[
                            { label: 'Ngày trả nợ trước hạn', value: today },
                            { label: 'Gốc còn lại và lãi các kỳ trước', value: `${formatCurrency(principal)} đ` },
                            { label: 'Lãi kỳ trả nợ trước hạn ℹ️', value: `${formatCurrency(currentInterest)} đ` },
                            { label: 'Phí trả nợ trước hạn ℹ️', value: `${formatCurrency(prepayFee)} đ` },
                        ].map((row, idx, arr) => (
                            <View key={idx} style={[
                                styles.infoRow,
                                { borderBottomColor: c.border },
                                idx < arr.length - 1 && { borderBottomWidth: 1 },
                            ]}>
                                <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{row.label}</Text>
                                <Text style={[styles.infoValue, { color: c.textPrimary }]}>{row.value}</Text>
                            </View>
                        ))}
                        {/* Total */}
                        <View style={[styles.totalRow, { backgroundColor: c.primaryGlass }]}>
                            <Text style={[styles.totalLabel, { color: c.textPrimary }]}>Tổng tiền</Text>
                            <Text style={[styles.totalValue, { color: c.primary }]}>{formatCurrency(total)} đ</Text>
                        </View>
                    </CommonCard>

                    {/* Contact */}
                    <View style={[styles.contactRow, { backgroundColor: c.glassLight, borderRadius: 10 }]}>
                        <MaterialCommunityIcons name="phone-outline" size={18} color={c.primary} />
                        <Text style={[styles.contactText, { color: c.textSecondary }]}>
                            Mọi thắc mắc xin vui lòng liên hệ Hotline: <Text style={{ color: c.primary }}>19006954</Text>
                        </Text>
                    </View>

                    {/* Balance */}
                    <View style={[styles.balanceRow, { borderColor: c.border }]}>
                        <View style={[styles.balanceIcon, { backgroundColor: c.primaryGlass }]}>
                            <MaterialCommunityIcons name="wallet-outline" size={20} color={c.primary} />
                        </View>
                        <Text style={[styles.balanceLabel, { color: c.textSecondary }]}>Số dư tài khoản:</Text>
                        <Text style={[styles.balanceValue, { color: c.textPrimary }]}>
                            {formatCurrency(mockBalance)} đ
                        </Text>
                    </View>

                    {/* Confirm button */}
                    <TouchableOpacity
                        style={[styles.payBtn, {
                            backgroundColor: sliderPressed ? c.primary : c.primaryGlass,
                            borderColor: c.primary,
                        }]}
                        onPressIn={() => setSliderPressed(true)}
                        onPressOut={() => setSliderPressed(false)}
                        onPress={handleConfirm}
                        activeOpacity={0.85}
                        disabled={isPaying}
                    >
                        {isPaying ? (
                            <MaterialCommunityIcons name="loading" size={24} color={sliderPressed ? '#000' : c.primary} />
                        ) : (
                            <>
                                <MaterialCommunityIcons
                                    name={sliderPressed ? 'check-circle' : 'gesture-swipe-right'}
                                    size={24}
                                    color={sliderPressed ? '#000' : c.primary}
                                />
                                <Text style={[styles.payBtnText, { color: sliderPressed ? '#000' : c.primary }]}>
                                    {sliderPressed ? 'Xác nhận thanh toán' : 'Kéo để thanh toán'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 13, paddingHorizontal: 16,
    },
    infoLabel: { fontSize: 13, flex: 1 },
    infoValue: { fontSize: 13, fontWeight: '600', flexShrink: 0, marginLeft: 12, textAlign: 'right' },
    totalRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 16, borderRadius: 0,
    },
    totalLabel: { fontSize: 15, fontWeight: '700' },
    totalValue: { fontSize: 18, fontWeight: '800' },
    contactRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, marginBottom: 20 },
    contactText: { flex: 1, fontSize: 13 },
    balanceRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 24,
    },
    balanceIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    balanceLabel: { fontSize: 13, flex: 1 },
    balanceValue: { fontSize: 16, fontWeight: '700' },
    payBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 12, paddingVertical: 16, borderRadius: 14, borderWidth: 2,
    },
    payBtnText: { fontSize: 16, fontWeight: '700' },
    // Success state
    successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    successIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    successSub: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 21 },
    successCard: { padding: 20, alignItems: 'center', width: '100%' },
    successAmt: { fontSize: 28, fontWeight: '800' },
    successDate: { fontSize: 12, marginTop: 6 },
});
