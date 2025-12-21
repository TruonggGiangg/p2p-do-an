import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Alert,
    StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi } from '../../services/invest';
import { DarkColors, DarkStyling } from '../../theme';

/**
 * WalletScreen - Shows lender's wallet balance and transactions (Dark Theme)
 */
export default function WalletScreen() {
    const [balance, setBalance] = useState<{
        balance: number;
        availableBalance: number;
        accountId?: number;
        accountNo?: string;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setRefreshing(true);
            const balanceData = await investApi.getMyBalance();
            setBalance(balanceData);
        } catch (error: any) {
            console.error('Error loading wallet:', error);
            Alert.alert('Lỗi', error.message || 'Không thể tải thông tin ví');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DarkColors.primary} />
                <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={loadData}
                        tintColor={DarkColors.primary}
                        colors={[DarkColors.primary]}
                    />
                }
                contentContainerStyle={styles.scrollContent}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Ví của tôi</Text>
                    <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
                        <MaterialCommunityIcons name="refresh" size={24} color={DarkColors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Balance Card */}
                <LinearGradient
                    colors={['#4347FF', '#6366F1'] as const}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.balanceCard}
                >
                    <View style={styles.balanceHeader}>
                        <View>
                            <Text style={styles.balanceLabel}>Số dư khả dụng</Text>
                            <Text style={styles.balanceValue}>
                                {balance ? formatCurrency(balance.availableBalance) : '---'}₫
                            </Text>
                        </View>
                        <View style={styles.walletIcon}>
                            <MaterialCommunityIcons name="wallet" size={32} color="rgba(255,255,255,0.9)" />
                        </View>
                    </View>

                    <View style={styles.balanceFooter}>
                        <View>
                            <Text style={styles.totalLabel}>Tổng số dư</Text>
                            <Text style={styles.totalValue}>
                                {balance ? formatCurrency(balance.balance) : '---'}₫
                            </Text>
                        </View>
                        {balance?.accountNo && (
                            <View style={styles.accountBadge}>
                                <Text style={styles.accountNo}>#{balance.accountNo}</Text>
                            </View>
                        )}
                    </View>
                </LinearGradient>

                {/* Quick Actions */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: `${DarkColors.success}20` }]}>
                            <MaterialCommunityIcons name="arrow-down" size={24} color={DarkColors.success} />
                        </View>
                        <Text style={styles.actionLabel}>Nạp tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: `${DarkColors.warning}20` }]}>
                            <MaterialCommunityIcons name="arrow-up" size={24} color={DarkColors.warning} />
                        </View>
                        <Text style={styles.actionLabel}>Rút tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: `${DarkColors.primary}20` }]}>
                            <MaterialCommunityIcons name="swap-horizontal" size={24} color={DarkColors.primary} />
                        </View>
                        <Text style={styles.actionLabel}>Chuyển tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: `${DarkColors.secondary}20` }]}>
                            <MaterialCommunityIcons name="history" size={24} color={DarkColors.secondary} />
                        </View>
                        <Text style={styles.actionLabel}>Lịch sử</Text>
                    </TouchableOpacity>
                </View>

                {/* Account Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Thông tin tài khoản</Text>
                    <View style={styles.infoCard}>
                        <InfoRow label="ID Tài khoản" value={balance?.accountId?.toString() || '---'} />
                        <InfoRow label="Số tài khoản" value={balance?.accountNo || '---'} />
                        <InfoRow label="Loại tài khoản" value="Savings Account" isLast />
                    </View>
                </View>

                {/* Investment Stats */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tổng quan đầu tư</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statCard}>
                            <MaterialCommunityIcons name="briefcase-outline" size={24} color={DarkColors.primary} />
                            <Text style={styles.statValue}>---</Text>
                            <Text style={styles.statLabel}>Đang đầu tư</Text>
                        </View>
                        <View style={styles.statCard}>
                            <MaterialCommunityIcons name="trending-up" size={24} color={DarkColors.success} />
                            <Text style={[styles.statValue, { color: DarkColors.success }]}>---</Text>
                            <Text style={styles.statLabel}>Lợi nhuận</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

interface InfoRowProps {
    label: string;
    value: string;
    isLast?: boolean;
}

function InfoRow({ label, value, isLast }: InfoRowProps) {
    return (
        <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: DarkColors.background,
    },
    loadingText: {
        marginTop: 12,
        color: DarkColors.textSecondary,
        fontSize: 14,
    },
    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: DarkColors.text,
    },
    refreshBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: DarkColors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    // Balance Card
    balanceCard: {
        marginHorizontal: 20,
        borderRadius: DarkStyling.borderRadius.xl,
        padding: 24,
    },
    balanceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    walletIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    balanceLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 8,
    },
    balanceValue: {
        color: DarkColors.white,
        fontSize: 36,
        fontWeight: '700',
    },
    balanceFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.2)',
    },
    totalLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        marginBottom: 4,
    },
    totalValue: {
        color: DarkColors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    accountBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: DarkStyling.borderRadius.full,
    },
    accountNo: {
        color: DarkColors.white,
        fontSize: 12,
        fontWeight: '500',
    },
    // Actions
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 24,
        paddingHorizontal: 16,
    },
    actionButton: {
        alignItems: 'center',
    },
    actionIcon: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    actionLabel: {
        color: DarkColors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
    },
    // Section
    section: {
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 12,
    },
    // Info Card
    infoCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.md,
        padding: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    infoRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: DarkColors.border,
    },
    infoLabel: {
        color: DarkColors.textSecondary,
        fontSize: 14,
    },
    infoValue: {
        color: DarkColors.text,
        fontSize: 14,
        fontWeight: '500',
    },
    // Stats Grid
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.md,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    statValue: {
        color: DarkColors.text,
        fontSize: 24,
        fontWeight: '700',
        marginVertical: 8,
    },
    statLabel: {
        color: DarkColors.textSecondary,
        fontSize: 12,
    },
});
