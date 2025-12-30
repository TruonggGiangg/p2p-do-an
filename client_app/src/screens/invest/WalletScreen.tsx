import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { walletApi } from '../../services';
import { GradientBackground, GlassCard, GlassTokens, InfoRow, SectionTitle } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

export default function WalletScreen() {
    const navigation = useNavigation<any>();
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
            const balanceData = await walletApi.getBalance();
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
            <GradientBackground>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={GlassTokens.colors.primary} />
                    <Text style={styles.loadingText}>Đang tải...</Text>
                </View>
            </GradientBackground>
        );
    }

    return (
        <GradientBackground>
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={loadData}
                        tintColor={GlassTokens.colors.primary}
                        colors={[GlassTokens.colors.primary]}
                    />
                }
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Ví của tôi</Text>
                    <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
                        <MaterialCommunityIcons name="refresh" size={24} color={GlassTokens.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Balance Card */}
                <GlassCard variant="primary" blur={GlassTokens.blur.medium}>
                    <View style={styles.balanceHeader}>
                        <View>
                            <Text style={styles.balanceLabel}>Số dư khả dụng</Text>
                            <Text style={styles.balanceValue}>
                                {balance ? formatCurrency(balance.availableBalance) : '---'}₫
                            </Text>
                        </View>
                        <View style={styles.walletIcon}>
                            <MaterialCommunityIcons name="wallet" size={32} color={GlassTokens.colors.primary} />
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
                </GlassCard>

                {/* Quick Actions */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: `${GlassTokens.colors.success}20` }]}>
                            <MaterialCommunityIcons name="arrow-down" size={24} color={GlassTokens.colors.success} />
                        </View>
                        <Text style={styles.actionLabel}>Nạp tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: `${GlassTokens.colors.warning}20` }]}>
                            <MaterialCommunityIcons name="arrow-up" size={24} color={GlassTokens.colors.warning} />
                        </View>
                        <Text style={styles.actionLabel}>Rút tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('Transfer', { balance: balance?.availableBalance || 0 })}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: `${GlassTokens.colors.primary}20` }]}>
                            <MaterialCommunityIcons name="swap-horizontal" size={24} color={GlassTokens.colors.primary} />
                        </View>
                        <Text style={styles.actionLabel}>Chuyển tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('TransactionHistory')}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: `${GlassTokens.colors.info}20` }]}>
                            <MaterialCommunityIcons name="history" size={24} color={GlassTokens.colors.info} />
                        </View>
                        <Text style={styles.actionLabel}>Lịch sử</Text>
                    </TouchableOpacity>
                </View>

                {/* Account Info */}
                <View style={styles.section}>
                    <SectionTitle>Thông tin tài khoản</SectionTitle>
                    <GlassCard blur={GlassTokens.blur.light}>
                        <InfoRow label="ID Tài khoản" value={balance?.accountId?.toString() || '---'} />
                        <InfoRow label="Số tài khoản" value={balance?.accountNo || '---'} />
                        <InfoRow label="Loại tài khoản" value="Savings Account" />
                    </GlassCard>
                </View>

                {/* Investment Stats */}
                <View style={styles.section}>
                    <SectionTitle>Tổng quan đầu tư</SectionTitle>
                    <View style={styles.statsGrid}>
                        <GlassCard style={styles.statCard} blur={GlassTokens.blur.light}>
                            <MaterialCommunityIcons name="briefcase-outline" size={24} color={GlassTokens.colors.primary} />
                            <Text style={styles.statValue}>---</Text>
                            <Text style={styles.statLabel}>Đang đầu tư</Text>
                        </GlassCard>
                        <GlassCard style={styles.statCard} blur={GlassTokens.blur.light}>
                            <MaterialCommunityIcons name="trending-up" size={24} color={GlassTokens.colors.success} />
                            <Text style={[styles.statValue, { color: GlassTokens.colors.success }]}>---</Text>
                            <Text style={styles.statLabel}>Lợi nhuận</Text>
                        </GlassCard>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingBottom: 100,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: UnifiedSpacing.lg,
        paddingTop: 60,
        paddingBottom: UnifiedSpacing.lg,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
    },
    refreshBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    // Balance Card
    balanceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: UnifiedSpacing.lg,
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
        fontFamily: 'Poppins_400Regular',
    },
    balanceValue: {
        color: GlassTokens.colors.primary,
        fontSize: 36,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        textShadowColor: GlassTokens.colors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
    },
    balanceFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: UnifiedSpacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.2)',
    },
    totalLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        marginBottom: 4,
        fontFamily: 'Poppins_400Regular',
    },
    totalValue: {
        color: GlassTokens.colors.white,
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    accountBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: UnifiedRadius.full,
    },
    accountNo: {
        color: GlassTokens.colors.white,
        fontSize: 12,
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
    // Actions
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: UnifiedSpacing.xl,
        paddingHorizontal: UnifiedSpacing.md,
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
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    actionLabel: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
    // Section
    section: {
        paddingHorizontal: UnifiedSpacing.lg,
        marginBottom: UnifiedSpacing.xl,
    },
    // Stats Grid
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        flex: 1,
        padding: 20,
        alignItems: 'center',
    },
    statValue: {
        color: GlassTokens.colors.textPrimary,
        fontSize: 24,
        fontWeight: '700',
        marginVertical: 8,
        fontFamily: 'Poppins_700Bold',
    },
    statLabel: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
});
