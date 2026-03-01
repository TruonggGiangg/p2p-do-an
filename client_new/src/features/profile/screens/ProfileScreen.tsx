import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, RefreshControl, Platform, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, RoleBadges, CommonCard, CommonButton, FintechPullToRefresh } from '../../../components';
import { SmartOTPSection, TwoFactorSection } from '../components';
import { getUserDisplayName, getUserInitials, getUserEmail, getUserPhone } from '../../../shared/utils/user.utils';

export default function ProfileScreen() {
    const navigation = useNavigation();
    const { user, logout, refreshUser } = useAuth();
    const { theme, themeMode, toggleTheme, toggleThemeWithTransition, toggleThemeWithOverlay } = useTheme();
    const isDark = themeMode === 'dark';

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const minDelay = new Promise(resolve => setTimeout(resolve, 1700));
        try {
            await Promise.all([
                minDelay,
                (async () => {
                    if (refreshUser) await refreshUser();
                })()
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

    const SettingItem = ({ icon, title, subtitle, onPress, rightElement, color, onPressWithEvent }: any) => (
        <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: theme.colors.border + '40' }]}
            onPress={onPress ?? (onPressWithEvent ? (e: any) => onPressWithEvent(e) : undefined)}
            disabled={!onPress && !onPressWithEvent}
        >
            <View style={[styles.settingIconContainer, { backgroundColor: (color || theme.colors.primary) + '15' }]}>
                <MaterialCommunityIcons
                    name={icon}
                    size={22}
                    color={color || theme.colors.primary}
                />
            </View>
            <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
                {subtitle && <Text style={[styles.settingSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>}
            </View>
            {rightElement || <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textDim} />}
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader
                mode="standard"
                title="Profile"
                showBack={true}
            />

            <FintechPullToRefresh
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* User Info Header Section */}
                <View style={styles.userInfoSection}>
                    <CommonCard style={styles.profileCard}>
                        <View style={styles.profileHeaderContent}>
                            <View style={styles.avatarWrapper}>
                                <View style={[styles.avatar, { backgroundColor: theme.colors.backgroundSecondary || '#2b3139' }]}>
                                    <Text style={[styles.avatarText, { color: theme.colors.primary }]}>{initials}</Text>
                                </View>
                                <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.success }]}>
                                    <MaterialCommunityIcons name="check-decagram" size={14} color="#000" />
                                </View>
                            </View>

                            <View style={styles.userBaseInfo}>
                                <View style={styles.nameRow}>
                                    <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>{displayName}</Text>
                                    <View style={[styles.levelBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                                        <Text style={[styles.levelText, { color: theme.colors.primary }]}>VIP 1</Text>
                                    </View>
                                </View>
                                <Text style={[styles.userUid, { color: theme.colors.textSecondary }]}>UID: {uid}</Text>
                            </View>
                        </View>

                        {/* Role Badges simplified inside card */}
                        <View style={styles.badgesInCard}>
                            <RoleBadges roles={user?.roles || []} />
                        </View>
                    </CommonCard>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.colors.border + '20' }]} />

                {/* Settings Sections */}
                <View style={styles.menuSection}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textDim }]}>LOAN</Text>
                    <SettingItem
                        icon="history"
                        title="Lịch sử khoản vay"
                        subtitle="Xem các khoản vay của bạn"
                        onPress={() => (navigation as any).getParent()?.navigate('LoanHistory')}
                    />
                </View>

                <View style={styles.menuSection}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textDim }]}>PREFERENCES</Text>

                    <SettingItem
                        icon={isDark ? 'weather-night' : 'weather-sunny'}
                        title="Appearance"
                        subtitle={isDark ? 'Dark Mode' : 'Light Mode'}
                        onPressWithEvent={(e: any) => {
                            if (Platform.OS === 'web' && e?.nativeEvent) {
                                const ne = e.nativeEvent as { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
                                toggleThemeWithTransition({
                                    clientX: ne.clientX ?? ne.pageX,
                                    clientY: ne.clientY ?? ne.pageY,
                                    nativeEvent: e.nativeEvent,
                                });
                            } else {
                                const ne = e?.nativeEvent as { pageX?: number; pageY?: number; locationX?: number; locationY?: number };
                                const { width, height } = Dimensions.get('window');
                                const x = ne?.pageX ?? ne?.locationX ?? width / 2;
                                const y = ne?.pageY ?? ne?.locationY ?? height / 2;
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                toggleThemeWithOverlay(x, y);
                            }
                        }}
                        rightElement={
                            <View pointerEvents="none">
                                <Switch
                                    value={isDark}
                                    trackColor={{
                                        false: theme.colors.border,
                                        true: theme.colors.primary + '80',
                                    }}
                                    thumbColor={isDark ? theme.colors.primary : '#fff'}
                                />
                            </View>
                        }
                    />

                    <SettingItem
                        icon="earth"
                        title="Language"
                        subtitle="Tiếng Việt (Vietnam)"
                    />
                </View>

                <View style={styles.menuSection}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textDim }]}>SECURITY</Text>
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
                            console.log('eKYC SettingItem pressed');
                            (navigation as any).getParent()?.navigate('KYCUpdate');
                        }}
                        color={
                            (user as any)?.kycStatus === 'VERIFIED'
                                ? theme.colors.success
                                : (user as any)?.kycStatus === 'PENDING'
                                ? theme.colors.primary
                                : theme.colors.warning
                        }
                    />
                    <View style={{ height: 12 }} />
                    <SmartOTPSection />
                    <View style={{ height: 12 }} />
                    <TwoFactorSection />
                </View>

                <View style={styles.menuSection}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textDim }]}>SUPPORT</Text>
                    <SettingItem
                        icon="help-circle-outline"
                        title="Help Center"
                    />
                    <SettingItem
                        icon="chat-processing-outline"
                        title="Live Chat"
                    />
                </View>

                {/* Logout Button */}
                <View style={styles.logoutWrapper}>
                    <CommonButton
                        title="Log Out"
                        onPress={logout}
                        variant="secondary"
                        style={styles.logoutBtn}
                        textStyle={{ color: theme.colors.error }}
                        icon="logout"
                    />
                </View>

                <Text style={[styles.versionText, { color: theme.colors.textDim }]}>Version 2.85.0</Text>
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 80,
    },
    userInfoSection: {
        paddingHorizontal: 20,
        paddingTop: 10,
        marginBottom: 10,
    },
    profileCard: {
        padding: 16,
    },
    profileHeaderContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    avatarText: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Poppins_700Bold',
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#0b0e11',
    },
    userBaseInfo: {
        marginLeft: 16,
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    userName: {
        fontSize: 20,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginRight: 8,
    },
    levelBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    levelText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    userUid: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    badgesWrapper: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    divider: {
        height: 8,
        width: '100%',
    },
    menuSection: {
        paddingTop: 20,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
        marginBottom: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    settingIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingContent: {
        flex: 1,
    },
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
    logoutWrapper: {
        paddingHorizontal: 20,
        marginTop: 40,
    },
    logoutBtn: {
        height: 52,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    badgesInCard: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    versionText: {
        textAlign: 'center',
        marginTop: 20,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
});
