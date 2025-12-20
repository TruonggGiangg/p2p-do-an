import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    StatusBar,
    Dimensions,
} from 'react-native';
import { Text, Avatar, Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { DarkColors, DarkStatusColors, DarkStyling } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Format number with commas
const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Format amount with split decimals (like reference: $965.44)
const formatAmountSplit = (num: number | undefined | null): { main: string; decimal: string } => {
    if (num === undefined || num === null) return { main: '0', decimal: '00' };
    const formatted = formatNumber(Math.floor(num));
    return { main: formatted, decimal: '₫' };
};

// Format date
const formatDateDisplay = (dateStr: string | undefined): string => {
    if (!dateStr) return '--/--/----';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '--/--/----';
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    } catch (e) {
        return '--/--/----';
    }
};

const getStatusInfo = (status: LoanStatus) => {
    const statusKey = status as keyof typeof DarkStatusColors;
    const colors = DarkStatusColors[statusKey] || { color: DarkColors.textSecondary, bg: 'rgba(139, 141, 151, 0.15)' };

    const labels: Record<string, { label: string; icon: string }> = {
        waiting: { label: 'Chờ đầu tư', icon: 'clock-outline' },
        pending: { label: 'Chờ duyệt', icon: 'clock-outline' },
        approved: { label: 'Đã duyệt', icon: 'check-decagram' },
        success: { label: 'Đã giải ngân', icon: 'check-circle-outline' },
        active: { label: 'Đang hoạt động', icon: 'trending-up' },
        on_going: { label: 'Đang hoạt động', icon: 'trending-up' },
        done: { label: 'Đã tất toán', icon: 'check-all' },
        closed: { label: 'Đã tất toán', icon: 'check-all' },
        clean: { label: 'Đã tất toán', icon: 'check-all' },
        overdue: { label: 'Quá hạn', icon: 'alert-circle-outline' },
        fail: { label: 'Từ chối', icon: 'close-circle-outline' },
        rejected: { label: 'Từ chối', icon: 'close-circle-outline' },
        withdrawn: { label: 'Đã rút', icon: 'cancel' },
    };

    const info = labels[status] || { label: 'Không xác định', icon: 'help-circle-outline' };
    return { ...info, ...colors };
};

interface Props {
    navigation: any;
}

