import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { formatCurrency } from '../../../shared/utils';


type SuccessRoute = RouteProp<RootStackParamList, 'LoanApplySuccess'>;
type SuccessNav = NativeStackNavigationProp<RootStackParamList, 'LoanApplySuccess'>;

export default function LoanApplySuccessScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<SuccessNav>();
    const route = useRoute<SuccessRoute>();
    const { entirelyPay, capital, periodMonth } = route.params;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.success + '1A' }]}>
                <Ionicons name="checkmark-circle" size={84} color={theme.colors.success} />
            </View>

            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Đăng ký thành công</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                Đơn vay của bạn đã được gửi và đang chờ xét duyệt.
            </Text>

            <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Số tiền vay</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>{formatCurrency(capital)}</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Kỳ hạn</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>{periodMonth} tháng</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Tổng phải trả</Text>
                    <Text style={[styles.summaryTotal, { color: theme.colors.primary }]}>{formatCurrency(entirelyPay)}</Text>
                </View>
            </View>

            <Text style={[styles.note, { color: theme.colors.textSecondary }]}>Thời gian xét duyệt dự kiến 1-3 ngày làm việc.</Text>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
            >
                <Text style={styles.primaryBtnText}>Về trang chủ</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: theme.colors.border }]}
                onPress={() => navigation.replace('LoanHistory')}
            >
                <Text style={[styles.secondaryBtnText, { color: theme.colors.textSecondary }]}>Xem lịch sử vay</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        justifyContent: 'center',
    },
    iconWrap: {
        width: 132,
        height: 132,
        borderRadius: 66,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 22,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        textAlign: 'center',
    },
    subtitle: {
        marginTop: 8,
        marginBottom: 22,
        textAlign: 'center',
        fontSize: 15,
        lineHeight: 22,
    },
    summaryCard: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 18,
        gap: 10,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    summaryLabel: {
        fontSize: 14,
    },
    summaryValue: {
        fontSize: 15,
        fontWeight: '600',
    },
    summaryTotal: {
        fontSize: 18,
        fontWeight: '800',
    },
    note: {
        textAlign: 'center',
        marginBottom: 24,
        fontSize: 13,
    },
    primaryBtn: {
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        marginBottom: 10,
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryBtn: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    secondaryBtnText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
