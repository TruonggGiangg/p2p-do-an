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
            const data = await loanApi.getMyLoans();
            // Sort by createdDate descending
            const sortedData = data.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

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
                <View style={[styles.iconContainer, { backgroundColor: `${statusColor}15` }]}>
                    <MaterialCommunityIcons name="file-document-outline" size={22} color={statusColor} />
                </View>

                <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>#{item.contractId.slice(-6)}</Text>
                    <Text style={[styles.itemSubtitle, { color: statusColor }]}>
                        {getStatusLabel(item.status)}
                    </Text>
                </View>

                <View style={styles.itemRight}>
                    <Text style={styles.itemAmount}>{amount}₫</Text>
                    <Text style={styles.itemDate}>{date}</Text>
                </View>

                <MaterialCommunityIcons name="chevron-right" size={20} color={DarkColors.textMuted} />
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
        paddingHorizontal: 20,
        paddingBottom: 80, // Add space for pagination footer
    },
    // Loan Item
    itemWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.5,
    },
    itemSubtitle: {
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
    itemRight: {
        alignItems: 'flex-end',
        marginRight: 8,
    },
    itemAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
        fontFamily: 'Poppins_700Bold',
    },
    itemDate: {
        fontSize: 11,
        color: DarkColors.textSecondary,
        marginTop: 2,
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
