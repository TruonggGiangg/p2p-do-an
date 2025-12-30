import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Dimensions,
    ScrollView,
} from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { GradientBackground, GlassCard, GlassTokens, SectionTitle } from '../../components/glass';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Format number with commas
const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Format amount -> "5,000,000"
const formatAmount = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return formatNumber(Math.floor(num));
};

const getStatusColor = (status: LoanStatus) => {
    switch (status) {
        case 'approved':
        case 'success':
        case 'done':
        case 'clean':
            return GlassTokens.colors.success; // Bright Green
        case 'waiting':
        case 'pending':
            return GlassTokens.colors.warning; // Bright Yellow
        case 'active':
        case 'on_going':
        case 'disbursed':
            return GlassTokens.colors.primary; // Bright Blue
        case 'overdue':
        case 'fail':
        case 'rejected':
            return GlassTokens.colors.error; // Bright Red
        default:
            return GlassTokens.colors.textMuted; // Grey
    }
};

const getStatusLabel = (status: LoanStatus) => {
    const labels: Record<string, string> = {
        waiting: 'Chờ đầu tư',
        pending: 'Chờ duyệt',
        approved: 'Đã duyệt',
        success: 'Đã giải ngân',
        active: 'Đang vay',
        on_going: 'Đang vay',
        disbursed: 'Đã giải ngân',
        done: 'Hoàn thành',
        closed: 'Đã đóng',
        overdue: 'Quá hạn',
        fail: 'Thất bại',
        rejected: 'Từ chối',
        withdrawn: 'Đã rút',
    };
    return labels[status] || status;
};

interface Props {
    navigation: any;
}

