/**
 * LoanContractListScreen.tsx - Danh sách hợp đồng vay
 * Hiển thị tất cả hợp đồng, bấm vào xem chi tiết
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import { loanService, LoanContract, LoanContractStatus } from '../services/loan.service';
import investService, { InvestmentContractItem } from '../../invest/services/invest.service';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

// --- Helpers ---
const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const getStatusConfig = (status: LoanContractStatus) => {
    switch (status) {
        case 'pending_signature':
            return { text: 'Chờ ký', color: '#F59E0B', bg: '#F59E0B15', icon: 'file-sign' as const };
        case 'signed':
            return { text: 'Đã ký', color: '#3B82F6', bg: '#3B82F615', icon: 'file-check' as const };
        case 'active':
            return { text: 'Đang hiệu lực', color: '#10B981', bg: '#10B98115', icon: 'file-document-check' as const };
        case 'completed':
            return { text: 'Hoàn tất', color: '#6B7280', bg: '#6B728015', icon: 'file-document' as const };
        case 'cancelled':
            return { text: 'Đã hủy', color: '#EF4444', bg: '#EF444415', icon: 'file-remove' as const };
        default:
            return { text: status, color: '#6B7280', bg: '#6B728015', icon: 'file-document-outline' as const };
    }
};

export default function LoanContractListScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { theme } = useTheme();
    const colors = theme.colors;

    const [activeTab, setActiveTab] = useState<'loan' | 'invest'>('loan');
    const [contracts, setContracts] = useState<LoanContract[]>([]);
    const [investContracts, setInvestContracts] = useState<InvestmentContractItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchContracts = useCallback(async () => {
        try {
            const [loanData, investResult] = await Promise.all([
                loanService.getContracts().catch(() => [] as LoanContract[]),
                investService.getContracts({ pageSize: 50 }).catch(() => ({ contracts: [], totalCount: 0 } as any)),
            ]);
            setContracts(loanData);
            setInvestContracts(investResult.contracts || []);
        } catch (err) {
            console.error('[ContractList] Error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchContracts();
    }, [fetchContracts]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchContracts();
    };

    const renderContract = ({ item }: { item: LoanContract }) => {
        const statusCfg = getStatusConfig(item.status);
        const isPending = item.status === 'pending_signature';

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate('LoanContractDetail', { contractId: item.contractId || item._id })}
            >
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                        <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.primary} />
                        <Text style={[styles.contractId, { color: colors.textPrimary }]} numberOfLines={1}>
                            {item.contractId}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <MaterialCommunityIcons name={statusCfg.icon} size={14} color={statusCfg.color} />
                        <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.text}</Text>
                    </View>
                </View>

                {/* Info */}
                <View style={styles.cardBody}>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Sản phẩm</Text>
                        <Text style={[styles.value, { color: colors.textPrimary }]}>
                            {item.productName || 'Vay tiêu dùng'}
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Số tiền vay</Text>
                        <Text style={[styles.value, { color: colors.textPrimary, fontWeight: '700' }]}>
                            {formatMoney(item.principalAmount)} đ
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Kỳ hạn</Text>
                        <Text style={[styles.value, { color: colors.textPrimary }]}>
                            {item.tenure} tháng • {item.interestRate}%/tháng
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Ngày tạo</Text>
                        <Text style={[styles.value, { color: colors.textSecondary }]}>
                            {formatDate(item.createdAt)}
                        </Text>
                    </View>
                </View>

                {/* Pending action hint */}
                {isPending && (
                    <View style={[styles.actionHint, { borderTopColor: colors.border }]}>
                        <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                        <Text style={styles.actionHintText}>Cần ký xác nhận hợp đồng</Text>
                        <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const renderInvestContract = ({ item }: { item: InvestmentContractItem }) => {
        const investStatusMap: Record<string, { label: string; color: string }> = {
            pending: { label: 'Chờ xử lý', color: '#F59E0B' },
            pending_signature: { label: 'Chờ ký số', color: '#8B5CF6' },
            active: { label: 'Đang hoạt động', color: '#10B981' },
            matured: { label: 'Đáo hạn', color: '#3B82F6' },
            closed: { label: 'Đã đóng', color: '#6B7280' },
            cancelled: { label: 'Đã hủy', color: '#EF4444' },
        };
        const statusCfg = investStatusMap[item.status] || investStatusMap.pending;
        const loanInfo: any = item.loanApplicationId;
        const purpose = typeof loanInfo === 'object' ? loanInfo?.willing : '';
        return (
            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => (navigation as any).navigate('InvestmentContractDetail', { contractId: item._id })}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                        <MaterialCommunityIcons name="trending-up" size={20} color={colors.primary} />
                        <Text style={[styles.contractId, { color: colors.textPrimary }]} numberOfLines={1}>
                            {item.contractId}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                        <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                    </View>
                </View>
                <View style={styles.cardBody}>
                    {purpose ? (
                        <View style={styles.infoRow}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Mục đích vay</Text>
                            <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>{purpose}</Text>
                        </View>
                    ) : null}
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Vốn đầu tư</Text>
                        <Text style={[styles.value, { color: colors.textPrimary, fontWeight: '700' }]}>
                            {formatMoney(item.capital)} đ
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Lãi suất</Text>
                        <Text style={[styles.value, { color: colors.primary }]}>
                            {item.monthlyRatePercent}%/tháng
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Kỳ hạn</Text>
                        <Text style={[styles.value, { color: colors.textPrimary }]}>{item.periodMonth} tháng</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Lợi nhuận dự kiến</Text>
                        <Text style={[styles.value, { color: '#10B981', fontWeight: '700' }]}>
                            {formatMoney(item.entirelyProfit)} đ
                        </Text>
                    </View>
                </View>
                {item.status === 'pending_signature' && (
                    <View style={[styles.actionHint, { borderTopColor: colors.border }]}>
                        <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                        <Text style={styles.actionHintText}>Cần ký SmartCA để hoàn tất đầu tư</Text>
                        <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <BinanceHeader title="Hợp đồng" mode="standard" />

            {/* Tabs */}
            <View style={[styles.tabsContainer, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'loan' && { borderBottomColor: colors.primary }]}
                    onPress={() => setActiveTab('loan')}
                >
                    <Text
                        style={[
                            styles.tabText,
                            { color: activeTab === 'loan' ? colors.primary : colors.textSecondary },
                        ]}
                    >
                        Hợp đồng vay {contracts.length > 0 ? `(${contracts.length})` : ''}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'invest' && { borderBottomColor: colors.primary }]}
                    onPress={() => setActiveTab('invest')}
                >
                    <Text
                        style={[
                            styles.tabText,
                            { color: activeTab === 'invest' ? colors.primary : colors.textSecondary },
                        ]}
                    >
                        Hợp đồng đầu tư {investContracts.length > 0 ? `(${investContracts.length})` : ''}
                    </Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : activeTab === 'loan' ? (
                <FlatList
                    data={contracts}
                    keyExtractor={(item) => item._id || item.contractId}
                    renderItem={renderContract}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons name="file-document-outline" size={64} color={colors.textDim} />
                            <Text style={[styles.emptyTitle, { color: colors.textDim }]}>
                                Chưa có hợp đồng vay nào
                            </Text>
                            <Text style={[styles.emptyDesc, { color: colors.textDim }]}>
                                Hợp đồng vay sẽ được tạo khi khoản vay được phê duyệt
                            </Text>
                        </View>
                    }
                />
            ) : (
                <FlatList
                    data={investContracts}
                    keyExtractor={(item) => item._id}
                    renderItem={renderInvestContract}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons name="trending-up" size={64} color={colors.textDim} />
                            <Text style={[styles.emptyTitle, { color: colors.textDim }]}>
                                Chưa có hợp đồng đầu tư nào
                            </Text>
                            <Text style={[styles.emptyDesc, { color: colors.textDim }]}>
                                Đầu tư trực tiếp vào khoản vay đang mở để tạo hợp đồng đầu tư
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { padding: 16, paddingBottom: 32 },

    tabsContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        paddingHorizontal: 16,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabText: { fontSize: 14, fontWeight: '600' },

    card: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    contractId: {
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 8,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },

    cardBody: {
        paddingHorizontal: 16,
        paddingBottom: 14,
        gap: 6,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: { fontSize: 13 },
    value: { fontSize: 13 },

    actionHint: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        backgroundColor: '#F59E0B08',
        gap: 6,
    },
    actionHintText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
        color: '#F59E0B',
    },

    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        gap: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '600' },
    emptyDesc: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});
