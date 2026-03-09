import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import {
    BinanceHeader,
    RoleBadges,
    CommonCard,
    CommonButton,
    FintechPullToRefresh,
    FintechScreenSkeleton,
} from '../../../components';
import { SmartOTPSection, TwoFactorSection, PinSection } from '../components';
import { getUserDisplayName, getUserInitials, getUserEmail, getUserPhone } from '../../../shared/utils/user.utils';

export default function ProfileScreen() {
    const navigation = useNavigation();
    const { user, logout, refreshUser } = useAuth();
    const { theme } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const init = async () => {
            const minDelay = new Promise((resolve) => setTimeout(resolve, 1700));
            await minDelay;
            setLoading(false);
        };
        init();
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const minDelay = new Promise((resolve) => setTimeout(resolve, 1700));
        try {
            await Promise.all([
                minDelay,
                (async () => {
                    if (refreshUser) await refreshUser();
                })(),
            ]);
        } catch (error) {
            console.error('Failed to refresh profile:', error);
        } finally {
            setRefreshing(false);
        }
    }, [refreshUser]);

    const displayName = getUserDisplayName(user);
    const initials = getUserInitials(user);
    const email = getUserEmail(user);
    const phone = getUserPhone(user);
    const uid = user?._id?.toString().slice(-8).toUpperCase() || 'P2P-8888';
    const c = theme.colors;

    const SettingItem = ({
        icon,
        title,
        subtitle,
        onPress,
        rightElement,
        color,
    }: any) => (
        <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: c.border + '40' }]}
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.settingIconContainer, { backgroundColor: (color || c.primary) + '18' }]}>
                <MaterialCommunityIcons name={icon} size={22} color={color || c.primary} />
            </View>
            <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: c.textPrimary }]}>{title}</Text>
                {subtitle && (
                    <Text style={[styles.settingSubtitle, { color: c.textMuted }]}>{subtitle}</Text>
                )}
            </View>
            {rightElement || (
                <MaterialCommunityIcons name="chevron-right" size={20} color={c.textDim} />
            )}
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader mode="standard" title="Tài khoản" showBack={true} />

            <FintechPullToRefresh
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                primaryColor={c.primary}
                glowColor={c.primaryLight}
                topOffset={Platform.OS === 'ios' ? -15 : 0}
            >
                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <FintechScreenSkeleton variant="profile" />
                    </View>
                ) : (
                    <>
                        {/* Profile Header - Banking style */}
                        <View style={styles.profileHeader}>
                            <CommonCard style={styles.profileCard}>
                                <View style={styles.profileTop}>
                                    <View style={styles.avatarSection}>
                                        <View
                                            style={[
                                                styles.avatar,
                                                {
                                                    backgroundColor:
                                                        theme.mode === 'dark'
                                                            ? c.backgroundTertiary || '#2b3139'
                                                            : '#FFF9E6',
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.avatarText,
                                                    { color: c.primary },
                                                ]}
                                            >
                                                {initials}
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.verifiedBadge,
                                                { backgroundColor: c.success },
                                            ]}
                                        >
                                            <MaterialCommunityIcons
                                                name="check-decagram"
                                                size={14}
                                                color="#fff"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.userInfo}>
                                        <View style={styles.nameRow}>
                                            <Text
                                                style={[styles.userName, { color: c.textPrimary }]}
                                                numberOfLines={1}
                                            >
                                                {displayName}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.levelBadge,
                                                    { backgroundColor: c.primary },
                                                ]}
                                            >
                                                <Text
                                                    style={[styles.levelText, { color: '#000' }]}
                                                >
                                                    VIP 1
                                                </Text>
                                            </View>
                                        </View>
                                        <Text
                                            style={[styles.userUid, { color: c.textSecondary }]}
                                        >
                                            UID: {uid}
                                        </Text>
                                        {(email || phone) && (
                                            <Text
                                                style={[
                                                    styles.userContact,
                                                    { color: c.textMuted },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {email || phone}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                <View style={[styles.badgesRow, { borderTopColor: c.border + '40' }]}>
                                    <RoleBadges roles={user?.roles || []} />
                                </View>
                            </CommonCard>
                        </View>

                        {/* Security - Giao diện, Ngôn ngữ, Hỗ trợ đã chuyển sang Home */}
                        <View style={styles.menuSection}>
                            <Text style={[styles.sectionTitle, { color: c.textDim }]}>
                                BẢO MẬT
                            </Text>
                            <View style={[styles.menuCard, { backgroundColor: c.backgroundSecondary }]}>
                                <SettingItem
                                    icon="shield-check-outline"
                                    title="Xác minh danh tính"
                                    subtitle={
                                        (user as any)?.kycStatus === 'VERIFIED'
                                            ? 'Đã xác minh (eKYC)'
                                            : (user as any)?.kycStatus === 'PENDING'
                                              ? 'Đang chờ phê duyệt'
                                              : 'Chưa xác minh'
                                    }
                                    onPress={() => {
                                        const status = (user as any)?.kycStatus;
                                        if (status === 'PENDING') {
                                            Alert.alert(
                                                'Đang chờ phê duyệt',
                                                'Hồ sơ xác minh danh tính của bạn đang được xử lý.',
                                                [{ text: 'Đã hiểu' }]
                                            );
                                            return;
                                        }
                                        if (status === 'VERIFIED') {
                                            Alert.alert(
                                                'Đã xác minh',
                                                'Tài khoản của bạn đã được xác minh eKYC.'
                                            );
                                            return;
                                        }
                                        (navigation as any).getParent()?.navigate('KYCIntro');
                                    }}
                                    color={
                                        (user as any)?.kycStatus === 'VERIFIED'
                                            ? c.success
                                            : (user as any)?.kycStatus === 'PENDING'
                                              ? c.primary
                                              : c.warning
                                    }
                                />
                                <SmartOTPSection />
                                <TwoFactorSection />
                                <PinSection />
                            </View>
                        </View>

                        {/* Logout - tách biệt, sát bottom nav */}
                        <View style={styles.logoutWrapper}>
                            <CommonButton
                                title="Đăng xuất"
                                onPress={logout}
                                variant="secondary"
                                style={{ ...styles.logoutBtn, borderColor: c.border }}
                                textStyle={{ color: c.error }}
                                icon="logout"
                            />
                        </View>

                        <Text style={[styles.versionText, { color: c.textDim }]}>
                            Phiên bản 2.85.0
                        </Text>
                    </>
                )}
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingBottom: 100, flexGrow: 1 },
    loadingContainer: {
        marginTop: Platform.OS === 'ios' ? 24 : 36,
    },
    profileHeader: { paddingHorizontal: 16, paddingTop: 16, marginBottom: 4 },
    profileCard: { padding: 22, borderRadius: 18, overflow: 'hidden', elevation: 1 },
    profileTop: { flexDirection: 'row', alignItems: 'center' },
    avatarSection: { position: 'relative' },
    avatar: {
        width: 68,
        height: 68,
        borderRadius: 34,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    avatarText: { fontSize: 24, fontWeight: '700', fontFamily: 'Poppins_700Bold' },
    verifiedBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#111318',
    },
    userInfo: { marginLeft: 16, flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' },
    userName: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginRight: 8,
    },
    levelBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    levelText: { fontSize: 10, fontWeight: '700' },
    userUid: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 2 },
    userContact: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    badgesRow: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    menuSection: { paddingHorizontal: 16, paddingTop: 24 },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        marginBottom: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    menuCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    settingIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingContent: { flex: 1, minWidth: 0 },
    settingTitle: {
        fontSize: 15,
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
    settingSubtitle: {
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
    logoutWrapper: { paddingHorizontal: 16, marginTop: 32 },
    logoutBtn: {
        height: 52,
        backgroundColor: 'transparent',
        borderWidth: 1,
    },
    versionText: {
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 24,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        opacity: 0.6,
    },
});
