import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { formatCurrency } from '../../../shared/utils';


type SuccessRoute = RouteProp<RootStackParamList, 'LoanApplySuccess'>;
type SuccessNav = NativeStackNavigationProp<RootStackParamList, 'LoanApplySuccess'>;

export default function LoanApplySuccessScreen() {
    const { theme } = useTheme();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';
    const navigation = useNavigation<SuccessNav>();
    const route = useRoute<SuccessRoute>();
    const insets = useSafeAreaInsets();
    const { entirelyPay, capital, periodMonth } = route.params;

    return (
        <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
            {/* Success Icon with glow */}
            <View style={styles.iconSection}>
                <View style={[styles.iconGlow, { backgroundColor: c.success + '12' }]}>
                    <View style={[styles.iconCircle, { backgroundColor: c.success + '20' }]}>
                        <MaterialCommunityIcons name="check-circle" size={64} color={c.success} />
                    </View>
                </View>

                <Text style={[styles.title, { color: c.textPrimary }]}>Đăng ký thành công</Text>
                <Text style={[styles.subtitle, { color: c.textSecondary }]}>
                    Đơn vay của bạn đã được gửi và đang chờ xét duyệt.
                </Text>
            </View>

            {/* Summary Card */}
            <View style={[styles.summaryCard, { backgroundColor: isDark ? c.surface : '#FFFFFF', borderColor: c.border }]}>
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: c.textSecondary }]}>Số tiền vay</Text>
                    <Text style={[styles.summaryValue, { color: c.textPrimary }]}>{formatCurrency(capital)}</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: c.textSecondary }]}>Kỳ hạn</Text>
                    <Text style={[styles.summaryValue, { color: c.textPrimary }]}>{periodMonth} tháng</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: c.textSecondary }]}>Tổng phải trả</Text>
                    <Text style={[styles.summaryTotal, { color: c.primary }]}>{formatCurrency(entirelyPay)}</Text>
                </View>
            </View>

            <Text style={[styles.note, { color: c.textSecondary }]}>
                Thời gian xét duyệt dự kiến 1-3 ngày làm việc.
            </Text>

            {/* Actions */}
            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: c.primary }]}
                    activeOpacity={0.85}
                    onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
                >
                    <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Về trang chủ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.secondaryBtn, { backgroundColor: isDark ? c.surfaceLight : c.background, borderColor: c.border }]}
                    activeOpacity={0.7}
                    onPress={() => navigation.replace('LoanHistory')}
                >
                    <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>Xem lịch sử vay</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    iconSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconGlow: {
        width: 140,
        height: 140,
        borderRadius: 70,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        letterSpacing: -0.3,
    },
    subtitle: {
        marginTop: 8,
        textAlign: 'center',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 21,
        paddingHorizontal: 20,
    },
    summaryCard: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    summaryDivider: {
        height: 1,
    },
    summaryLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    summaryValue: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    summaryTotal: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
    },
    note: {
        textAlign: 'center',
        marginBottom: 32,
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    actions: {
        gap: 12,
    },
    primaryBtn: {
        borderRadius: 100,
        paddingVertical: 16,
        alignItems: 'center',
    },
    primaryBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    secondaryBtn: {
        borderWidth: 1,
        borderRadius: 100,
        paddingVertical: 15,
        alignItems: 'center',
    },
    secondaryBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
});
