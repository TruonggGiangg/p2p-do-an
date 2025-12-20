/**
 * LoanListScreen - Hiển thị danh sách khoản vay của Borrower
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';

// Format number with commas
const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Format date to DD/MM/YYYY
const formatDateDisplay = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
};

// Get status display info
const getStatusInfo = (status: LoanStatus) => {
    switch (status) {
        case 'waiting':
            return { label: 'Đang chờ đầu tư', color: '#FFC107' };
        case 'success':
            return { label: 'Đã được đầu tư', color: '#4CAF50' };
        case 'clean':
            return { label: 'Đã hoàn tất', color: '#2196F3' };
        case 'fail':
            return { label: 'Thất bại', color: '#F44336' };
        default:
            return { label: 'Không xác định', color: '#999' };
    }
};

interface Props {
    navigation: any;
}

export default function LoanListScreen({ navigation }: Props) {
    const [loans, setLoans] = useState<LoanContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch loans
    const fetchLoans = useCallback(async () => {
        try {
            setError(null);
            const data = await loanApi.getMyLoans();
            setLoans(data);
        } catch (err: any) {
            console.error('Fetch loans error:', err);
            setError(err.message || 'Không thể tải danh sách khoản vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchLoans();
    }, [fetchLoans]);

    // Refresh on focus
    useFocusEffect(
        useCallback(() => {
            fetchLoans();
        }, [fetchLoans]),
    );

    // Refresh handler
    const handleRefresh = () => {
        setRefreshing(true);
        fetchLoans();
    };

    // Navigate to create loan
    const handleCreateLoan = () => {
        navigation.navigate('LoanCreate');
    };

    // Navigate to loan detail
    const handleLoanPress = (loan: LoanContract) => {
        navigation.navigate('LoanDetail', { loanId: loan.contractId });
    };

    // Render loan item
    const renderLoanItem = ({ item }: { item: LoanContract }) => {
        const statusInfo = getStatusInfo(item.status);
        const fundingPercent = item.totalNotes > 0
            ? Math.round((item.investedNotes / item.totalNotes) * 100)
            : 0;

        return (
            <TouchableOpacity
                style={styles.loanCard}
                onPress={() => handleLoanPress(item)}
            >
                <View style={styles.cardHeader}>
                    <Text style={styles.contractId}>{item.contractId}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                        <Text style={styles.statusText}>{statusInfo.label}</Text>
                    </View>
                </View>

                <View style={styles.cardBody}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Số tiền vay:</Text>
                        <Text style={styles.infoValue}>{formatNumber(item.info.capital)} VND</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Lãi suất:</Text>
                        <Text style={styles.infoValue}>{item.info.rate}%/tháng</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Kỳ hạn:</Text>
                        <Text style={styles.infoValue}>{item.info.periodMonth} tháng</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Mục đích:</Text>
                        <Text style={styles.infoValue}>{item.info.willing}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Tổng trả:</Text>
                        <Text style={[styles.infoValue, styles.highlightValue]}>
                            {formatNumber(item.info.entirelyPay)} VND
                        </Text>
                    </View>
                </View>

                {/* Funding Progress */}
                <View style={styles.fundingProgress}>
                    <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>Tiến độ đầu tư</Text>
                        <Text style={styles.progressPercent}>{fundingPercent}%</Text>
                    </View>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${fundingPercent}%` }]} />
                    </View>
                    <Text style={styles.progressNotes}>
                        {item.investedNotes}/{item.totalNotes} phiếu
                    </Text>
                </View>

                <View style={styles.cardFooter}>
                    <Text style={styles.dateText}>
                        Tạo ngày: {formatDateDisplay(item.createdAt)}
                    </Text>
                    {item.fineractLoanId && (
                        <Text style={styles.fineractId}>Fineract: #{item.fineractLoanId}</Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    // Empty state
    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Bạn chưa có khoản vay nào</Text>
            <TouchableOpacity style={styles.createButton} onPress={handleCreateLoan}>
                <Text style={styles.createButtonText}>Tạo khoản vay đầu tiên</Text>
            </TouchableOpacity>
        </View>
    );

    // Loading state
    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
            </View>
        );
    }

    // Error state
    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={fetchLoans}>
                    <Text style={styles.retryButtonText}>Thử lại</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Khoản vay của tôi</Text>
                <TouchableOpacity style={styles.addButton} onPress={handleCreateLoan}>
                    <Text style={styles.addButtonText}>+ Tạo mới</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={loans}
                renderItem={renderLoanItem}
                keyExtractor={(item) => item._id || item.contractId}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
                ListEmptyComponent={renderEmpty}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    header: {
        backgroundColor: '#2196F3',
        padding: 20,
        paddingTop: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    addButton: {
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
    },
    addButtonText: {
        color: '#2196F3',
        fontWeight: '600',
    },
    listContent: {
        padding: 16,
    },
    loanCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    contractId: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '500',
    },
    cardBody: {
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        paddingTop: 12,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    infoLabel: {
        fontSize: 14,
        color: '#666',
    },
    infoValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    highlightValue: {
        color: '#2196F3',
        fontWeight: 'bold',
    },
    fundingProgress: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 12,
        color: '#666',
    },
    progressPercent: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#4CAF50',
    },
    progressBar: {
        height: 6,
        backgroundColor: '#e0e0e0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#4CAF50',
        borderRadius: 3,
    },
    progressNotes: {
        fontSize: 11,
        color: '#999',
        marginTop: 4,
        textAlign: 'right',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    dateText: {
        fontSize: 12,
        color: '#999',
    },
    fineractId: {
        fontSize: 12,
        color: '#999',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20,
    },
    createButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 14,
        color: '#F44336',
        marginBottom: 16,
        textAlign: 'center',
    },
    retryButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    retryButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
});
