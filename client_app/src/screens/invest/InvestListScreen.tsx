import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, AvailableLoan, InvestmentStats } from '../../services/invest';
import { useAuth } from '../../contexts/AuthContext';
import { GradientBackground, GlassCard, GlassTokens, SectionTitle } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

export default function InvestListScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const [loans, setLoans] = useState<AvailableLoan[]>([]);
    const [stats, setStats] = useState<InvestmentStats | null>(null);
    const [balance, setBalance] = useState<{ balance: number; availableBalance: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const loadData = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
                setPage(1);
            }

            const [loansRes, statsRes, balanceRes] = await Promise.all([
                investApi.getAvailableLoans(isRefresh ? 1 : page, 10),
                investApi.getStats(),
                investApi.getMyBalance(),
            ]);

            setLoans(isRefresh ? loansRes.data : [...loans, ...loansRes.data]);
            setStats(statsRes);
            setBalance(balanceRes);
            setHasMore(loansRes.pagination.page < loansRes.pagination.totalPages);
        } catch (error: any) {
            console.error('Error loading data:', error);
            Alert.alert('Lỗi', error.message || 'Không thể tải dữ liệu');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, loans]);

    useEffect(() => {
        loadData(true);
    }, []);

    const onRefresh = () => loadData(true);

    const loadMore = () => {
        if (hasMore && !loading) {
            setPage(prev => prev + 1);
        }
    };

    useEffect(() => {
        if (page > 1) loadData();
    }, [page]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    const renderLoanItem = ({ item }: { item: AvailableLoan }) => (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('InvestDetail', { loan: item })}
        >
            <GlassCard blur={GlassTokens.blur.light} style={styles.loanCard}>
                {/* Header Row */}
                <View style={styles.loanHeader}>
                    <View style={styles.loanIdContainer}>
                        <View style={styles.iconCircle}>
                            <MaterialCommunityIcons name="briefcase-outline" size={18} color={GlassTokens.colors.primary} />
                        </View>
                        <View>
                            <Text style={styles.loanId}>Khoản vay</Text>
                            <Text style={styles.loanIdSub}>{item.info.periodMonth} tháng</Text>
                        </View>
                    </View>
                    <View style={styles.fundedBadge}>
                        <Text style={styles.fundedText}>{item.fundedPercentage}% funded</Text>
                    </View>
                </View>

                {/* Info Grid */}
                <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Số tiền vay</Text>
                        <Text style={styles.infoValue}>{formatCurrency(item.info.capital)}₫</Text>
                    </View>
                    <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Lãi bạn nhận</Text>
                        <Text style={[styles.infoValue, { color: GlassTokens.colors.success }]}>
                            {item.lenderInterestRate
                                ? `${item.lenderInterestRate}%/năm`
                                : `${item.info.rate}%/tháng`}
                        </Text>
                    </View>
                </View>

                {/* Tier Badge */}
                {item.loanSizeTier && (
                    <View style={styles.tierRow}>
                        <View style={[styles.tierBadge, {
                            backgroundColor: item.loanSizeTier === 'large' ? '#FF6B4520'
                                : item.loanSizeTier === 'medium' ? '#FFB84D20' : '#4ADE8020'
                        }]}>
                            <Text style={[styles.tierText, {
                                color: item.loanSizeTier === 'large' ? '#FF6B45'
                                    : item.loanSizeTier === 'medium' ? '#FFB84D' : '#4ADE80'
                            }]}>
                                {item.loanSizeTier === 'large' ? '🔥 Lớn'
                                    : item.loanSizeTier === 'medium' ? '📊 Vừa' : '💚 Nhỏ'}
                            </Text>
                        </View>
                        <Text style={styles.tierDesc}>
                            Spread: {item.adminSpread || 3}%
                        </Text>
                    </View>
                )}

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${item.fundedPercentage}%` }]} />
                    </View>
                    <View style={styles.progressInfo}>
                        <Text style={styles.progressLabel}>Còn trống</Text>
                        <Text style={styles.progressValue}>{formatCurrency(item.availableAmount)}₫</Text>
                    </View>
                </View>

                {/* Action Row */}
                <View style={styles.actionRow}>
                    <Text style={styles.notesText}>{item.availableNotes} notes có thể đầu tư</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={GlassTokens.colors.textSecondary} />
                </View>
            </GlassCard>
        </TouchableOpacity>
    );

    const renderHeader = () => (
        <View style={styles.header}>
            {/* Top Row */}
            <View style={styles.headerTop}>
                <View>
                    <Text style={styles.welcomeLabel}>Xin chào,</Text>
                    <Text style={styles.userName}>{user?.name || 'Investor'}</Text>
                </View>
                <TouchableOpacity style={styles.avatarContainer}>
                    <Avatar.Image size={48} source={{ uri: 'https://i.pravatar.cc/150' }} />
                </TouchableOpacity>
            </View>

            {/* Balance Card */}
            <GlassCard variant="primary" blur={GlassTokens.blur.medium}>
                <View style={styles.balanceTop}>
                    <Text style={styles.balanceLabel}>Số dư ví</Text>
                    <MaterialCommunityIcons name="wallet" size={24} color={GlassTokens.colors.primary} />
                </View>
                <Text style={styles.balanceValue}>
                    {balance ? formatCurrency(balance.availableBalance) : '---'}₫
                </Text>
                <TouchableOpacity
                    style={styles.portfolioBtn}
                    onPress={() => navigation.navigate('MyInvestments')}
                >
                    <Text style={styles.portfolioBtnText}>Xem Portfolio</Text>
                    <MaterialCommunityIcons name="arrow-right" size={16} color={GlassTokens.colors.white} />
                </TouchableOpacity>
            </GlassCard>

            {/* Stats Row */}
            {stats && (
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="cash-multiple" size={20} color={GlassTokens.colors.primary} />
                        <Text style={styles.statValue}>{formatCurrency(stats.totalInvested)}</Text>
                        <Text style={styles.statLabel}>Đã đầu tư</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="trending-up" size={20} color={GlassTokens.colors.success} />
                        <Text style={[styles.statValue, { color: GlassTokens.colors.success }]}>
                            {formatCurrency(stats.totalEarned)}
                        </Text>
                        <Text style={styles.statLabel}>Đã nhận</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="chart-line" size={20} color={GlassTokens.colors.warning} />
                        <Text style={styles.statValue}>{stats.activeInvestments}</Text>
                        <Text style={styles.statLabel}>Đang hoạt động</Text>
                    </View>
                </View>
            )}

            {/* Section Title */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Khoản vay có thể đầu tư</Text>
                <Text style={styles.loanCount}>{loans.length} khoản</Text>
            </View>
        </View>
    );

    if (loading && loans.length === 0) {
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
            <FlatList
                data={loans}
                keyExtractor={(item) => item._id}
                renderItem={renderLoanItem}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={GlassTokens.colors.primary}
                        colors={[GlassTokens.colors.primary]}
                    />
                }
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <MaterialCommunityIcons name="briefcase-search-outline" size={48} color={GlassTokens.colors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>Chưa có khoản vay</Text>
                        <Text style={styles.emptyText}>Không có khoản vay nào đang chờ đầu tư</Text>
                    </View>
                }
            />
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
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
    listContent: {
        paddingBottom: 100,
    },
    // Header
    header: {
        paddingTop: 60,
        paddingHorizontal: UnifiedSpacing.lg,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: UnifiedSpacing.xl,
    },
    welcomeLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 2,
        fontFamily: 'Poppins_400Regular',
    },
    userName: {
        fontSize: 24,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
    },
    avatarContainer: {
        borderWidth: 2,
        borderColor: GlassTokens.colors.primary,
        borderRadius: 26,
        padding: 2,
    },
    // Balance Card
    balanceTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    balanceLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        fontFamily: 'Poppins_400Regular',
    },
    balanceValue: {
        fontSize: 36,
        fontWeight: '700',
        color: GlassTokens.colors.primary,
        marginBottom: 16,
        fontFamily: 'Poppins_700Bold',
        textShadowColor: GlassTokens.colors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
    },
    portfolioBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: UnifiedRadius.full,
        gap: 6,
    },
    portfolioBtnText: {
        color: GlassTokens.colors.white,
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    // Stats Row
    statsRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: UnifiedRadius.lg,
        padding: 16,
        marginBottom: UnifiedSpacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 8,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginTop: 8,
        fontFamily: 'Poppins_700Bold',
    },
    statLabel: {
        fontSize: 11,
        color: GlassTokens.colors.textSecondary,
        marginTop: 4,
        fontFamily: 'Poppins_400Regular',
    },
    // Section Header
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    loanCount: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    // Loan Card
    loanCard: {
        marginHorizontal: UnifiedSpacing.lg,
        marginBottom: 12,
    },
    loanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    loanIdContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: `${GlassTokens.colors.primary}20`,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loanId: {
        fontSize: 15,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    loanIdSub: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
    fundedBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: UnifiedRadius.full,
        backgroundColor: `${GlassTokens.colors.success}20`,
        borderWidth: 1,
        borderColor: `${GlassTokens.colors.success}40`,
    },
    fundedText: {
        fontSize: 12,
        fontWeight: '600',
        color: GlassTokens.colors.success,
        fontFamily: 'Poppins_600SemiBold',
    },
    // Info Grid
    infoGrid: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    infoItem: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 4,
        fontFamily: 'Poppins_400Regular',
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    // Progress
    progressContainer: {
        marginBottom: 12,
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: GlassTokens.colors.success,
        borderRadius: 3,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    progressLabel: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    progressValue: {
        fontSize: 13,
        fontWeight: '600',
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    // Action Row
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    notesText: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    // Empty State
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        marginBottom: 8,
        fontFamily: 'Poppins_600SemiBold',
    },
    emptyText: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    // Tier Badge
    tierRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    tierBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    tierText: {
        fontSize: 12,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    tierDesc: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
});
