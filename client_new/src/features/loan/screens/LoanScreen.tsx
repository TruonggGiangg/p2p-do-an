import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, FintechPullToRefresh, VentoUltimateLoading } from '../../../components';
import { loanService, LoanProduct, LoanHistoryItem } from '../services/loan.service';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

type LoanScreenNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

// Helper functions for recent loans section
const getStatusInfo = (loan: LoanHistoryItem) => {
    const sf = loan.statusInfo;

    if (sf) {
        if (sf.active) return { text: 'Đang vay', color: '#3B82F6' };
        if (sf.closedObligationsMet) return { text: 'Đã tất toán', color: '#10B981' };
        if (sf.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B' };
        if (sf.waitingForDisbursal) return { text: 'Chờ giải ngân', color: '#8B5CF6' };
        if (sf.closed) return { text: 'Đã đóng', color: '#6B7280' };
        if (sf.rejected || sf.withdrawnByClient) return { text: 'Thất bại', color: '#EF4444' };
    }
    if (loan.status === 'clean' || loan.status === 'closed') return { text: 'Đã tất toán', color: '#10B981' };
    if (loan.status === 'success' || loan.status === 'disbursed') return { text: 'Đang vay', color: '#3B82F6' };
    if (loan.status === 'waiting' || loan.status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B' };
    if (loan.status === 'approved') return { text: 'Đã duyệt', color: '#8B5CF6' };
    if (loan.status === 'fail' || loan.status === 'rejected') return { text: 'Thất bại', color: '#EF4444' };
    return { text: loan.status || 'N/A', color: '#6B7280' };
};

const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function LoanScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<LoanScreenNav>();
    const [products, setProducts] = useState<LoanProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [recentLoans, setRecentLoans] = useState<LoanHistoryItem[]>([]);
    const [loadingLoans, setLoadingLoans] = useState(false);

    const fetchProducts = async () => {
        const minDelay = new Promise(resolve => setTimeout(resolve, 300));
        try {
            const [data] = await Promise.all([
                loanService.getLoanProducts(),
                minDelay
            ]);
            setProducts(data);
        } catch (error) {
            console.error('Failed to fetch loan products:', error);
            Alert.alert('Lỗi', 'Không thể tải danh sách sản phẩm vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchRecentLoans = async () => {
        try {
            setLoadingLoans(true);
            const result = await loanService.getApplications({ page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' });
            setRecentLoans(result.loans || []);
        } catch {
            // silent fail
        } finally {
            setLoadingLoans(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchProducts(), fetchRecentLoans()]);
    }, []);

    useEffect(() => {
        fetchProducts();
        fetchRecentLoans();
    }, []);

    // Refresh recent loans when screen comes into focus (e.g. after creating a loan)
    useFocusEffect(useCallback(() => {
        fetchRecentLoans();
    }, []));

    const renderProductItem = ({ item }: { item: LoanProduct }) => (
        <TouchableOpacity
            style={styles.productItem}
            onPress={() => navigation.navigate('LoanProductDetail', { product: item })}
            activeOpacity={0.9}
        >
            <CommonCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '18' }]}>
                        <MaterialCommunityIcons name="currency-usd" size={24} color={theme.colors.primary} />
                    </View>
                    <View style={styles.headerText}>
                        <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{item.name}</Text>
                        <Text style={[styles.productShortName, { color: theme.colors.textSecondary }]}>{item.shortName}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textDim} />
                </View>

                <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
                    <View style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.colors.textDim }]}>Lãi suất</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.primary }]}>
                            {item.interestRatePerPeriod}% / {item.interestRateFrequencyType?.value?.toLowerCase()?.includes('year') ? 'năm' : 'tháng'}
                        </Text>
                    </View>
                    <View style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.colors.textDim }]}>Kiểu lãi</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{item.interestType.value}</Text>
                    </View>
                </View>
            </CommonCard>
        </TouchableOpacity>
    );

    const navToHistory = () => (navigation as any).navigate('LoanHistory');

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader mode="dashboard" title="Vay vốn" />

            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
                primaryColor={theme.colors.primary}
                glowColor={theme.colors.primaryLight}
            >
                <View style={styles.headerSection}>
                    <View style={styles.headerRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Gói vay ưu đãi</Text>
                            <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Chọn gói vay phù hợp với nhu cầu của bạn</Text>
                        </View>
                        <TouchableOpacity style={[styles.historyLink, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary + '40', flexShrink: 0 }]} onPress={navToHistory}>
                            <MaterialCommunityIcons name="history" size={18} color={theme.colors.primary} />
                            <Text style={[styles.historyLinkText, { color: theme.colors.primary }]}>Lịch sử</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <VentoUltimateLoading size={200} />
                    </View>
                ) : (
                    <FlatList
                        data={products}
                        renderItem={renderProductItem}
                        keyExtractor={(item) => item.id.toString()}
                        scrollEnabled={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="briefcase-off-outline" size={64} color={theme.colors.textDim} />
                                <Text style={[styles.emptyText, { color: theme.colors.textDim }]}>Hiện chưa có gói vay nào khả dụng</Text>
                            </View>
                        }
                    />
                )}

                {/* ── Khoản vay gần đây ── */}
                {recentLoans.length > 0 && (
                    <View style={styles.recentSection}>
                        <View style={styles.recentHeader}>
                            <Text style={[styles.recentTitle, { color: theme.colors.textPrimary }]}>Khoản vay gần đây</Text>
                            <TouchableOpacity onPress={navToHistory}>
                                <Text style={[styles.recentSeeAll, { color: theme.colors.primary }]}>Xem tất cả</Text>
                            </TouchableOpacity>
                        </View>
                        {recentLoans.map((loan) => {
                            const status = getStatusInfo(loan);
                            return (
                                <TouchableOpacity
                                    key={loan.id}
                                    style={[styles.recentCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '40' }]}
                                    activeOpacity={0.8}
                                    onPress={() => (navigation as any).navigate('LoanDetail', { loan })}
                                >
                                    <View style={[styles.recentIcon, { backgroundColor: status.color + '15' }]}>
                                        <MaterialCommunityIcons name="cash-multiple" size={18} color={status.color} />
                                    </View>
                                    <View style={styles.recentInfo}>
                                        <Text style={[styles.recentName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                            {loan.willing || loan.productName || 'Khoản vay'}
                                        </Text>
                                        <Text style={[styles.recentDate, { color: theme.colors.textDim }]}>
                                            {formatDateShort(loan.createdAt)} • {loan.periodMonth || 0} tháng
                                        </Text>
                                    </View>
                                    <View style={styles.recentRight}>
                                        <Text style={[styles.recentAmount, { color: theme.colors.textPrimary }]}>
                                            {formatMoney(loan.capital)} đ
                                        </Text>
                                        <View style={[styles.recentStatus, { backgroundColor: status.color + '15' }]}>
                                            <Text style={[styles.recentStatusText, { color: status.color }]}>{status.text}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
                {loadingLoans && recentLoans.length === 0 && (
                    <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 16 }} />
                )}

                <View style={{ height: 40 }} />
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },
    headerSection: { marginTop: 24, marginBottom: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    sectionSubtitle: { fontSize: 14 },
    loadingContainer: { marginTop: 100, alignItems: 'center' },
    productItem: { marginBottom: 16 },
    card: { padding: 16 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    iconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerText: { flex: 1, marginLeft: 12 },
    productName: { fontSize: 16, fontWeight: '600' },
    productShortName: { fontSize: 13, marginTop: 2 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, paddingTop: 12 },
    infoBlock: { gap: 4 },
    infoLabel: { fontSize: 12 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    emptyContainer: { marginTop: 80, alignItems: 'center', gap: 16 },
    emptyText: { fontSize: 16, textAlign: 'center' },
    historyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
    historyLinkText: { fontSize: 13, fontWeight: '600' },

    // Recent loans
    recentSection: { marginTop: 24 },
    recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    recentTitle: { fontSize: 17, fontWeight: '700' },
    recentSeeAll: { fontSize: 13, fontWeight: '600' },
    recentCard: {
        flexDirection: 'row', alignItems: 'center', padding: 14,
        borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 12,
    },
    recentIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    recentInfo: { flex: 1 },
    recentName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    recentDate: { fontSize: 11 },
    recentRight: { alignItems: 'flex-end', gap: 4 },
    recentAmount: { fontSize: 14, fontWeight: '700' },
    recentStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    recentStatusText: { fontSize: 10, fontWeight: '700' },
});