export default function LoanListScreen({ navigation }: Props) {
    const { user } = useAuth();
    const [loans, setLoans] = useState<LoanContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ totalActive: 0, totalDebt: 0, totalLoans: 0 });
    const [walletBalance, setWalletBalance] = useState({ balance: 0, availableBalance: 0 });

    const fetchLoans = useCallback(async () => {
        try {
            setLoading(true);

            // Fetch loans and wallet balance in parallel
            const [data, balanceData] = await Promise.all([
                loanApi.getMyLoans(),
                loanApi.getWalletBalance(),
            ]);

            setLoans(data);
            setWalletBalance(balanceData);

            const activeLoans = data.filter(l => ['active', 'disbursed', 'overdue', 'on_going', 'success'].includes(l.status));
            const totalDebt = activeLoans.reduce((sum, l) => sum + (l.info.entirelyPay || 0), 0);
            setStats({ totalActive: activeLoans.length, totalDebt, totalLoans: data.length });
        } catch (error) {
            console.error('Failed to fetch loans:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchLoans(); }, [fetchLoans]);
    useFocusEffect(useCallback(() => { fetchLoans(); }, [fetchLoans]));

    const handleRefresh = () => { setRefreshing(true); fetchLoans(); };

    const renderLoanItem = ({ item, index }: { item: LoanContract; index: number }) => {
        const status = getStatusInfo(item.status);
        const amount = formatAmountSplit(item.info.capital);

        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('LoanDetail', { loanId: item.contractId })}
                style={styles.cardWrapper}
            >
                <View style={styles.card}>
                    {/* Left side: Icon + Info */}
                    <View style={styles.cardLeft}>
                        <View style={[styles.iconCircle, { backgroundColor: status.bg }]}>
                            <MaterialCommunityIcons name={status.icon} size={22} color={status.color} />
                        </View>
                        <View style={styles.cardInfo}>
                            <Text style={styles.cardTitle}>Khoản vay #{index + 1}</Text>
                            <Text style={styles.cardSubtitle}>{item.info.periodMonth} tháng • {item.info.rate}%</Text>
                        </View>
                    </View>

                    {/* Right side: Amount */}
                    <View style={styles.cardRight}>
                        <Text style={[styles.amountText, { color: status.color }]}>
                            {amount.main}<Text style={styles.amountCurrency}>{amount.decimal}</Text>
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const balanceFormatted = formatAmountSplit(walletBalance.balance);
    const debtFormatted = formatAmountSplit(stats.totalDebt);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />

            {/* Header with Balance Card */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.welcomeLabel}>Xin chào,</Text>
                        <Text style={styles.userName}>{user?.name || 'Borrower'}</Text>
                    </View>
                    <TouchableOpacity style={styles.avatarContainer}>
                        <Avatar.Image
                            size={48}
                            source={{ uri: 'https://i.pravatar.cc/150' }}
                        />
                    </TouchableOpacity>
                </View>

                {/* Balance Card - Glassmorphism */}
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Số dư ví</Text>
                    <View style={styles.balanceRow}>
                        <Text style={styles.balanceAmount}>
                            {balanceFormatted.main}
                            <Text style={styles.balanceDecimal}>{balanceFormatted.decimal}</Text>
                        </Text>
                    </View>

                    {/* Debt Info */}
                    {stats.totalDebt > 0 && (
                        <View style={styles.debtRow}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={DarkColors.warning} />
                            <Text style={styles.debtLabel}>  Dư nợ: </Text>
                            <Text style={styles.debtAmount}>{debtFormatted.main}{debtFormatted.decimal}</Text>
                        </View>
                    )}

                    {/* Quick Action Buttons */}
                    <View style={styles.quickActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('LoanCreate')}>
                            <View style={styles.actionIcon}>
                                <MaterialCommunityIcons name="plus" size={20} color={DarkColors.text} />
                            </View>
                            <Text style={styles.actionLabel}>Tạo vay</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn}>
                            <View style={styles.actionIcon}>
                                <MaterialCommunityIcons name="wallet-outline" size={20} color={DarkColors.text} />
                            </View>
                            <Text style={styles.actionLabel}>Thanh toán</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn}>
                            <View style={styles.actionIcon}>
                                <MaterialCommunityIcons name="history" size={20} color={DarkColors.text} />
                            </View>
                            <Text style={styles.actionLabel}>Lịch sử</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Loans Section */}
            <View style={styles.loansSection}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Khoản vay của bạn</Text>
                    <Text style={styles.loanCount}>{stats.totalLoans} khoản</Text>
                </View>

                <FlatList
                    data={loans}
                    renderItem={renderLoanItem}
                    keyExtractor={(item) => item.contractId}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={DarkColors.primary}
                            colors={[DarkColors.primary]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIcon}>
                                <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={DarkColors.textMuted} />
                            </View>
                            <Text style={styles.emptyTitle}>Chưa có khoản vay</Text>
                            <Text style={styles.emptySubtitle}>Tạo khoản vay đầu tiên của bạn ngay</Text>
                            <TouchableOpacity
                                style={styles.createBtn}
                                onPress={() => navigation.navigate('LoanCreate')}
                            >
                                <LinearGradient
                                    colors={['#4347FF', '#6366F1'] as const}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.createBtnGradient}
                                >
                                    <Text style={styles.createBtnText}>Tạo khoản vay</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    }
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    // Header
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
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
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.xl,
        padding: 24,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    balanceLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginBottom: 8,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 24,
    },
    balanceAmount: {
        fontSize: 42,
        fontWeight: '700',
        color: DarkColors.text,
    },
    balanceDecimal: {
        fontSize: 24,
        fontWeight: '500',
        color: DarkColors.textSecondary,
    },
    // Quick Actions
    quickActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    actionBtn: {
        alignItems: 'center',
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    actionLabel: {
        fontSize: 12,
        color: DarkColors.textSecondary,
    },
    // Loans Section
    loansSection: {
        flex: 1,
        paddingHorizontal: 20,
    },
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
    list: {
        paddingBottom: 100,
    },
    // Card
    cardWrapper: {
        marginBottom: 12,
    },
    card: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    cardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardInfo: {
        marginLeft: 12,
        flex: 1,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 13,
        color: DarkColors.textSecondary,
    },
    cardRight: {
        alignItems: 'flex-end',
    },
    amountText: {
        fontSize: 16,
        fontWeight: '700',
    },
    amountCurrency: {
        fontSize: 12,
        fontWeight: '500',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginTop: 4,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '500',
    },
    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: DarkColors.text,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    createBtn: {
        borderRadius: DarkStyling.borderRadius.md,
        overflow: 'hidden',
    },
    createBtnGradient: {
        paddingVertical: 14,
        paddingHorizontal: 32,
    },
    createBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.white,
    },
    // Debt info in balance card
    debtRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
    },
    debtLabel: {
        fontSize: 13,
        color: DarkColors.textSecondary,
    },
    debtAmount: {
        fontSize: 13,
        fontWeight: '600',
        color: DarkColors.warning,
    },
});
