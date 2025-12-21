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
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, Investment } from '../../services/invest';
import { DarkColors, DarkStyling } from '../../theme';

/**
 * MyInvestmentsScreen - Shows user's investment portfolio (Dark Theme)
 */
export default function MyInvestmentsScreen() {
    const navigation = useNavigation<any>();
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>(undefined);

    const loadData = useCallback(async () => {
        try {
            setRefreshing(true);
            const response = await investApi.getMyInvestments(activeTab, 1, 50);
            setInvestments(response.data);
        } catch (error: any) {
            console.error('Error loading investments:', error);
            Alert.alert('Lỗi', error.message || 'Không thể tải dữ liệu');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab]);

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    const getStatusInfo = (status: string) => {
        switch (status) {
            case 'success':
                return { color: DarkColors.success, bg: `${DarkColors.success}20`, label: 'Đang hoạt động', icon: 'play-circle' };
            case 'waiting_other':
                return { color: DarkColors.warning, bg: `${DarkColors.warning}20`, label: 'Chờ góp vốn', icon: 'clock-outline' };
            case 'waiting_transfer':
                return { color: DarkColors.warning, bg: `${DarkColors.warning}20`, label: 'Chờ chuyển tiền', icon: 'bank-transfer' };
            case 'clean':
                return { color: DarkColors.info, bg: `${DarkColors.info}20`, label: 'Đã hoàn thành', icon: 'check-circle' };
            case 'fail':
            case 'fail_transfer':
                return { color: DarkColors.error, bg: `${DarkColors.error}20`, label: 'Thất bại', icon: 'alert-circle' };
            default:
                return { color: DarkColors.textMuted, bg: `${DarkColors.textMuted}20`, label: status, icon: 'help-circle' };
        }
    };

    const tabs = [
        { key: undefined, label: 'Tất cả' },
        { key: 'success', label: 'Hoạt động' },
        { key: 'clean', label: 'Hoàn thành' },
        { key: 'waiting_other', label: 'Chờ góp vốn' },
    ];

    const renderInvestmentItem = ({ item }: { item: Investment }) => {
        const status = getStatusInfo(item.status);

        return (
            <TouchableOpacity
                style={styles.investmentCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('InvestmentDetail', { investment: item })}
            >
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                        <View style={[styles.iconCircle, { backgroundColor: status.bg }]}>
                            <MaterialCommunityIcons name={status.icon as any} size={20} color={status.color} />
                        </View>
                        <View>
                            <Text style={styles.contractId}>Đầu tư #{item.info.numNotes} notes</Text>
                            <Text style={styles.loanRef}>{item.loanContractId}</Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                </View>

                {/* Body */}
                <View style={styles.cardBody}>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Vốn đầu tư</Text>
                        <Text style={styles.value}>{formatCurrency(item.info.capital)}₫</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Thu nhập/tháng</Text>
                        <Text style={[styles.value, { color: DarkColors.success }]}>
                            +{formatCurrency(item.info.monthlyIncome || 0)}₫
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Tổng lợi nhuận</Text>
                        <Text style={[styles.value, { color: DarkColors.primary }]}>
                            {formatCurrency(item.info.entirelyProfit || 0)}₫
                        </Text>
                    </View>
                </View>

                {/* Received Section */}
                {(item.totalReceived || 0) > 0 && (
                    <View style={styles.receivedSection}>
                        <View style={styles.receivedRow}>
                            <MaterialCommunityIcons name="wallet-plus" size={18} color={DarkColors.success} />
                            <Text style={styles.receivedLabel}>Đã nhận</Text>
                        </View>
                        <Text style={styles.receivedValue}>{formatCurrency(item.totalReceived || 0)}₫</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DarkColors.primary} />
                <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Portfolio của tôi</Text>
                <Text style={styles.subtitle}>{investments.length} khoản đầu tư</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {tabs.map((tab) => (
                    <TouchableOpacity
                        key={tab.key || 'all'}
                        style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* List */}
            <FlatList
                data={investments}
                keyExtractor={(item) => item.id || item.contractId}
                renderItem={renderInvestmentItem}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={loadData}
                        tintColor={DarkColors.primary}
                        colors={[DarkColors.primary]}
                    />
                }
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <MaterialCommunityIcons name="briefcase-outline" size={48} color={DarkColors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>Chưa có đầu tư</Text>
                        <Text style={styles.emptyText}>Bạn chưa có khoản đầu tư nào</Text>
                        <TouchableOpacity
                            style={styles.investButton}
                            onPress={() => navigation.navigate('InvestList')}
                        >
                            <LinearGradient
                                colors={['#4347FF', '#6366F1'] as const}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.investButtonGradient}
                            >
                                <Text style={styles.investButtonText}>Đầu tư ngay</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                }
            />
        </View>
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
    // Header
    header: {
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: DarkColors.text,
    },
    subtitle: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginTop: 4,
    },
    // Tabs
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        marginBottom: 16,
        gap: 8,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: DarkStyling.borderRadius.full,
        backgroundColor: DarkColors.surface,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    activeTab: {
        backgroundColor: DarkColors.primary,
        borderColor: DarkColors.primary,
    },
    tabText: {
        fontSize: 13,
        color: DarkColors.textSecondary,
        fontWeight: '500',
    },
    activeTabText: {
        color: DarkColors.white,
    },
    // List
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    // Card
    investmentCard: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    contractId: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
    },
    loanRef: {
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
        fontSize: 11,
        fontWeight: '600',
    },
    // Card Body
    cardBody: {
        gap: 8,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    label: {
        color: DarkColors.textSecondary,
        fontSize: 14,
    },
    value: {
        color: DarkColors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    // Received Section
    receivedSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
        paddingTop: 12,
        marginTop: 12,
    },
    receivedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    receivedLabel: {
        color: DarkColors.textSecondary,
        fontSize: 14,
    },
    receivedValue: {
        color: DarkColors.success,
        fontSize: 16,
        fontWeight: '700',
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
        color: DarkColors.textSecondary,
        fontSize: 14,
        marginBottom: 24,
    },
    investButton: {
        borderRadius: DarkStyling.borderRadius.sm,
        overflow: 'hidden',
    },
    investButtonGradient: {
        paddingVertical: 14,
        paddingHorizontal: 32,
    },
    investButtonText: {
        color: DarkColors.white,
        fontWeight: '600',
        fontSize: 15,
    },
});
