import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';

import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';
import { DarkColors } from '../../theme';
import { ScreenContainer, PageHeader } from '../../components/common';

// Helper to get status color (consistent with LoanListScreen)
const getStatusColor = (status: LoanStatus) => {
    switch (status) {
        case 'approved':
        case 'success':
        case 'done':
        case 'clean':
            return '#10B981'; // Emerald 500
        case 'waiting':
        case 'pending':
            return '#F59E0B'; // Amber 500
        case 'active':
        case 'on_going':
        case 'disbursed':
            return '#3B82F6'; // Blue 500
        case 'overdue':
        case 'fail':
        case 'rejected':
            return '#EF4444'; // Red 500
        default:
            return '#9CA3AF'; // Gray 400
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

// Format amount -> "5,000,000"
const formatAmount = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

interface Props {
    navigation: any;
}

const ITEMS_PER_PAGE = 10; // Slightly smaller for manual pagination

export default function LoanListAllScreen({ navigation }: Props) {
    const [allLoans, setAllLoans] = useState<LoanContract[]>([]);
    const [displayLoans, setDisplayLoans] = useState<LoanContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchLoans = useCallback(async () => {
        try {
            setLoading(true);
            const result = await loanApi.getMyLoans(1, 1000); // Fetch a large number for local list
            const loansArray = result.data || [];

            // Sort by createdDate descending
            const sortedData = [...loansArray].sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

            setAllLoans(sortedData);
            setTotalPages(Math.ceil(sortedData.length / ITEMS_PER_PAGE) || 1);
            setPage(1); // Reset to page 1 on refresh

        } catch (error) {
            console.error('Failed to fetch loans:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchLoans(); }, [fetchLoans]);

    // Update display list when page or allLoans changes
    useEffect(() => {
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        setDisplayLoans(allLoans.slice(startIndex, endIndex));
    }, [page, allLoans]);

    const handleRefresh = () => { setRefreshing(true); fetchLoans(); };

    const handlePrevPage = () => {
        if (page > 1) setPage(p => p - 1);
    };

    const handleNextPage = () => {
        if (page < totalPages) setPage(p => p + 1);
    };

    const renderLoanItem = ({ item }: { item: LoanContract }) => {
        const statusColor = getStatusColor(item.status);
        const amount = formatAmount(item.info.capital);
        const date = new Date(item.createdAt || Date.now()).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('LoanDetail', { loanId: item.contractId })}
                style={styles.itemWrapper}
            >
                {/* Header: Title + Status Badge */}
                <View style={styles.itemHeader}>
                    <Text style={styles.itemTitle}>#{item.contractId.slice(-6)}</Text>
                    <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: `${statusColor}15` }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: statusColor }]}>
                            {getStatusLabel(item.status)}
                        </Text>
                    </View>
                </View>

                {/* Amount Row */}
                <View style={styles.amountRow}>
                    <View style={[styles.iconContainer, { backgroundColor: `${statusColor}15` }]}>
                        <MaterialCommunityIcons name="file-document-outline" size={20} color={statusColor} />
                    </View>
                    <Text style={styles.itemAmount}>{amount}₫</Text>
                </View>

                {/* Footer: Date */}
                <View style={styles.itemFooter}>
                    <Text style={styles.itemDate}>Ngày tạo: {date}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={DarkColors.textMuted} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <ScreenContainer scrollable={false}>
            <PageHeader
                title="Lịch sử khoản vay"
                showBack
                onBack={() => navigation.goBack()}
            />

            <View style={styles.listContainer}>
                <FlatList
                    data={displayLoans}
                    renderItem={renderLoanItem}
                    keyExtractor={(item) => item.contractId}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={DarkColors.primary}
                        />
                    }
                    ListEmptyComponent={
                        !loading ? (
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="file-search-outline" size={64} color={DarkColors.textMuted} />
                                <Text style={styles.emptyText}>Chưa có khoản vay nào</Text>
                            </View>
                        ) : null
                    }
                />

                {/* Manual Pagination Footer - Fixed at bottom */}
                {!loading && allLoans.length > 0 && (
                    <View style={styles.paginationContainer}>
                        <TouchableOpacity
                            style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                            onPress={handlePrevPage}
                            disabled={page === 1}
                        >
                            <MaterialCommunityIcons
                                name="chevron-left"
                                size={24}
                                color={page === 1 ? DarkColors.textMuted : '#FFFFFF'}
                            />
                        </TouchableOpacity>

                        <Text style={styles.pageText}>
                            Trang {page} / {totalPages}
                        </Text>

                        <TouchableOpacity
                            style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
                            onPress={handleNextPage}
                            disabled={page === totalPages}
                        >
                            <MaterialCommunityIcons
                                name="chevron-right"
                                size={24}
                                color={page === totalPages ? DarkColors.textMuted : '#FFFFFF'}
                            />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    listContainer: {
        flex: 1,
        marginTop: 10,
    },
    listContent: {
        paddingHorizontal: 16, // Reduced from 20 to match LoanListScreen
        paddingBottom: 80, // Add space for pagination footer
    },
    // Loan Item
    itemWrapper: {
        padding: 16, // Increased from 12
        marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12, // Increased from 8
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.5,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        gap: 4,
    },
    statusDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '700',
    },
    
    // Amount Row
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12, // Increased from 8
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    itemAmount: {
        fontSize: 20, // Prominent amount
        fontWeight: '700',
        color: '#FFFFFF',
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.5,
    },

    // Footer
    itemFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemDate: {
        fontSize: 11,
        color: DarkColors.textSecondary,
    },

    // Empty
    emptyContainer: {
        paddingTop: 100,
        alignItems: 'center',
        gap: 16,
    },
    emptyText: {
        color: DarkColors.textSecondary,
        fontSize: 16,
    },
    // Pagination
    paginationContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 16,
        backgroundColor: 'rgba(10, 14, 39, 0.95)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        gap: 20,
    },
    pageBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pageBtnDisabled: {
        opacity: 0.3,
        backgroundColor: 'transparent',
    },
    pageText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        minWidth: 80,
        textAlign: 'center',
    }
});