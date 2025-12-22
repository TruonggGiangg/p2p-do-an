import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Avatar, Divider, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services';
import type { KeycloakUserDetails } from '../types';
import { DarkColors, DarkStyling, DarkGradients } from '../theme';
import { GlowCard, GlowBadge, GlowButton, StatusType } from '../components/glow';

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


    const getRoleStatus = (role: string): StatusType => {
        switch (role.toLowerCase()) {
            case 'lender': return 'success';
            case 'borrower': return 'warning';
            case 'admin': return 'error';
            default: return 'primary';
        }
    };

    return (
        <LinearGradient
            colors={DarkGradients.background}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Header Card */}
                <GlowCard style={styles.headerCard} variant="primary">
                    <LinearGradient
                        colors={DarkGradients.primaryButton}
                        style={styles.avatarContainer}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <Text style={styles.avatarText}>
                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </Text>
                    </LinearGradient>
                    <Text style={[styles.userName, styles.glowText]}>{user?.name || 'Unknown User'}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>

                    {/* Role Badges */}
                    <View style={styles.rolesContainer}>
                        {user?.roles?.map((role, index) => (
                            <GlowBadge
                                key={index}
                                label={role.charAt(0).toUpperCase() + role.slice(1)}
                                status={getRoleStatus(role)}
                            />
                        ))}
                    </View>
                </GlowCard>

                {/* Account Info Card */}
                <GlowCard style={styles.card}>
                    <Text style={styles.sectionTitle}>Thông tin tài khoản</Text>

                    <InfoRow
                        icon="account-key"
                        label="Keycloak ID"
                        value={user?.keycloakUserId || '-'}
                    />
                    <Divider style={styles.divider} />
                    <InfoRow
                        icon="phone"
                        label="Số điện thoại"
                        value={user?.username || '-'}
                    />
                    <Divider style={styles.divider} />
                    <InfoRow
                        icon="email"
                        label="Email"
                        value={user?.email || '-'}
                    />
                </GlowCard>

                {/* Keycloak Details Card */}
                {keycloakDetails && (
                    <GlowCard style={styles.card}>
                        <Text style={styles.sectionTitle}>Chi tiết Keycloak</Text>

                        <InfoRow
                            icon="account"
                            label="Họ"
                            value={keycloakDetails.firstName || '-'}
                        />
                        <Divider style={styles.divider} />
                        <InfoRow
                            icon="account"
                            label="Tên"
                            value={keycloakDetails.lastName || '-'}
                        />
                        <Divider style={styles.divider} />
                        <InfoRow
                            icon="check-circle"
                            label="Email xác thực"
                            value={keycloakDetails.emailVerified ? 'Đã xác thực' : 'Chưa xác thực'}
                            valueColor={keycloakDetails.emailVerified ? DarkColors.success : DarkColors.warning}
                        />
                        <Divider style={styles.divider} />
                        <InfoRow
                            icon="account-check"
                            label="Trạng thái"
                            value={keycloakDetails.enabled ? 'Hoạt động' : 'Đã khóa'}
                            valueColor={keycloakDetails.enabled ? DarkColors.success : DarkColors.error}
                        />
                    </GlowCard>
                )}

                {/* Action Buttons */}
                {/* Action Buttons */}
                <GlowButton
                    title="Làm mới"
                    icon="refresh"
                    onPress={loadUserDetails}
                    loading={loadingDetails}
                    variant="glass"
                    style={{ marginBottom: 12 }}
                />

                <GlowButton
                    title={isLoading ? 'Đang đăng xuất...' : 'Đăng Xuất'}
                    icon="logout"
                    onPress={handleLogout}
                    loading={isLoading}
                    variant="primary"
                    style={{ marginBottom: 32 }}
                    textStyle={{ color: DarkColors.white }}
                    gradientColors={['#FF4757', '#FF6B81']}
                />
            </ScrollView>
        </LinearGradient>
    );
}

interface InfoRowProps {
    icon: string;
    label: string;
    value: string;
    valueColor?: string;
}

function InfoRow({ icon, label, value, valueColor }: InfoRowProps) {
    return (
        <View style={styles.infoRow}>
            <View style={styles.infoRowLeft}>
                <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name={icon as any} size={20} color={DarkColors.textSecondary} />
                </View>
                <Text style={styles.infoLabel}>{label}</Text>
            </View>
            <Text
                style={[styles.infoValue, valueColor ? { color: valueColor } : null]}
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    headerCard: {
        alignItems: 'center',
        marginBottom: 16,
        padding: 24,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarText: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.white,
    },
    userName: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
        marginBottom: 16,
    },
    rolesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    // roleBadge styles removed
    // roleText styles removed
    card: {
        marginBottom: 16,
        padding: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.text,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    infoRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: DarkStyling.borderRadius.xs,
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
    infoValue: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.text,
        maxWidth: '50%',
        textAlign: 'right',
    },
    divider: {
        backgroundColor: DarkColors.border,
    },
    glowText: {
        textShadowColor: DarkColors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    // Button styles removed as GlowButton handles them
});
