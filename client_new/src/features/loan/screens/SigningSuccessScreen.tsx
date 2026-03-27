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
const GOLD = '#CDEA2D';
const GOLD_DARK = '#B88700';
const WHITE = '#FFFFFF';

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
            <View style={[styles.bgOrbTop, { backgroundColor: colors.primary + '18' }]} />
            <View style={[styles.bgOrbBottom, { backgroundColor: colors.primary + '12' }]} />

            {/* Close button */}
            <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]}
                onPress={() => navigation.popToTop()}
            >
                <Ionicons name="close" size={22} color={colors.primary} />
            </TouchableOpacity>

            {/* Success Icon */}
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
                    <View style={[styles.iconCircleInner, { backgroundColor: colors.primary }]}>
                        <MaterialCommunityIcons name="check" size={48} color={colors.onPrimary} />
                    </View>
                </View>
            </Animated.View>

            {/* Title */}
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Ký số thành công!
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                    Hợp đồng {contractId ? <Text style={[styles.contractInline, { color: colors.primary }]}>{contractId}</Text> : ''} đã được ký số hợp lệ.
                </Text>
            </Animated.View>

            {/* Info Card */}
            <Animated.View
                style={[
                    styles.infoCard,
                    {
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                        backgroundColor: colors.surface,
                        borderColor: colors.primary + '30',
                    },
                ]}
            >
                <View style={[styles.infoIconRow, { backgroundColor: colors.primary + '15' }]}>
                    <MaterialCommunityIcons name="shield-check" size={22} color={colors.primary} />
                    <Text style={[styles.infoStatusText, { color: colors.textPrimary }]}>Chứng thư số VNPT SmartCA</Text>
                </View>

                <View style={styles.rowWithIcon}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={colors.primary} />
                    <Text style={[styles.infoMessage, { color: colors.textSecondary }]}>Ký lúc {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày {new Date().toLocaleDateString('vi-VN')}</Text>
                </View>
                <View style={styles.rowWithIcon}>
                    <MaterialCommunityIcons name="bank-transfer" size={16} color={colors.primary} />
                    <Text style={[styles.infoMessage, { color: colors.textSecondary }]}>Khoản vay sẽ được giải ngân sớm</Text>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.primary + '20' }]} />

                {contractId ? (
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Mã hợp đồng</Text>
                        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{contractId}</Text>
                    </View>
                ) : null}

                {principalAmount > 0 && (
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Số tiền vay</Text>
                        <Text style={[styles.infoValue, { color: colors.primary }]}>
                            {formatMoney(principalAmount)} đ
                        </Text>
                    </View>
                )}

                {tenure > 0 && (
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Kỳ hạn</Text>
                        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{tenure} tháng</Text>
                    </View>
                )}
            </Animated.View>

            {/* Bottom buttons */}
            <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                    onPress={() => {
                        navigation.pop();
                    }}
                    activeOpacity={0.85}
                >
                    <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Xem hợp đồng</Text>
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
    bgOrbTop: {
        position: 'absolute',
        top: -120,
        right: -70,
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: '#CDEA2D22',
    },
    bgOrbBottom: {
        position: 'absolute',
        bottom: -140,
        left: -90,
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: '#CDEA2D1A',
    },
    closeBtn: {
        alignSelf: 'flex-end',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#CDEA2D55',
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
        backgroundColor: '#CDEA2D22',
    },
    iconCircleInner: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: GOLD,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 8,
        color: '#1E1E1E',
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 16,
        color: '#555',
    },
    contractInline: {
        color: GOLD_DARK,
        fontWeight: '700',
    },
    infoCard: {
        width: '100%',
        borderRadius: 16,
        padding: 20,
        marginTop: 24,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#CDEA2D44',
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
        backgroundColor: '#CDEA2D1A',
    },
    infoStatusText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E1E1E',
    },
    rowWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    infoMessage: {
        fontSize: 13,
        lineHeight: 20,
        color: '#555',
    },
    divider: {
        height: 1,
        marginVertical: 12,
        backgroundColor: '#CDEA2D44',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    infoLabel: {
        fontSize: 13,
        color: '#777',
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E1E1E',
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
        backgroundColor: GOLD,
    },
    primaryBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#181A20',
    },
});
