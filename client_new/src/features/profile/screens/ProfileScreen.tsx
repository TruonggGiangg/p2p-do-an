import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { GradientBackground, GlassCard, GlassButton } from '../../../components';
import { RoleBadges } from '../../../components/RoleBadge';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';

export default function ProfileScreen() {
    const { user, logout } = useAuth();
    const { theme, themeMode, toggleTheme } = useTheme();
    const isDark = themeMode === 'dark';

    return (
        <GradientBackground>
            <View style={styles.container}>
                {/* Header Card */}
                <GlassCard>
                    <View style={styles.header}>
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
                                {user?.profile?.firstName?.[0] || user?.username?.[0] || '?'}
                            </Text>
                        </View>
                        <Text style={[styles.name, { color: theme.colors.textPrimary }]}>
                            {user?.name ||
                                `${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim() ||
                                user?.username}
                        </Text>
                        {user?.email && (
                            <Text style={[styles.email, { color: theme.colors.textSecondary }]}>
                                {user.email}
                            </Text>
                        )}
                        <RoleBadges roles={user?.roles || []} />
                    </View>
                </GlassCard>

                {/* Sync Status Card */}
                <GlassCard>
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
                            Trạng thái đồng bộ
                        </Text>
                        <SyncStatusBadge
                            status={user?.metadata?.syncStatus}
                            lastSyncAt={user?.metadata?.lastSyncAt}
                            error={user?.metadata?.syncError}
                        />
                    </View>
                </GlassCard>

                {/* Theme Toggle Card */}
                <GlassCard>
                    <View style={styles.section}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingLeft}>
                                <MaterialCommunityIcons
                                    name={isDark ? 'weather-night' : 'weather-sunny'}
                                    size={24}
                                    color={theme.colors.primary}
                                    style={styles.settingIcon}
                                />
                                <View>
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

                {/* Logout Button */}
                <GlassButton
                    title="ĐĂNG XUẤT"
                    onPress={logout}
                    variant="error"
                    icon="logout"
                    style={styles.logoutButton}
                />
            </View>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    header: {
        alignItems: 'center',
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 2,
    },
    avatarText: {
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'Poppins_700Bold',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
        fontFamily: 'Poppins_700Bold',
    },
    email: {
        fontSize: 16,
        marginBottom: 12,
        fontFamily: 'Poppins_400Regular',
    },
    section: {
        width: '100%',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    settingIcon: {
        marginRight: 12,
    },
    settingTitle: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    settingSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    logoutButton: {
        marginTop: 16,
    },
});
