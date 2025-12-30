import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from 'react-native-paper';
import { LineChart } from "react-native-gifted-charts";
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, AvailableLoan, InvestmentStats } from '../../services/invest';
import { useAuth } from '../../contexts/AuthContext';
import { GradientBackground, GlassCard, GlassTokens } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper: Get Icon based on purpose
const getPurposeConfig = (willing: string) => {
    const map: Record<string, { icon: string, color: string, label: string }> = {
        'business': { icon: 'briefcase-variant', color: '#60A5FA', label: 'Kinh doanh' },
        'consumption': { icon: 'cart-outline', color: '#F472B6', label: 'Tiêu dùng' },
        'education': { icon: 'school-outline', color: '#34D399', label: 'Giáo dục' },
        'medical': { icon: 'medical-bag', color: '#F87171', label: 'Y tế' },
        'real_estate': { icon: 'home-city-outline', color: '#A78BFA', label: 'Bất động sản' },
    };
    return map[willing] || { icon: 'cash-fast', color: GlassTokens.colors.primary, label: 'Vay khác' };
};

// Helper: Mock Credit Grade
const getCreditGrade = (rate: number) => {
    if (rate < 12) return { grade: 'A+', color: '#4ADE80' };
    if (rate < 15) return { grade: 'A', color: '#34D399' };
    if (rate < 18) return { grade: 'B', color: '#FACC15' };
    if (rate < 20) return { grade: 'C', color: '#FB923C' };
    return { grade: 'D', color: '#F87171' };
};

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
    const [chartData, setChartData] = useState<Array<{ value: number; label: string }>>([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartSummary, setChartSummary] = useState<{ totalProfit: number; totalBalance: number } | null>(null);

    // Load chart data
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

    useEffect(() => { loadChartData(chartRange); }, [chartRange]);

    const loadData = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) { setRefreshing(true); setPage(1); }
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
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, loans]);

    useEffect(() => { loadData(true); }, []);
    const onRefresh = () => loadData(true);
    const loadMore = () => { if (hasMore && !loading) setPage(prev => prev + 1); };
    const formatCurrency = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

    // --- RENDER LOAN ITEM (Keep the new design) ---
    const renderLoanItem = ({ item }: { item: AvailableLoan }) => {
        const purpose = getPurposeConfig(item.info.willing);
        const credit = getCreditGrade(item.info.rate);
        const rate = item.lenderInterestRate || item.info.rate;

        return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('InvestDetail', { loan: item })}>
                <GlassCard blur={GlassTokens.blur.medium} style={styles.loanCard}>
                    <View style={styles.cardHeader}>
                        <View style={styles.headerLeft}>
                            <View style={[styles.iconBox, { backgroundColor: `${purpose.color}20` }]}>
                                <MaterialCommunityIcons name={purpose.icon} size={20} color={purpose.color} />
                            </View>
                            <View>
                                <Text style={styles.loanCode}>LOAN #{item.contractId.slice(-4)}</Text>
                                <Text style={styles.loanPurpose}>{purpose.label}</Text>
                            </View>
                        </View>
                        <View style={[styles.gradeBadge, { borderColor: credit.color }]}>
                            <Text style={[styles.gradeText, { color: credit.color }]}>{credit.grade}</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.statsContainer}>
                        <View style={styles.statCol}>
                            <Text style={styles.statLabel}>Lãi suất / năm</Text>
                            <Text style={[styles.statValueBig, { color: GlassTokens.colors.success }]}>{rate}%</Text>
                        </View>
                        <View style={[styles.statCol, { alignItems: 'center' }]}>
                            <Text style={styles.statLabel}>Kỳ hạn</Text>
                            <Text style={styles.statValue}>{item.info.periodMonth}T</Text>
                        </View>
                        <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
                            <Text style={styles.statLabel}>Cần huy động</Text>
                            <Text style={styles.statValue}>{formatCurrency(item.availableAmount)}₫</Text>
                        </View>
                    </View>
                    <View style={styles.progressSection}>
                        <View style={styles.progressRow}>
                            <Text style={styles.progressText}>Đã gọi: {item.fundedPercentage}%</Text>
                            <Text style={styles.progressText}>{item.availableNotes} notes còn lại</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <LinearGradient
                                colors={[GlassTokens.colors.primary, GlassTokens.colors.info]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.progressBarFill, { width: `${item.fundedPercentage}%` }]}
                            />
                        </View>
                    </View>
                </GlassCard>
            </TouchableOpacity>
        );
    };

    const renderHeader = () => {
        // Fallback with 2+ points for valid line chart
        const displayData = chartData.length > 1 ? chartData : [
            { value: 0, label: 'Start' },
            { value: balance?.availableBalance || 0, label: 'Now' }
        ];

        return (
            <View style={styles.header}>
                {/* Greeting & Balance */}
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.welcomeLabel}>Tổng danh mục</Text>
                        <Text style={styles.balanceBig}>{balance ? formatCurrency(balance.availableBalance) : '---'}₫</Text>
                        <View style={styles.growthRow}>
                            <MaterialCommunityIcons name="trending-up" size={16} color={GlassTokens.colors.success} />
                            <Text style={styles.growthText}>
                                +{chartSummary ? formatCurrency(chartSummary.totalProfit) : '---'}₫ ({chartRange})
                            </Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            style={styles.historyCircle}
                            onPress={() => navigation.navigate('MyInvestments')}
                            activeOpacity={0.7}
                        >
                            <MaterialCommunityIcons name="history" size={22} color="white" />
                        </TouchableOpacity>
                        <Avatar.Image size={44} source={{ uri: 'https://i.pravatar.cc/150' }} />
                    </View>
                </View>

                {/* Styled Chart Card */}
                <GlassCard variant="primary" blur={GlassTokens.blur.medium} style={styles.chartCard}>
                    <View style={styles.chartHeaderContainer}>
                        <Text style={styles.chartLabel}>Hiệu quả đầu tư</Text>
                        <View style={styles.timeRangeContainer}>
                            {['1W', '1M', '3M', '1Y'].map((r) => (
                                <TouchableOpacity
                                    key={r}
                                    style={[styles.rangeBtn, chartRange === r && styles.rangeBtnActive]}
                                    onPress={() => setChartRange(r as any)}
                                >
                                    <Text style={[styles.rangeText, chartRange === r && { color: 'white' }]}>{r}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Chart with Style & Data */}
                    <View style={{ marginLeft: -10, marginTop: 40 }}>
                        {chartLoading ? (
                            <View style={{ height: 160, justifyContent: 'center', alignItems: 'center' }}>
                                <ActivityIndicator size="small" color={GlassTokens.colors.white} />
                            </View>
                        ) : (
                            <LineChart
                                data={displayData}
                                areaChart
                                isAnimated
                                animationDuration={1200}
                                width={SCREEN_WIDTH - 110}
                                adjustToWidth
                                height={160}
                                color={GlassTokens.colors.primary}
                                startFillColor={GlassTokens.colors.primary}
                                endFillColor="rgba(10, 132, 255, 0.0)"
                                startOpacity={0.3}
                                endOpacity={0.0}
                                thickness={3}
                                initialSpacing={20}
                                endSpacing={20}
                                noOfSections={3}
                                yAxisThickness={0}
                                xAxisThickness={0}
                                rulesColor="rgba(255,255,255,0.1)"
                                rulesType="solid"
                                yAxisTextStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                                formatYLabel={(val) => {
                                    const num = Number(val);
                                    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
                                    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
                                    return val;
                                }}
                                hideRules={false}
                                hideYAxisText={false}
                                yAxisLabelWidth={40}

                                // Interactive Pointer Styling
                                pointerConfig={{
                                    pointerStripHeight: 160,
                                    pointerStripColor: 'rgba(255,255,255,0.3)',
                                    pointerStripWidth: 2,
                                    pointerColor: 'white', // Glowing white dot
                                    radius: 6,
                                    pointerLabelWidth: 120,
                                    pointerLabelHeight: 90,
                                    activatePointersOnLongPress: false,
                                    autoAdjustPointerLabelPosition: true,
                                    pointerComponent: () => (
                                        <View style={{
                                            height: 12, width: 12, borderRadius: 6, backgroundColor: 'white',
                                            shadowColor: 'white', shadowOpacity: 0.8, shadowRadius: 10, elevation: 5,
                                            borderWidth: 2, borderColor: GlassTokens.colors.primary
                                        }} />
                                    ),
                                    pointerLabelComponent: (items: any) => {
                                        return (
                                            <View style={styles.glassTooltip}>
                                                <Text style={styles.tooltipLabel}>{items[0]?.label || 'Date'}</Text>
                                                <Text style={styles.tooltipValue}>{formatCurrency(items[0]?.value || 0)}₫</Text>
                                            </View>
                                        );
                                    },
                                }}
                            />
                        )}
                    </View>

                    {/* Quick Stats Footer */}
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
                    <Text style={styles.sectionTitle}>Cơ hội đầu tư mới</Text>
                    <View style={styles.countBadge}>
                        <Text style={styles.countText}>{loans.length}</Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <GradientBackground>
            <FlatList
                data={loans}
                keyExtractor={(item) => item._id}
                renderItem={renderLoanItem}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GlassTokens.colors.primary} />
                }
                onEndReached={loadMore}
            />
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    listContent: { paddingBottom: 100 },
    header: { paddingTop: 60, paddingHorizontal: UnifiedSpacing.lg },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    historyCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    welcomeLabel: { fontSize: 14, color: GlassTokens.colors.textSecondary, fontFamily: 'Poppins_400Regular' },
    balanceBig: { fontSize: 32, fontWeight: '700', color: 'white', fontFamily: 'Poppins_700Bold' },
    growthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    growthText: { fontSize: 13, color: GlassTokens.colors.success, fontFamily: 'Poppins_500Medium' },

    // Chart Card
    chartCard: { marginBottom: 32, paddingBottom: 0 },
    chartHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, zIndex: 10 },
    chartLabel: { fontSize: 14, color: 'white', fontWeight: '600' },
    timeRangeContainer: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 2 },
    rangeBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    rangeBtnActive: { backgroundColor: GlassTokens.colors.primary },
    rangeText: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

    // Glass Tooltip Style
    glassTooltip: {
        width: 120,
        padding: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(30, 30, 30, 0.85)', // Semi-transparent dark
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -50,
        marginTop: -40,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    tooltipLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 2 },
    tooltipValue: { color: 'white', fontSize: 14, fontWeight: '700' },

    quickStatsRow: { flexDirection: 'row', marginTop: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
    quickStatLabel: { fontSize: 12, color: GlassTokens.colors.textSecondary, marginBottom: 2 },
    quickStatValue: { fontSize: 15, fontWeight: '600', color: 'white' },
    quickDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 20 },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: 'white' },
    countBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    countText: { fontSize: 12, color: 'white', fontWeight: '700' },

    // Loan Card
    loanCard: { marginBottom: 12, padding: 0 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    headerLeft: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    loanCode: { fontSize: 12, color: GlassTokens.colors.textSecondary },
    loanPurpose: { fontSize: 15, fontWeight: '600', color: 'white' },
    gradeBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    gradeText: { fontSize: 12, fontWeight: '700' },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
    statCol: { flex: 1 },
    statLabel: { fontSize: 11, color: GlassTokens.colors.textSecondary, marginBottom: 4 },
    statValue: { fontSize: 14, fontWeight: '600', color: 'white' },
    statValueBig: { fontSize: 20, fontWeight: '700' },
    progressSection: { paddingHorizontal: 16, paddingBottom: 16 },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressText: { fontSize: 11, color: GlassTokens.colors.textSecondary },
    progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3 },
});
