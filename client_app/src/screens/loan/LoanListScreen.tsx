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
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { UnifiedColors, UnifiedGradients, UnifiedSpacing, UnifiedRadius, UnifiedBlur } from '../../theme';
import { GradientBackground, GlassCard, GlassTokens } from '../../components/glass';

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
            return '#4ADE80'; // Bright Green
        case 'waiting':
        case 'pending':
            return '#FACC15'; // Bright Yellow
        case 'active':
        case 'on_going':
            return '#60A5FA'; // Bright Blue
        case 'overdue':
        case 'fail':
        case 'rejected':
            return '#F87171'; // Bright Red
        default:
            return '#94A3B8'; // Grey
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

    const handleRefresh = () => { setRefreshing(true); fetchLoans(); };

    const renderLoanItem = ({ item }: { item: LoanContract }) => {
        const statusColor = getStatusColor(item.status);
        const amount = formatAmount(item.info.capital);
        const date = new Date(item.createdAt || Date.now()).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('LoanDetail', { loanId: item.contractId })}
                style={styles.itemWrapper}
            >
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
                        tintColor={UnifiedColors.primary}
                        colors={[UnifiedColors.primary]}
                    />
                }
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
                    <BlurView intensity={40} tint="dark" style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{stats.totalLoans}</Text>
                            <Text style={styles.statLabel}>Tổng khoản vay</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: '#60A5FA' }]}>{stats.totalActive}</Text>
                            <Text style={styles.statLabel}>Đang hoạt động</Text>
                        </View>
                    </BlurView>
                </View>

                {/* Quick Actions (Circular) */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('LoanCreate')}>
                        <LinearGradient
                            colors={[...UnifiedGradients.primary]}
                            style={styles.actionCircle}
                        >
                            <MaterialCommunityIcons name="plus" size={28} color="white" />
                        </LinearGradient>
                        <Text style={styles.actionText}>Tạo vay</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn}>
                        <LinearGradient
                            colors={[...UnifiedGradients.success]}
                            style={styles.actionCircle}
                        >
                            <MaterialCommunityIcons name="wallet" size={28} color="white" />
                        </LinearGradient>
                        <Text style={styles.actionText}>Nạp tiền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('TransactionHistory')}>
                        <LinearGradient
                            colors={[...UnifiedGradients.error]}
                            style={styles.actionCircle}
                        >
                            <MaterialCommunityIcons name="history" size={28} color="white" />
                        </LinearGradient>
                        <Text style={styles.actionText}>Lịch sử</Text>
                    </TouchableOpacity>
                </View>

                {/* Glass Bottom Sheet for List */}
                <BlurView intensity={30} tint="dark" style={styles.listContainer}>
                    <View style={styles.listHeader}>
                        <Text style={styles.listTitle}>Khoản vay gần đây</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('LoanListAll')}>
                            <Text style={styles.seeAll}>Tất cả</Text>
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={loans.slice(0, 5)}
                        renderItem={renderLoanItem}
                        keyExtractor={(item) => item.contractId}
                        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>Chưa có khoản vay nào</Text>
                            </View>
                        }
                        scrollEnabled={false}
                        contentContainerStyle={styles.listContent}
                    />
                </BlurView>
            </ScrollView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 40,
        paddingHorizontal: UnifiedSpacing.md,
        paddingBottom: UnifiedSpacing.lg,
    },
    greeting: {
        fontSize: 14,
        color: UnifiedColors.textSecondary,
        fontFamily: 'Poppins_400Regular',
        letterSpacing: 0.1,
    },
    username: {
        fontSize: 28,
        fontWeight: '700',
        color: UnifiedColors.textPrimary,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.5,
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: UnifiedSpacing.lg,
        backgroundColor: UnifiedColors.glassDark,
        borderRadius: UnifiedRadius.xl,
        padding: UnifiedSpacing.lg,
        borderWidth: 1.5,
        borderColor: UnifiedColors.borderGlass,
        overflow: 'hidden',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: UnifiedColors.textPrimary,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.3,
    },
    statLabel: {
        fontSize: 12,
        color: UnifiedColors.textSecondary,
        marginTop: 4,
        letterSpacing: 0.1,
    },
    statDivider: {
        width: 1,
        height: '80%',
        backgroundColor: UnifiedColors.borderGlass,
        alignSelf: 'center',
    },

    // Quick Actions
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: UnifiedSpacing.md,
        marginBottom: UnifiedSpacing.xl,
    },
    actionBtn: {
        alignItems: 'center',
        gap: UnifiedSpacing.sm,
    },
    actionCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: UnifiedColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: UnifiedColors.borderGlass,
    },
    actionText: {
        fontSize: 13,
        color: UnifiedColors.textPrimary,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.1,
    },

    // List Container (Glass Sheet)
    listContainer: {
        marginTop: UnifiedSpacing.lg,
        borderTopLeftRadius: UnifiedRadius.xxl,
        borderTopRightRadius: UnifiedRadius.xxl,
        overflow: 'hidden',
        backgroundColor: UnifiedColors.glassDark,
        minHeight: SCREEN_WIDTH * 1.2, // Ensure glass always extends to bottom
        flex: 1,
        marginBottom: 0,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: UnifiedSpacing.lg,
        paddingTop: UnifiedSpacing.lg,
        paddingBottom: UnifiedSpacing.md,
    },
    listTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: UnifiedColors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: -0.3,
    },
    seeAll: {
        fontSize: 14,
        color: UnifiedColors.primary,
        fontFamily: 'Poppins_500Medium',
    },
    listContent: {
        paddingHorizontal: UnifiedSpacing.md,
        paddingBottom: 0,
    },

    // Loan Item (Clean Row Style)
    itemWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: UnifiedSpacing.md,
    },
    itemSeparator: {
        height: 1,
        backgroundColor: UnifiedColors.borderGlassSubtle,
        marginLeft: 56,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: UnifiedSpacing.md,
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: UnifiedColors.textPrimary,
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
        color: UnifiedColors.textPrimary,
        marginBottom: 4,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.2,
    },
    itemDate: {
        fontSize: 12,
        color: UnifiedColors.textSecondary,
    },

    emptyContainer: {
        paddingTop: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: UnifiedColors.textSecondary,
        fontSize: 14,
    },
});
