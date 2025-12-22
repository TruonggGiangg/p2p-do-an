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
    StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, AvailableLoan, InvestmentStats } from '../../services/invest';
import { useAuth } from '../../contexts/AuthContext';
import { DarkColors, DarkStyling, DarkGradients } from '../../theme';
import { GlowCard, GlowBadge } from '../../components/glow';

/**
 * InvestListScreen - Lists available loans for investment (Dark Theme)
 */
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
            <GlowCard style={styles.loanCard} variant="glass">
                {/* Header Row */}
                <View style={styles.loanHeader}>
                    <View style={styles.loanIdContainer}>
                        <View style={styles.iconCircle}>
                            <MaterialCommunityIcons name="briefcase-outline" size={18} color={DarkColors.primary} />
                        </View>
                        <View>
                            <Text style={styles.loanId}>Khoản vay</Text>
                            <Text style={styles.loanIdSub}>{item.info.periodMonth} tháng</Text>
                        </View>
                    </View>
                    <GlowBadge
                        label={`${item.fundedPercentage}% funded`}
                        status="success"
                        icon="check-circle-outline"
                    />
                </View>

                {/* Info Grid */}
                <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Số tiền vay</Text>
                        <Text style={styles.infoValue}>{formatCurrency(item.info.capital)}₫</Text>
                    </View>
                    <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Lãi suất</Text>
                        <Text style={[styles.infoValue, { color: DarkColors.success }]}>{item.info.rate}%/tháng</Text>
                    </View>
                </View>

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
                    <MaterialCommunityIcons name="chevron-right" size={20} color={DarkColors.textSecondary} />
                </View>
            </GlowCard>
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
            <GlowCard variant="primary" style={styles.balanceCard}>
                <LinearGradient
                    colors={['rgba(255, 0, 64, 0.15)', 'rgba(255, 0, 64, 0.05)']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                <View style={styles.balanceTop}>
                    <Text style={styles.balanceLabel}>Số dư ví</Text>
                    <MaterialCommunityIcons name="wallet" size={24} color={DarkColors.primary} />
                </View>
                <Text style={styles.balanceValue}>
                    {balance ? formatCurrency(balance.availableBalance) : '---'}₫
                </Text>
                <TouchableOpacity
                    style={styles.portfolioBtn}
                    onPress={() => navigation.navigate('MyInvestments')}
                >
                    <Text style={styles.portfolioBtnText}>Xem Portfolio</Text>
                    <MaterialCommunityIcons name="arrow-right" size={16} color={DarkColors.white} />
                </TouchableOpacity>
            </GlowCard>

            {/* Stats Row */}
            {stats && (
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="cash-multiple" size={20} color={DarkColors.primary} />
                        <Text style={styles.statValue}>{formatCurrency(stats.totalInvested)}</Text>
                        <Text style={styles.statLabel}>Đã đầu tư</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="trending-up" size={20} color={DarkColors.success} />
                        <Text style={[styles.statValue, { color: DarkColors.success }]}>
                            {formatCurrency(stats.totalEarned)}
                        </Text>
                        <Text style={styles.statLabel}>Đã nhận</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="chart-line" size={20} color={DarkColors.warning} />
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
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DarkColors.primary} />
                <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
        );
    }

    return (
        <LinearGradient
            colors={DarkGradients.background}
            style={styles.container}
        >
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />
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
                        tintColor={DarkColors.primary}
                        colors={[DarkColors.primary]}
                    />
                }
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <MaterialCommunityIcons name="briefcase-search-outline" size={48} color={DarkColors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>Chưa có khoản vay</Text>
                        <Text style={styles.emptyText}>Không có khoản vay nào đang chờ đầu tư</Text>
                    </View>
                }
            />
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
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
    listContent: {
        paddingBottom: 100,
    },
    // Header
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    welcomeLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginBottom: 2,
    },
    userName: {
        fontSize: 24,
        fontWeight: '700',
        color: DarkColors.text,
    },
    avatarContainer: {
        borderWidth: 2,
        borderColor: DarkColors.primary,
        borderRadius: 26,
        padding: 2,
    },
    // Balance Card
    balanceCard: {
        borderRadius: DarkStyling.borderRadius.xl,
        padding: 24,
        marginBottom: 16,
    },
    balanceTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    balanceLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
    },
    balanceValue: {
        fontSize: 36,
        fontWeight: '700',
        color: DarkColors.primary,
        marginBottom: 16,
        textShadowColor: DarkColors.primaryGlow,
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
        borderRadius: DarkStyling.borderRadius.full,
        gap: 6,
    },
    portfolioBtnText: {
        color: DarkColors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    // Stats Row
    statsRow: {
        flexDirection: 'row',
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: DarkColors.border,
        marginHorizontal: 8,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '700',
        color: DarkColors.text,
        marginTop: 8,
    },
    statLabel: {
        fontSize: 11,
        color: DarkColors.textSecondary,
        marginTop: 4,
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
        color: DarkColors.text,
    },
    loanCount: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    // Loan Card
    loanCard: {
        marginHorizontal: 20,
        marginBottom: 12,
        padding: 0, // GlowCard handles padding
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
        backgroundColor: `${DarkColors.primary}20`,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loanId: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
    },
    loanIdSub: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: DarkStyling.borderRadius.full,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
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
        color: DarkColors.textSecondary,
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.text,
    },
    // Progress
    progressContainer: {
        marginBottom: 12,
    },
    progressBar: {
        height: 6,
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: DarkColors.success,
        borderRadius: 3,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    progressLabel: {
        fontSize: 13,
        color: DarkColors.textSecondary,
    },
    progressValue: {
        fontSize: 13,
        fontWeight: '600',
        color: DarkColors.primary,
    },
    // Action Row
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
    },
    notesText: {
        fontSize: 13,
        color: DarkColors.textSecondary,
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
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        textAlign: 'center',
    },
});
