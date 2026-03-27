/**
 * PrepaymentSuccessScreen - Trang xác nhận tất toán sớm thành công (giống ngân hàng)
 */
import React from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../contexts/ThemeContext';

interface RouteParams {
    totalAmount: number;
    transactionId?: string | number;
    date: string;
    capitalOriginal?: number;
    breakdown?: {
        principal: number;
        interest: number;
        fees?: number;
        penalty?: number;
    };
    penaltyRate?: number;
    penaltyChargeName?: string;
}

const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const PrepaymentSuccessScreen = ({ route }: { route: { params: RouteParams } }) => {
    const { totalAmount, transactionId, date, capitalOriginal, breakdown, penaltyRate, penaltyChargeName } = route.params;
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const { theme } = useTheme();
    const colors = theme.colors;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Success Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconCircleOuter}>
                        <View style={styles.iconCircleInner}>
                            <Ionicons name="checkmark-done" size={40} color="#FFFFFF" />
                        </View>
                    </View>
                </View>

                <Text style={styles.title}>Tất toán thành công</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{timeStr}</Text>

                {/* Amount */}
                <Text style={styles.amountText}>{formatMoney(totalAmount)} <Text style={styles.amountCurrency}>đ</Text></Text>

                {/* Breakdown Card */}
                {breakdown && (
                    <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.cardHeader}>
                            <Ionicons name="receipt-outline" size={16} color="#14342B" />
                            <Text style={[styles.cardHeaderText, { color: colors.text }]}>Chi tiết tất toán</Text>
                        </View>
                        <DetailRow label="Gốc còn lại" value={`${formatMoney(breakdown.principal)} đ`} colors={colors} />
                        <DetailRow label="Lãi đến ngày tất toán" value={`${formatMoney(breakdown.interest)} đ`} colors={colors} />
                        {(breakdown.fees || 0) > 0 && (
                            <DetailRow label="Phí" value={`${formatMoney(breakdown.fees)} đ`} colors={colors} />
                        )}
                        {(breakdown.penalty || 0) > 0 && (
                            <DetailRow
                                label={`${penaltyChargeName || 'Phí phạt tất toán sớm'}${penaltyRate ? ` (${penaltyRate}%)` : ''}`}
                                value={`${formatMoney(breakdown.penalty)} đ`}
                                colors={colors}
                                valueColor="#F59E0B"
                            />
                        )}
                        <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                            <Text style={[styles.totalLabel, { color: colors.text }]}>Tổng thanh toán</Text>
                            <Text style={styles.totalValue}>{formatMoney(totalAmount)} đ</Text>
                        </View>
                    </View>
                )}

                {/* Transaction Info Card */}
                <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
                    {transactionId && (
                        <DetailRow label="Mã giao dịch" value={`#${transactionId}`} colors={colors} />
                    )}
                    <DetailRow label="Ngày tất toán" value={date} colors={colors} />
                    <DetailRow label="Phương thức" value="Ví điện tử" colors={colors} />
                    {capitalOriginal != null && (
                        <DetailRow label="Gốc vay ban đầu" value={`${formatMoney(capitalOriginal)} đ`} colors={colors} />
                    )}
                    <DetailRow
                        label="Trạng thái khoản vay"
                        value="Đã tất toán"
                        colors={colors}
                        valueColor="#10B981"
                        isLast
                    />
                </View>

                {/* Note */}
                <View style={[styles.noteBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Ionicons name="ribbon-outline" size={16} color="#16A34A" />
                    <Text style={styles.noteText}>Chúc mừng! Bạn đã hoàn thành trả nợ. Điểm tín dụng của bạn sẽ được cộng thêm nhờ tất toán thành công.</Text>
                </View>
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: '#14342B' }]}
                    onPress={() => navigation.navigate('Main')}
                >
                    <Text style={styles.btnPrimaryText}>Về trang chủ</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const DetailRow = ({ label, value, colors, valueColor, isLast }: { label: string; value: string; colors: any; valueColor?: string; isLast?: boolean }) => (
    <View style={[styles.detailRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border + '40' }]}>
        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 80 : 60, paddingBottom: 120 },
    iconContainer: { marginBottom: 20 },
    iconCircleOuter: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#10B98115', justifyContent: 'center', alignItems: 'center' },
    iconCircleInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 22, fontWeight: '700', color: '#10B981', marginBottom: 4 },
    subtitle: { fontSize: 13, marginBottom: 24 },
    amountText: { fontSize: 34, fontWeight: '800', color: '#111827', marginBottom: 28 },
    amountCurrency: { fontSize: 18, fontWeight: '600', color: '#6B7280' },

    detailCard: { width: '100%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    cardHeaderText: { fontSize: 13, fontWeight: '700' },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 },
    detailLabel: { fontSize: 13, flex: 1 },
    detailValue: { fontSize: 13, fontWeight: '600', maxWidth: '50%', textAlign: 'right' },

    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1.5 },
    totalLabel: { fontSize: 14, fontWeight: '700' },
    totalValue: { fontSize: 16, fontWeight: '800', color: '#14342B' },

    noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, width: '100%' },
    noteText: { fontSize: 12, color: '#16A34A', flex: 1, lineHeight: 18 },

    footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 30 : 16 },
    btnPrimary: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

export default PrepaymentSuccessScreen;
