/**
 * SigningSuccessScreen.tsx - Màn hình ký hợp đồng thành công
 * Hiển thị thông báo ký thành công + chờ giải ngân 2-3 ngày
 */
import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

const { width } = Dimensions.get('window');

const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

export default function SigningSuccessScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const colors = theme.colors;

    const contractId = route.params?.contractId || '';
    const principalAmount = route.params?.principalAmount || 0;
    const tenure = route.params?.tenure || 0;

    // Animations
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        // Staggered animation
        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 5,
                tension: 80,
                useNativeDriver: true,
            }),
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            {/* Close button */}
            <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.surfaceLight }]}
                onPress={() => navigation.popToTop()}
            >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            {/* Success Icon */}
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
                <View style={[styles.iconCircle, { backgroundColor: '#10B981' + '20' }]}>
                    <View style={[styles.iconCircleInner, { backgroundColor: '#10B981' }]}>
                        <MaterialCommunityIcons name="check" size={48} color="#fff" />
                    </View>
                </View>
            </Animated.View>

            {/* Title */}
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Ký hợp đồng thành công!
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                    Hợp đồng đã được ký xác nhận. Khoản vay của bạn đang được xử lý.
                </Text>
            </Animated.View>

            {/* Info Card */}
            <Animated.View
                style={[
                    styles.infoCard,
                    {
                        backgroundColor: colors.surface,
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                    },
                ]}
            >
                <View style={[styles.infoIconRow, { backgroundColor: '#F59E0B' + '15' }]}>
                    <MaterialCommunityIcons name="clock-outline" size={24} color="#F59E0B" />
                    <Text style={[styles.infoStatusText, { color: '#F59E0B' }]}>Chờ giải ngân</Text>
                </View>

                <Text style={[styles.infoMessage, { color: colors.textSecondary }]}>
                    Vui lòng chờ{' '}
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>2-3 ngày làm việc</Text>
                    , số tiền sẽ được chuyển vào tài khoản của bạn.
                </Text>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {contractId ? (
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textDim }]}>Mã hợp đồng</Text>
                        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{contractId}</Text>
                    </View>
                ) : null}

                {principalAmount > 0 && (
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textDim }]}>Số tiền vay</Text>
                        <Text style={[styles.infoValue, { color: colors.primary }]}>
                            {formatMoney(principalAmount)} đ
                        </Text>
                    </View>
                )}

                {tenure > 0 && (
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textDim }]}>Kỳ hạn</Text>
                        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{tenure} tháng</Text>
                    </View>
                )}
            </Animated.View>

            {/* Timeline hint */}
            <Animated.View
                style={[
                    styles.timelineCard,
                    {
                        backgroundColor: colors.surface,
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                    },
                ]}
            >
                <Text style={[styles.timelineTitle, { color: colors.textPrimary }]}>Các bước tiếp theo</Text>
                <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: '#10B981' }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                    <View style={[styles.timelineLine, { backgroundColor: '#10B981' }]} />
                    <Text style={[styles.timelineText, { color: colors.textSecondary }]}>Ký hợp đồng thành công</Text>
                </View>
                <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: '#F59E0B' }]}>
                        <MaterialCommunityIcons name="clock-outline" size={10} color="#fff" />
                    </View>
                    <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.timelineText, { color: '#F59E0B', fontWeight: '600' }]}>
                        Chờ admin xét duyệt giải ngân (2-3 ngày)
                    </Text>
                </View>
                <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: colors.border }]}>
                        <MaterialCommunityIcons name="cash" size={10} color={colors.textDim} />
                    </View>
                    <View style={{ width: 0 }} />
                    <Text style={[styles.timelineText, { color: colors.textDim }]}>
                        Giải ngân vào tài khoản
                    </Text>
                </View>
            </Animated.View>

            {/* Bottom buttons */}
            <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                    onPress={() => navigation.popToTop()}
                    activeOpacity={0.85}
                >
                    <Text style={styles.primaryBtnText}>Về trang chủ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={() => {
                        navigation.pop();
                        // Stay on LoanContractDetail
                    }}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Xem hợp đồng</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    closeBtn: {
        alignSelf: 'flex-end',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    iconContainer: {
        marginTop: 20,
        marginBottom: 24,
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconCircleInner: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 16,
    },
    infoCard: {
        width: '100%',
        borderRadius: 16,
        padding: 20,
        marginTop: 24,
    },
    infoIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignSelf: 'center',
        marginBottom: 16,
    },
    infoStatusText: {
        fontSize: 15,
        fontWeight: '700',
    },
    infoMessage: {
        fontSize: 14,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 16,
    },
    divider: {
        height: 1,
        marginVertical: 12,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    infoLabel: {
        fontSize: 13,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '700',
    },
    timelineCard: {
        width: '100%',
        borderRadius: 16,
        padding: 20,
        marginTop: 12,
    },
    timelineTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 16,
    },
    timelineItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
        position: 'relative',
    },
    timelineDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    timelineLine: {
        position: 'absolute',
        left: 9,
        top: 20,
        width: 2,
        height: 24,
    },
    timelineText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 20,
        paddingTop: 1,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 24,
        right: 24,
        gap: 10,
    },
    primaryBtn: {
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#181A20',
    },
    secondaryBtn: {
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
