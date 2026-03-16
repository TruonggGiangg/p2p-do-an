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
        <View style={[styles.container, { backgroundColor: '#FAFAFA', paddingTop: insets.top }]}>
            <View style={styles.bgOrbTop} />
            <View style={styles.bgOrbBottom} />

            {/* Close button */}
            <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => navigation.popToTop()}
            >
                <Ionicons name="close" size={22} color={GOLD_DARK} />
            </TouchableOpacity>

            {/* Success Icon */}
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
                <View style={styles.iconCircle}>
                    <View style={styles.iconCircleInner}>
                        <MaterialCommunityIcons name="check" size={48} color={WHITE} />
                    </View>
                </View>
            </Animated.View>

            {/* Title */}
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <Text style={styles.title}>
                    Ký số thành công!
                </Text>
                <Text style={styles.subtitle}>
                    Hợp đồng {contractId ? <Text style={styles.contractInline}>{contractId}</Text> : ''} đã được ký số hợp lệ.
                </Text>
            </Animated.View>

            {/* Info Card */}
            <Animated.View
                style={[
                    styles.infoCard,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
            >
                <View style={styles.infoIconRow}>
                    <MaterialCommunityIcons name="shield-check" size={22} color={GOLD_DARK} />
                    <Text style={styles.infoStatusText}>Chứng thư số VNPT SmartCA</Text>
                </View>

                <View style={styles.rowWithIcon}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={GOLD_DARK} />
                    <Text style={styles.infoMessage}>Ký lúc {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày {new Date().toLocaleDateString('vi-VN')}</Text>
                </View>
                <View style={styles.rowWithIcon}>
                    <MaterialCommunityIcons name="bank-transfer" size={16} color={GOLD_DARK} />
                    <Text style={styles.infoMessage}>Khoản vay sẽ được giải ngân sớm</Text>
                </View>

                <View style={styles.divider} />

                {contractId ? (
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Mã hợp đồng</Text>
                        <Text style={styles.infoValue}>{contractId}</Text>
                    </View>
                ) : null}

                {principalAmount > 0 && (
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Số tiền vay</Text>
                        <Text style={[styles.infoValue, { color: GOLD_DARK }]}>
                            {formatMoney(principalAmount)} đ
                        </Text>
                    </View>
                )}

                {tenure > 0 && (
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Kỳ hạn</Text>
                        <Text style={styles.infoValue}>{tenure} tháng</Text>
                    </View>
                )}
            </Animated.View>

            {/* Bottom buttons */}
            <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => {
                        navigation.pop();
                        // Stay on LoanContractDetail
                    }}
                    activeOpacity={0.85}
                >
                    <Text style={styles.primaryBtnText}>Xem hợp đồng</Text>
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
