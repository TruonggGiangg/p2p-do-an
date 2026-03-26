/**
 * RepaymentSuccessScreen - Trang xác nhận thanh toán thành công (giống ngân hàng)
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
    amount: number;
    transactionId?: string | number;
    date: string;
    loanId?: string;
    periodNumber?: number;
    loanStatus?: string;
    capitalOriginal?: number;
    remainingBalance?: number;
}

const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const RepaymentSuccessScreen = ({ route }: { route: { params: RouteParams } }) => {
    const { amount, transactionId, date, periodNumber, loanStatus, capitalOriginal, remainingBalance } = route.params;
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
                            <Ionicons name="checkmark" size={40} color="#FFFFFF" />
                        </View>
                    </View>
                </View>

                <Text style={styles.title}>Thanh toán thành công</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{timeStr}</Text>

                {/* Amount */}
                <Text style={styles.amountText}>{formatMoney(amount)} <Text style={styles.amountCurrency}>đ</Text></Text>

                {/* Detail Card */}
                <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {transactionId && (
                        <DetailRow label="Mã giao dịch" value={`#${transactionId}`} colors={colors} />
                    )}
                    {periodNumber && (
                        <DetailRow label="Kỳ thanh toán" value={`Kỳ ${periodNumber}`} colors={colors} />
                    )}
                    <DetailRow label="Ngày thanh toán" value={date} colors={colors} />
                    <DetailRow label="Phương thức" value="Ví điện tử" colors={colors} />
                    {capitalOriginal != null && (
                        <DetailRow label="Gốc vay ban đầu" value={`${formatMoney(capitalOriginal)} đ`} colors={colors} />
                    )}
                    {remainingBalance != null && (
                        <DetailRow
                            label="Dư nợ còn lại"
                            value={remainingBalance <= 0 ? 'Đã tất toán' : `${formatMoney(remainingBalance)} đ`}
                            colors={colors}
                            valueColor={remainingBalance <= 0 ? '#10B981' : undefined}
                        />
                    )}
                    {loanStatus && (
                        <DetailRow
                            label="Trạng thái khoản vay"
                            value={loanStatus === 'closed' ? 'Đã tất toán' : 'Đang vay'}
                            colors={colors}
                            valueColor={loanStatus === 'closed' ? '#10B981' : '#3B82F6'}
                            isLast
                        />
                    )}
                </View>

                {/* Note */}
                <View style={[styles.noteBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Ionicons name="information-circle-outline" size={16} color="#16A34A" />
                    <Text style={styles.noteText}>Khoản thanh toán đã được ghi nhận. Điểm tín dụng của bạn sẽ được cập nhật tự động.</Text>
                </View>
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <TouchableOpacity
                    style={[styles.btnOutline, { borderColor: '#14342B' }]}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={[styles.btnOutlineText, { color: '#14342B' }]}>Quay về khoản vay</Text>
                </TouchableOpacity>
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
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
    detailLabel: { fontSize: 13 },
    detailValue: { fontSize: 13, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },

    noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, width: '100%' },
    noteText: { fontSize: 12, color: '#16A34A', flex: 1, lineHeight: 18 },

    footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 30 : 16 },
    btnOutline: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    btnOutlineText: { fontSize: 14, fontWeight: '700' },
    btnPrimary: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

export default RepaymentSuccessScreen;
