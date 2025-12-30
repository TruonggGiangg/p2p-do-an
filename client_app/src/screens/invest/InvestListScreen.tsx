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
import { LineChart } from "react-native-gifted-charts";
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

    // Chart interactivity state
    const [chartRange, setChartRange] = useState<'1W' | '1M' | '3M' | '1Y'>('1M');
    const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('area');
    const [chartData, setChartData] = useState<Array<{ value: number; label: string }>>([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartSummary, setChartSummary] = useState<{ totalProfit: number; totalBalance: number } | null>(null);

    // Load chart data from API
    const loadChartData = useCallback(async (range: string) => {
        try {
            setChartLoading(true);
            const historyRes = await investApi.getInvestmentHistory(range);
            const formattedData = historyRes.data.map((item: any) => ({
                value: item.value || 0,
                label: item.label,
            }));
            setChartData(formattedData);
            setChartSummary({
                totalProfit: historyRes.summary?.totalProfit || 0,
                totalBalance: historyRes.summary?.totalBalance || 0,
            });
        } catch (error) {
            console.error('Error loading chart data:', error);
            // Fallback to mock data if API fails
            setChartData([
                { value: 48000000, label: 'T1' },
                { value: 52000000, label: 'T2' },
                { value: 49500000, label: 'T3' },
                { value: 62000000, label: 'T4' },
                { value: 58000000, label: 'T5' },
                { value: balance?.availableBalance || 65000000, label: 'T6' },
            ]);
        } finally {
            setChartLoading(false);
        }
    }, [balance]);

    // Load chart data when range changes
    useEffect(() => {
        loadChartData(chartRange);
    }, [chartRange]);

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
                            <MaterialCommunityIcons name="cash-multiple" size={20} color={GlassTokens.colors.primary} />
                        </View>
                        <View>
                            <Text style={styles.loanId}>{formatCurrency(item.info.capital)}₫</Text>
                            <View style={styles.durationRow}>
                                <MaterialCommunityIcons name="calendar-clock" size={12} color={GlassTokens.colors.textSecondary} />
                                <Text style={styles.loanIdSub}>{item.info.periodMonth} tháng</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.fundedBadge}>
                        <MaterialCommunityIcons name="chart-arc" size={14} color={GlassTokens.colors.success} />
                        <Text style={styles.fundedText}>{item.fundedPercentage}%</Text>
                    </View>
                </View>

                {/* Stats Row with Icons */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <View style={styles.statIconContainer}>
                            <MaterialCommunityIcons name="trending-up" size={16} color={GlassTokens.colors.success} />
                        </View>
                        <View style={styles.statContent}>
                            <Text style={styles.statLabel}>Lãi suất</Text>
                            <Text style={styles.statValue}>
                                {item.lenderInterestRate
                                    ? `${item.lenderInterestRate}%`
                                    : `${item.info.rate}%`}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.statDivider} />

                    <View style={styles.statItem}>
                        <View style={styles.statIconContainer}>
                            <MaterialCommunityIcons name="wallet-outline" size={16} color={GlassTokens.colors.primary} />
                        </View>
                        <View style={styles.statContent}>
                            <Text style={styles.statLabel}>Còn trống</Text>
                            <Text style={[styles.statValue, { color: GlassTokens.colors.primary, fontWeight: '700' }]}>
                                {formatCurrency(item.availableAmount)}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.statDivider} />

                    <View style={styles.statItem}>
                        <View style={styles.statIconContainer}>
                            <MaterialCommunityIcons name="file-document-multiple-outline" size={16} color={GlassTokens.colors.info} />
                        </View>
                        <View style={styles.statContent}>
                            <Text style={styles.statLabel}>Slg Notes</Text>
                            <Text style={styles.statValue}>{item.availableNotes}</Text>
                        </View>
                    </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${item.fundedPercentage}%` }]} />
                    </View>
                </View>

                {/* Action Row */}
                <View style={styles.actionRow}>
                    <View style={styles.actionLeft}>
                        <MaterialCommunityIcons name="shield-check" size={16} color={GlassTokens.colors.success} />
                        <Text style={styles.verifiedText}>Đã xác minh</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={GlassTokens.colors.primary} />
                </View>
            </GlassCard>
        </TouchableOpacity>
    );

    const renderHeader = () => {
        // Use real data from API or fallback
        const displayData = chartData.length > 0 ? chartData : [
            { value: 48000000, label: 'T1' },
            { value: 52000000, label: 'T2' },
            { value: 49500000, label: 'T3' },
            { value: 62000000, label: 'T4' },
            { value: 58000000, label: 'T5' },
            { value: balance ? balance.availableBalance : 65000000, label: 'T6' },
        ];

        // Time range options
        const timeRanges: Array<{ key: '1W' | '1M' | '3M' | '1Y'; label: string }> = [
            { key: '1W', label: '1W' },
            { key: '1M', label: '1M' },
            { key: '3M', label: '3M' },
            { key: '1Y', label: '1Y' },
        ];

        // Chart type options
        const chartTypes: Array<{ key: 'line' | 'area' | 'bar'; icon: string }> = [
            { key: 'line', icon: 'chart-line' },
            { key: 'area', icon: 'chart-areaspline' },
            { key: 'bar', icon: 'chart-bar' },
        ];

        return (
            <View style={styles.header}>
                {/* Top Row */}
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.welcomeLabel}>Portfolio Total</Text>
                        <Text style={styles.balanceBig}>{balance ? formatCurrency(balance.availableBalance) : '---'}₫</Text>
                        <View style={styles.growthRow}>
                            <MaterialCommunityIcons name="trending-up" size={16} color={GlassTokens.colors.success} />
                            <Text style={styles.growthText}>
                                +{chartSummary ? formatCurrency(chartSummary.totalProfit) : '---'}₫ ({chartRange})
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.avatarContainer}>
                        <Avatar.Image size={44} source={{ uri: 'https://i.pravatar.cc/150' }} />
                    </TouchableOpacity>
                </View>

                {/* Fintech Chart Card */}
                <GlassCard variant="primary" blur={GlassTokens.blur.medium} style={styles.chartCard}>
                    {/* Chart Header */}
                    <View style={styles.chartHeader}>
                        <Text style={styles.chartLabel}>Tổng vốn đầu tư</Text>
                        <View style={styles.chartBadge}>
                            <Text style={styles.chartBadgeText}>Live</Text>
                        </View>
                    </View>

                    {/* Chart Controls Row */}
                    <View style={styles.chartControlsRow}>
                        {/* Time Range Selector */}
                        <View style={styles.timeRangeContainer}>
                            {timeRanges.map((range) => (
                                <TouchableOpacity
                                    key={range.key}
                                    style={[
                                        styles.timeRangeChip,
                                        chartRange === range.key && styles.timeRangeChipActive,
                                    ]}
                                    onPress={() => setChartRange(range.key)}
                                >
                                    <Text style={[
                                        styles.timeRangeText,
                                        chartRange === range.key && styles.timeRangeTextActive,
                                    ]}>
                                        {range.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Chart Type Toggle */}
                        <View style={styles.chartTypeContainer}>
                            {chartTypes.map((type) => (
                                <TouchableOpacity
                                    key={type.key}
                                    style={[
                                        styles.chartTypeBtn,
                                        chartType === type.key && styles.chartTypeBtnActive,
                                    ]}
                                    onPress={() => setChartType(type.key)}
                                >
                                    <MaterialCommunityIcons
                                        name={type.icon as any}
                                        size={16}
                                        color={chartType === type.key ? GlassTokens.colors.primary : GlassTokens.colors.textSecondary}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Chart */}
                    <View style={{ marginLeft: -20, marginTop: 10, minHeight: 120 }}>
                        {chartLoading ? (
                            <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                                <ActivityIndicator size="small" color={GlassTokens.colors.white} />
                            </View>
                        ) : (
                            <LineChart
                                data={displayData}
                                areaChart={chartType === 'area'}
                                curved
                                width={260}
                                height={120}
                                color={GlassTokens.colors.white}
                                thickness={chartType === 'bar' ? 0 : 3}
                                startFillColor={chartType === 'area' ? 'rgba(255,255,255,0.2)' : 'transparent'}
                                endFillColor={chartType === 'area' ? 'rgba(255,255,255,0.0)' : 'transparent'}
                                startOpacity={0.9}
                                endOpacity={0.0}
                                initialSpacing={5}
                                noOfSections={3}
                                yAxisThickness={0}
                                xAxisThickness={0}
                                yAxisTextStyle={{ color: GlassTokens.colors.textSecondary, fontSize: 9 }}
                                xAxisLabelTextStyle={{ color: GlassTokens.colors.textSecondary, fontSize: 9 }}
                                formatYLabel={(val) => {
                                    const num = Number(val);
                                    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
                                    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
                                    return val;
                                }}
                                hideRules={false}
                                rulesColor="rgba(255,255,255,0.1)"
                                hideYAxisText={false}
                                yAxisLabelWidth={55}
                                hideAxesAndRules={false}
                                hideDataPoints={chartType === 'area'}
                                dataPointsColor={GlassTokens.colors.white}
                                dataPointsRadius={4}
                                pointerConfig={{
                                    pointerStripHeight: 120,
                                    pointerStripColor: 'rgba(255,255,255,0.5)',
                                    pointerStripWidth: 2,
                                    pointerColor: GlassTokens.colors.white,
                                    radius: 6,
                                    pointerLabelWidth: 120,
                                    pointerLabelHeight: 90,
                                    activatePointersOnLongPress: false,
                                    autoAdjustPointerLabelPosition: false,
                                    pointerLabelComponent: (items: any) => {
                                        return (
                                            <View
                                                style={{
                                                    height: 90,
                                                    width: 120,
                                                    justifyContent: 'center',
                                                    marginTop: -30,
                                                    marginLeft: -50,
                                                }}>
                                                <View style={{ padding: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.85)' }}>
                                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'center' }}>
                                                        {items[0]?.label || ''}
                                                    </Text>
                                                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                                                        {formatCurrency(items[0]?.value || 0)}₫
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    },
                                }}
                            />
                        )}
                    </View>

                    {/* Quick Stats in Header */}
                    {stats && (
                        <View style={styles.quickStatsRow}>
                            <View>
                                <Text style={styles.quickStatLabel}>Lợi nhuận</Text>
                                <Text style={styles.quickStatValue}>+{formatCurrency(stats.totalEarned)}</Text>
                            </View>
                            <View style={styles.quickDivider} />
                            <View>
                                <Text style={styles.quickStatLabel}>Đang đầu tư</Text>
                                <Text style={styles.quickStatValue}>{formatCurrency(stats.totalInvested)}</Text>
                            </View>
                        </View>
                    )}
                </GlassCard>

                {/* Section Title */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Cơ hội đầu tư</Text>
                    <View style={styles.countBadge}>
                        <Text style={styles.countText}>{loans.length}</Text>
                    </View>
                </View>
            </View>
        );
    };

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
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    welcomeLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 4,
    },
    balanceBig: {
        fontSize: 32,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -1,
    },
    growthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    growthText: {
        fontSize: 13,
        color: GlassTokens.colors.success,
        fontFamily: 'Poppins_500Medium',
    },
    avatarContainer: {
        borderWidth: 2,
        borderColor: GlassTokens.colors.primary,
        borderRadius: 26,
        padding: 2,
    },
    // Chart Card
    chartCard: {
        marginBottom: 32,
        paddingBottom: 0,
        overflow: 'hidden',
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    chartLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        fontFamily: 'Poppins_600SemiBold',
    },
    chartBadge: {
        backgroundColor: 'rgba(48, 209, 88, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(48, 209, 88, 0.4)',
    },
    chartBadgeText: {
        fontSize: 10,
        color: GlassTokens.colors.success,
        fontWeight: 'bold',
    },
    // Chart Controls
    chartControlsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    timeRangeContainer: {
        flexDirection: 'row',
        gap: 6,
    },
    timeRangeChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    timeRangeChipActive: {
        backgroundColor: GlassTokens.colors.primary,
    },
    timeRangeText: {
        fontSize: 11,
        color: GlassTokens.colors.textSecondary,
        fontWeight: '600',
    },
    timeRangeTextActive: {
        color: GlassTokens.colors.white,
    },
    chartTypeContainer: {
        flexDirection: 'row',
        gap: 4,
    },
    chartTypeBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    chartTypeBtnActive: {
        backgroundColor: 'rgba(10, 132, 255, 0.2)',
    },
    quickStatsRow: {
        flexDirection: 'row',
        marginTop: 10,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    quickStatLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 2,
    },
    quickStatValue: {
        fontSize: 15,
        fontWeight: '600',
        color: GlassTokens.colors.white,
    },
    quickDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 20,
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
    countBadge: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    countText: {
        fontSize: 12,
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
        marginLeft: 4,
    },
    durationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    fundedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
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
    // Stats Row (Loan Item)
    statsRow: {
        flexDirection: 'row',
        marginBottom: 16,
        gap: 8,
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statContent: {
        flex: 1,
    },
    statLabel: {
        fontSize: 10,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 2,
        fontFamily: 'Poppins_400Regular',
    },
    statValue: {
        fontSize: 13,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
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
    actionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    verifiedText: {
        fontSize: 12,
        color: GlassTokens.colors.success,
        fontFamily: 'Poppins_500Medium',
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
