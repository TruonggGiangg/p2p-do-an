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
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, Investment } from '../../services/invest';
import { GradientBackground, GlassCard, GlassButton, GlassTokens } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

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
                return { color: GlassTokens.colors.success, bg: `${GlassTokens.colors.success}20`, label: 'Đang hoạt động', icon: 'play-circle' };
            case 'waiting_other':
                return { color: GlassTokens.colors.warning, bg: `${GlassTokens.colors.warning}20`, label: 'Chờ góp vốn', icon: 'clock-outline' };
            case 'waiting_transfer':
                return { color: GlassTokens.colors.warning, bg: `${GlassTokens.colors.warning}20`, label: 'Chờ chuyển tiền', icon: 'bank-transfer' };
            case 'clean':
                return { color: GlassTokens.colors.info, bg: `${GlassTokens.colors.info}20`, label: 'Đã hoàn thành', icon: 'check-circle' };
            case 'fail':
            case 'fail_transfer':
                return { color: GlassTokens.colors.error, bg: `${GlassTokens.colors.error}20`, label: 'Thất bại', icon: 'alert-circle' };
            default:
                return { color: GlassTokens.colors.textMuted, bg: `${GlassTokens.colors.textMuted}20`, label: status, icon: 'help-circle' };
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
                activeOpacity={0.8}
                onPress={() => navigation.navigate('InvestmentDetail', { investment: item })}
            >
                <GlassCard blur={GlassTokens.blur.light} style={styles.investmentCard}>
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
                        <View style={[styles.statusBadge, { backgroundColor: status.bg, borderColor: `${status.color}40` }]}>
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
                            <Text style={[styles.value, { color: GlassTokens.colors.success }]}>
                                +{formatCurrency(item.info.monthlyIncome || 0)}₫
                            </Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Tổng lợi nhuận</Text>
                            <Text style={[styles.value, { color: GlassTokens.colors.primary }]}>
                                {formatCurrency(item.info.entirelyProfit || 0)}₫
                            </Text>
                        </View>
                    </View>

                    {/* Received Section */}
                    {(item.totalReceived || 0) > 0 && (
                        <View style={styles.receivedSection}>
                            <View style={styles.receivedRow}>
                                <MaterialCommunityIcons name="wallet-plus" size={18} color={GlassTokens.colors.success} />
                                <Text style={styles.receivedLabel}>Đã nhận</Text>
                            </View>
                            <Text style={styles.receivedValue}>{formatCurrency(item.totalReceived || 0)}₫</Text>
                        </View>
                    )}
                </GlassCard>
            </TouchableOpacity>
        );
    };

    if (loading) {
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
                        tintColor={GlassTokens.colors.primary}
                        colors={[GlassTokens.colors.primary]}
                    />
                }
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <MaterialCommunityIcons name="briefcase-outline" size={48} color={GlassTokens.colors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>Chưa có đầu tư</Text>
                        <Text style={styles.emptyText}>Bạn chưa có khoản đầu tư nào</Text>
                        <GlassButton
                            title="ĐẦU TƯ NGAY"
                            onPress={() => navigation.navigate('InvestList')}
                            variant="primary"
                            icon="briefcase-plus"
                            style={styles.investButton}
                        />
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
    // Header
    header: {
        paddingHorizontal: UnifiedSpacing.lg,
        paddingTop: 60,
        paddingBottom: UnifiedSpacing.md,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
    },
    subtitle: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        marginTop: 4,
        fontFamily: 'Poppins_400Regular',
    },
    // Tabs
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: UnifiedSpacing.lg,
        marginBottom: UnifiedSpacing.md,
        gap: 8,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: UnifiedRadius.full,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    activeTab: {
        backgroundColor: GlassTokens.colors.primary,
        borderColor: GlassTokens.colors.primary,
    },
    tabText: {
        fontSize: 13,
        color: GlassTokens.colors.textSecondary,
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
    activeTabText: {
        color: GlassTokens.colors.white,
        fontFamily: 'Poppins_600SemiBold',
    },
    // List
    listContent: {
        paddingHorizontal: UnifiedSpacing.lg,
        paddingBottom: 100,
    },
    // Card
    investmentCard: {
        marginBottom: 12,
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
        flex: 1,
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
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_600SemiBold',
    },
    loanRef: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: UnifiedRadius.full,
        borderWidth: 1,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
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
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    value: {
        color: GlassTokens.colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    // Received Section
    receivedSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        paddingTop: 12,
        marginTop: 12,
    },
    receivedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    receivedLabel: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    receivedValue: {
        color: GlassTokens.colors.success,
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
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
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        marginBottom: 24,
        fontFamily: 'Poppins_400Regular',
    },
    investButton: {
        marginTop: 8,
    },
});
