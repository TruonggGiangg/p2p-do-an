import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { GradientBackground, GlassCard, GlassButton, CustomHeader } from '../../../components';
import { RoleBadges } from '../../../components/RoleBadge';
import { SmartOTPSection, TwoFactorSection } from '../components';
import { getUserDisplayName, getUserInitials, getUserEmail, getUserPhone } from '../../../shared/utils/user.utils';

export default function ProfileScreen() {
    const { user, logout } = useAuth();
    const { theme, themeMode, toggleTheme } = useTheme();
    const isDark = themeMode === 'dark';

    const displayName = getUserDisplayName(user);
    const initials = getUserInitials(user);
    const email = getUserEmail(user);
    const phone = getUserPhone(user);

    return (
        <GradientBackground>
            <CustomHeader title="Hồ sơ" />
            <ScrollView 
                style={styles.container} 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Header Card */}
                <GlassCard style={styles.card}>
                    <View style={styles.header}>
                        {/* Avatar */}
                        <View
                            style={[
                                styles.avatar,
                                {
                                    backgroundColor: theme.colors.primaryGlass,
                                    borderColor: theme.colors.primaryBorder,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.avatarText,
                                    {
                                        color: theme.colors.primary,
                                    },
                                ]}
                            >
                                {initials}
                            </Text>
                        </View>

                        {/* Name */}
                        <View style={styles.nameContainer}>
                            <View style={[styles.nameWrapper, { backgroundColor: theme.colors.primary + '15' }]}>
                                <Text style={[styles.name, { color: theme.colors.primary }]} numberOfLines={2}>
                                    {displayName}
                                </Text>
                            </View>
                        </View>

                        {/* Email with Icon */}
                        {email && (
                            <View style={styles.infoContainer}>
                                <MaterialCommunityIcons
                                    name="email-outline"
                                    size={18}
                                    color={theme.colors.textMuted}
                                    style={styles.infoIcon}
                                />
                                <Text style={[styles.infoText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                    {email}
                                </Text>
                            </View>
                        )}

                        {/* Phone with Icon */}
                        {phone && (
                            <View style={styles.infoContainer}>
                                <MaterialCommunityIcons
                                    name="phone-outline"
                                    size={18}
                                    color={theme.colors.textMuted}
                                    style={styles.infoIcon}
                                />
                                <Text style={[styles.infoText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                    {phone}
                                </Text>
                            </View>
                        )}

                        {/* Role Badges */}
                        <View style={styles.roleBadgesContainer}>
                            <RoleBadges roles={user?.roles || []} />
                        </View>
                    </View>
                </GlassCard>

                {/* Theme Toggle Card */}
                <GlassCard style={styles.card}>
                    <View style={styles.section}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.settingIconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
                                    <MaterialCommunityIcons
                                        name={isDark ? 'weather-night' : 'weather-sunny'}
                                        size={24}
                                        color={theme.colors.primary}
                                    />
                                </View>
                                <View style={styles.settingTextContainer}>
                                    <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>
                                        Giao diện
                                    </Text>
                                    <Text style={[styles.settingSubtitle, { color: theme.colors.textMuted }]}>
                                        {isDark ? 'Chế độ tối' : 'Chế độ sáng'}
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={isDark}
                                onValueChange={toggleTheme}
                                trackColor={{
                                    false: theme.colors.surfaceLight,
                                    true: theme.colors.primaryGlass,
                                }}
                                thumbColor={isDark ? theme.colors.primary : theme.colors.textMuted}
                                ios_backgroundColor={theme.colors.surfaceLight}
                            />
                        </View>
                    </View>
                </GlassCard>

                {/* Smart OTP Section */}
                <View style={styles.sectionSpacing}>
                    <SmartOTPSection />
                </View>

                {/* Two Factor Section */}
                <View style={styles.sectionSpacing}>
                    <TwoFactorSection />
                </View>

                {/* Logout Button */}
                <GlassButton
                    title="ĐĂNG XUẤT"
                    onPress={logout}
                    variant="error"
                    icon="logout"
                    style={styles.logoutButton}
                />
            </ScrollView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24,
    },
    card: {
        marginBottom: 16,
    },
    sectionSpacing: {
        marginBottom: 16,
    },
    header: {
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 8,
    },
    avatar: {
        width: 104,
        height: 104,
        borderRadius: 52,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    avatarText: {
        fontSize: 40,
        fontWeight: 'bold',
        fontFamily: 'Poppins_700Bold',
    },
    nameContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        paddingHorizontal: 16,
        width: '100%',
    },
    nameWrapper: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    infoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        paddingHorizontal: 20,
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingVertical: 10,
        borderRadius: 12,
    },
    infoIcon: {
        marginRight: 10,
    },
    infoText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'left',
        flex: 1,
    },
    roleBadgesContainer: {
        marginTop: 8,
        width: '100%',
        alignItems: 'center',
    },
    section: {
        width: '100%',
        paddingVertical: 4,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    settingIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    settingTextContainer: {
        flex: 1,
    },
    settingTitle: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    settingSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    logoutButton: {
        marginTop: 24,
        marginBottom: 8,
    },
});
