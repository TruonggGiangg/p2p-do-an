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

    const [contracts, setContracts] = useState<LoanContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchContracts = useCallback(async () => {
        try {
            const data = await loanService.getContracts();
            setContracts(data);
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

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <BinanceHeader title="Hợp đồng vay" mode="standard" />

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
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
                                Chưa có hợp đồng nào
                            </Text>
                            <Text style={[styles.emptyDesc, { color: colors.textDim }]}>
                                Hợp đồng sẽ được tạo khi khoản vay được phê duyệt
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