export default function LoanListScreen({ navigation }: Props) {
    const { user } = useAuth();
    const [loans, setLoans] = useState<LoanContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ totalActive: 0, totalLoans: 0 });

    const fetchLoans = useCallback(async () => {
        try {
            setLoading(true);
            const data = await loanApi.getMyLoans();
            setLoans(data);

            const activeLoans = data.filter(l => ['active', 'disbursed', 'overdue', 'on_going', 'success'].includes(l.status));
            setStats({ totalActive: activeLoans.length, totalLoans: data.length });
        } catch (error) {
            console.error('Failed to fetch loans:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchLoans(); }, [fetchLoans]);
    useFocusEffect(useCallback(() => { fetchLoans(); }, [fetchLoans]));

    const renderLoanItem = ({ item }: { item: LoanContract }) => {
        const statusColor = getStatusColor(item.status);
        const amount = formatAmount(item.info.capital);
        const date = new Date(item.createdAt || Date.now()).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('LoanDetail', { loanId: item.contractId })}
            >
                <GlassCard blur={GlassTokens.blur.light} style={styles.loanCard}>
                    <View style={styles.itemWrapper}>
                        {/* Icon Grid */}
                        <View style={[styles.iconContainer, { backgroundColor: `${statusColor}20` }]}>
                            <MaterialCommunityIcons name="file-document-outline" size={24} color={statusColor} />
                        </View>

                        {/* Info */}
                        <View style={styles.itemContent}>
                            <Text style={styles.itemTitle}>Khoản vay #{item.contractId.slice(-4)}</Text>
                            <Text style={[styles.itemSubtitle, { color: statusColor }]}>
                                {getStatusLabel(item.status)} • {item.info.periodMonth} tháng
                            </Text>
                        </View>

                        {/* Amount */}
                        <View style={styles.itemRight}>
                            <Text style={styles.itemAmount}>{amount}₫</Text>
                            <Text style={styles.itemDate}>{date}</Text>
                        </View>
                    </View>
                </GlassCard>
            </TouchableOpacity>
        );
    };

    return (
        <GradientBackground>
            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={fetchLoans}
                        tintColor={GlassTokens.colors.primary}
                        colors={[GlassTokens.colors.primary]}
                    />
                }
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                            <Text style={styles.greeting}>Xin chào,</Text>
                            <Text style={styles.username}>{user?.name || 'Borrower'}</Text>
                        </View>
                        <Avatar.Image
                            size={48}
                            source={{ uri: 'https://i.pravatar.cc/150' }}
                            style={{ backgroundColor: 'transparent' }}
                        />
                    </View>

                    {/* Stats Row */}
                    <GlassCard blur={GlassTokens.blur.medium} style={styles.statsCard}>
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{stats.totalLoans}</Text>
                                <Text style={styles.statLabel}>Tổng khoản vay</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: GlassTokens.colors.primary }]}>{stats.totalActive}</Text>
                                <Text style={styles.statLabel}>Đang hoạt động</Text>
                            </View>
                        </View>
                    </GlassCard>
                </View>

                {/* Quick Actions (Circular) */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('LoanCreate')}>
                        <LinearGradient
                            colors={GlassTokens.gradients.primary}
                            style={styles.actionCircle}
                        >
                            <MaterialCommunityIcons name="plus" size={28} color="white" />
                        </LinearGradient>
                        <Text style={styles.actionText}>Tạo vay</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn}>
                        <LinearGradient
                            colors={GlassTokens.gradients.success}
                            style={styles.actionCircle}
                        >
                            <MaterialCommunityIcons name="wallet" size={28} color="white" />
                        </LinearGradient>
                        <Text style={styles.actionText}>Nạp tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('TransactionHistory')}>
                        <LinearGradient
                            colors={GlassTokens.gradients.error}
                            style={styles.actionCircle}
                        >
                            <MaterialCommunityIcons name="history" size={28} color="white" />
                        </LinearGradient>
                        <Text style={styles.actionText}>Lịch sử</Text>
                    </TouchableOpacity>
                </View>

                {/* Recent Loans List */}
                <View style={styles.listContainer}>
                    <View style={styles.listHeader}>
                        <SectionTitle style={styles.sectionTitle}>Khoản vay gần đây</SectionTitle>
                        <TouchableOpacity onPress={() => navigation.navigate('LoanListAll')}>
                            <Text style={styles.seeAll}>Tất cả</Text>
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={loans.slice(0, 5)}
                        renderItem={renderLoanItem}
                        keyExtractor={(item) => item.contractId}
                        ListEmptyComponent={
                            <GlassCard blur={GlassTokens.blur.light} style={styles.emptyCard}>
                                <MaterialCommunityIcons name="file-document-outline" size={48} color={GlassTokens.colors.textMuted} />
                                <Text style={styles.emptyText}>Chưa có khoản vay nào</Text>
                            </GlassCard>
                        }
                        scrollEnabled={false}
                        contentContainerStyle={styles.listContent}
                    />
                </View>
            </ScrollView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60,
        paddingHorizontal: GlassTokens.spacing.md,
        paddingBottom: GlassTokens.spacing.lg,
    },
    greeting: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
        letterSpacing: 0.1,
    },
    username: {
        fontSize: 28,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.5,
    },
    statsCard: {
        marginTop: GlassTokens.spacing.lg,
        padding: 0, 
    },
    statsRow: {
        flexDirection: 'row',
        padding: GlassTokens.spacing.md,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.3,
    },
    statLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginTop: 4,
        letterSpacing: 0.1,
        fontFamily: 'Poppins_400Regular',
    },
    statDivider: {
        width: 1,
        height: '80%',
        backgroundColor: GlassTokens.colors.borderGlass,
        alignSelf: 'center',
    },

    // Quick Actions
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: GlassTokens.spacing.md,
        marginBottom: GlassTokens.spacing.xl,
    },
    actionBtn: {
        alignItems: 'center',
        gap: GlassTokens.spacing.sm,
    },
    actionCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: GlassTokens.colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: GlassTokens.colors.borderGlass,
    },
    actionText: {
        fontSize: 13,
        color: GlassTokens.colors.textPrimary,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.1,
    },

    // List Container
    listContainer: {
        paddingHorizontal: GlassTokens.spacing.md,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: GlassTokens.spacing.md,
    },
    sectionTitle: {
        marginBottom: 0,
        fontSize: 18,
    },
    seeAll: {
        fontSize: 14,
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_500Medium',
    },
    listContent: {
        gap: 12,
    },

    // Loan Card
    loanCard: {
        marginBottom: 12,
        padding: 0,
    },
    itemWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: GlassTokens.spacing.md,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: GlassTokens.spacing.md,
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: GlassTokens.colors.textPrimary,
        marginBottom: 4,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: -0.2,
    },
    itemSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    itemRight: {
        alignItems: 'flex-end',
    },
    itemAmount: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginBottom: 4,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.2,
    },
    itemDate: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },

    emptyCard: {
        alignItems: 'center',
        padding: GlassTokens.spacing.xl,
    },
    emptyText: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        marginTop: GlassTokens.spacing.md,
        fontFamily: 'Poppins_400Regular',
    },
});
