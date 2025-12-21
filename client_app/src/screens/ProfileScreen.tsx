import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Avatar, Divider, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services';
import type { KeycloakUserDetails } from '../types';
import { DarkColors, DarkStyling } from '../theme';

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

    const getRoleColor = (role: string) => {
        switch (role.toLowerCase()) {
            case 'lender': return DarkColors.success;
            case 'borrower': return DarkColors.warning;
            case 'admin': return DarkColors.error;
            default: return DarkColors.primary;
        }
    };

    return (
        <ScrollView style={styles.container}>
            {/* Profile Header Card */}
            <View style={styles.headerCard}>
                <LinearGradient
                    colors={DarkColors.gradientPrimary}
                    style={styles.avatarContainer}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Text style={styles.avatarText}>
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                </LinearGradient>
                <Text style={styles.userName}>{user?.name || 'Unknown User'}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>

                {/* Role Badges */}
                <View style={styles.rolesContainer}>
                    {user?.roles?.map((role, index) => (
                        <View
                            key={index}
                            style={[styles.roleBadge, { backgroundColor: `${getRoleColor(role)}20` }]}
                        >
                            <Text style={[styles.roleText, { color: getRoleColor(role) }]}>
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Account Info Card */}
            <View style={styles.card}>
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
            </View>

            {/* Keycloak Details Card */}
            {keycloakDetails && (
                <View style={styles.card}>
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
                </View>
            )}

            {/* Action Buttons */}
            <TouchableOpacity
                onPress={loadUserDetails}
                disabled={loadingDetails}
                style={styles.refreshButton}
                activeOpacity={0.8}
            >
                {loadingDetails ? (
                    <ActivityIndicator size="small" color={DarkColors.primary} />
                ) : (
                    <>
                        <MaterialCommunityIcons name="refresh" size={20} color={DarkColors.primary} />
                        <Text style={styles.refreshButtonText}>Làm mới</Text>
                    </>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                onPress={handleLogout}
                disabled={isLoading}
                activeOpacity={0.8}
            >
                <LinearGradient
                    colors={['#FF4757', '#FF6B81']}
                    style={styles.logoutButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                >
                    <MaterialCommunityIcons name="logout" size={20} color={DarkColors.white} />
                    <Text style={styles.logoutButtonText}>
                        {isLoading ? 'Đang đăng xuất...' : 'Đăng Xuất'}
                    </Text>
                </LinearGradient>
            </TouchableOpacity>
        </ScrollView>
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
        backgroundColor: DarkColors.background,
        padding: 16,
    },
    headerCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.border,
        marginBottom: 16,
        ...DarkStyling.shadow.card,
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
    roleBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: DarkStyling.borderRadius.full,
    },
    roleText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    card: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.md,
        padding: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
        marginBottom: 16,
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
    refreshButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.sm,
        borderWidth: 1,
        borderColor: DarkColors.primary,
        paddingVertical: 14,
        marginBottom: 12,
        gap: 8,
    },
    refreshButtonText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.primary,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: DarkStyling.borderRadius.sm,
        paddingVertical: 16,
        marginBottom: 32,
        gap: 8,
        ...DarkStyling.shadow.subtle,
    },
    logoutButtonText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.white,
    },
});
