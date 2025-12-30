import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services';
import type { KeycloakUserDetails } from '../types';
import { GradientBackground, GlassCard, GlassButton, GlassTokens, InfoRow, SectionTitle } from '../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../theme';

export default function ProfileScreen() {
    const { user, logout, isLoading } = useAuth();
    const [keycloakDetails, setKeycloakDetails] = useState<KeycloakUserDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        loadUserDetails();
    }, []);

    const loadUserDetails = async () => {
        setLoadingDetails(true);
        try {
            const response = await authApi.getUserInfo();
            setKeycloakDetails(response.data?.keycloakDetails || null);
        } catch (error) {
            console.error('[ProfileScreen] Load user details error:', error);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('[ProfileScreen] Logout error:', error);
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role.toLowerCase()) {
            case 'lender': return GlassTokens.colors.success;
            case 'borrower': return GlassTokens.colors.warning;
            case 'admin': return GlassTokens.colors.error;
            default: return GlassTokens.colors.primary;
        }
    };

    return (
        <GradientBackground>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Profile Header Card */}
                <GlassCard variant="primary" blur={GlassTokens.blur.medium}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>
                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </Text>
                    </View>
                    <Text style={styles.userName}>{user?.name || 'Unknown User'}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>

                    {/* Role Badges */}
                    <View style={styles.rolesContainer}>
                        {user?.roles?.map((role, index) => (
                            <View
                                key={index}
                                style={[
                                    styles.roleBadge,
                                    {
                                        backgroundColor: `${getRoleBadgeColor(role)}20`,
                                        borderColor: `${getRoleBadgeColor(role)}40`
                                    }
                                ]}
                            >
                                <Text style={[styles.roleText, { color: getRoleBadgeColor(role) }]}>
                                    {role.charAt(0).toUpperCase() + role.slice(1)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </GlassCard>

                {/* Account Info Card */}
                <GlassCard blur={GlassTokens.blur.medium}>
                    <SectionTitle>Thông tin tài khoản</SectionTitle>

                    <InfoRow
                        label="Keycloak ID"
                        value={user?.keycloakUserId || '-'}
                    />
                    <InfoRow
                        label="Số điện thoại"
                        value={user?.username || '-'}
                    />
                    <InfoRow
                        label="Email"
                        value={user?.email || '-'}
                    />
                </GlassCard>

                {/* Keycloak Details Card */}
                {keycloakDetails && (
                    <GlassCard blur={GlassTokens.blur.medium}>
                        <SectionTitle>Chi tiết Keycloak</SectionTitle>

                        <InfoRow
                            label="Họ"
                            value={keycloakDetails.firstName || '-'}
                        />
                        <InfoRow
                            label="Tên"
                            value={keycloakDetails.lastName || '-'}
                        />
                        <InfoRow
                            label="Email xác thực"
                            value={keycloakDetails.emailVerified ? 'Đã xác thực' : 'Chưa xác thực'}
                        />
                        <InfoRow
                            label="Trạng thái"
                            value={keycloakDetails.enabled ? 'Hoạt động' : 'Đã khóa'}
                        />
                    </GlassCard>
                )}

                {/* Action Buttons */}
                <GlassButton
                    title="Làm mới"
                    icon="refresh"
                    onPress={loadUserDetails}
                    loading={loadingDetails}
                    variant="secondary"
                    style={{ marginBottom: 12 }}
                />

                <GlassButton
                    title={isLoading ? 'Đang đăng xuất...' : 'ĐĂNG XUẤT'}
                    icon="logout"
                    onPress={handleLogout}
                    loading={isLoading}
                    variant="error"
                    style={{ marginBottom: 32 }}
                />
            </ScrollView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        padding: UnifiedSpacing.lg,
        paddingTop: 60,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: GlassTokens.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: UnifiedSpacing.md,
        alignSelf: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        color: GlassTokens.colors.white,
    },
    userName: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: GlassTokens.colors.textPrimary,
        marginBottom: 4,
        textAlign: 'center',
        textShadowColor: GlassTokens.colors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    userEmail: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: GlassTokens.colors.textSecondary,
        marginBottom: UnifiedSpacing.md,
        textAlign: 'center',
    },
    rolesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    roleBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: UnifiedRadius.sm,
        borderWidth: 1,
    },
    roleText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
});
