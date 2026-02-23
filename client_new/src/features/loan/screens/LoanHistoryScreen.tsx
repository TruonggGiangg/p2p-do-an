import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    FlatList,
} from 'react-native';
import Animated from 'react-native-reanimated';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, FintechPullToRefresh, VentoUltimateLoading } from '../../../components';
import { loanService, LoanHistoryItem } from '../services/loan.service';
import { formatCurrency } from '../../../shared/utils';

const STATUS_LABELS: Record<string, string> = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    disbursed: 'Đã giải ngân',
    cancelled: 'Đã hủy',
    closed: 'Đã tất toán',
    unknown: 'Không xác định',
};

const STATUS_COLORS: Record<string, string> = {
    pending: '#F59E0B',
    approved: '#3B82F6',
    rejected: '#EF4444',
    disbursed: '#10B981',
    cancelled: '#6B7280',
    closed: '#059669',
    unknown: '#9CA3AF',
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function LoanItem({ item, theme }: { item: LoanHistoryItem; theme: any }) {
    const statusLabel = STATUS_LABELS[item.status] ?? item.status;
    const statusColor = STATUS_COLORS[item.status] ?? theme.colors.textMuted;

    return (
        <CommonCard style={styles.loanCard}>
            <View style={styles.loanRow}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '25' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                <Text style={[styles.loanDate, { color: theme.colors.textDim }]}>
                    {formatDate(item.createdAt)}
                </Text>
            </View>
            {item.productName && (
                <Text style={[styles.productName, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {item.productName}
                </Text>
            )}
            <View style={styles.amountRow}>
                <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>Số tiền vay:</Text>
                <Text style={[styles.amountValue, { color: theme.colors.textPrimary }]}>
                    {formatCurrency(item.capital)}
                </Text>
            </View>
            <View style={styles.amountRow}>
                <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>Kỳ hạn:</Text>
                <Text style={[styles.amountValue, { color: theme.colors.textPrimary }]}>
                    {item.periodMonth} tháng
                </Text>
            </View>
            {(item.monthlyPay != null && item.monthlyPay > 0) && (
                <View style={styles.amountRow}>
                    <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>Trả/tháng:</Text>
                    <Text style={[styles.amountValue, { color: theme.colors.primary }]}>
                        {formatCurrency(item.monthlyPay)}
                    </Text>
                </View>
            )}
            {(item.entirelyPay != null && item.entirelyPay > 0) && (
                <View style={styles.amountRow}>
                    <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>Tổng trả:</Text>
                    <Text style={[styles.amountValue, { color: theme.colors.textPrimary }]}>
                        {formatCurrency(item.entirelyPay)}
                    </Text>
                </View>
            )}
        </CommonCard>
    );
}

export default function LoanHistoryScreen() {
    const { theme } = useTheme();
    const [applications, setApplications] = useState<LoanHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchApplications = useCallback(async () => {
        const minDelay = new Promise(resolve => setTimeout(resolve, 1700));
        try {
            const [list] = await Promise.all([
                loanService.getApplications(),
                minDelay
            ]);
            setApplications(list);
        } catch (e) {
            console.error('[LoanHistory] Error:', e);
            Alert.alert('Lỗi', 'Không thể tải lịch sử khoản vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchApplications();
    }, [fetchApplications]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader
                mode="standard"
                title="Lịch sử khoản vay"
                showBack={true}
            />

            <FintechPullToRefresh
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                renderScrollComponent={(props) => (
                    <AnimatedFlatList
                        {...props}
                        data={applications}
                        keyExtractor={(item: LoanHistoryItem) => item.id}
                        renderItem={({ item }: { item: LoanHistoryItem }) => (
                            <View style={{ marginBottom: 12 }}>
                                <LoanItem item={item} theme={theme} />
                            </View>
                        )}
                        ListEmptyComponent={() => (
                            <View style={styles.emptyWrapper}>
                                <MaterialCommunityIcons
                                    name="file-document-outline"
                                    size={64}
                                    color={theme.colors.textDim}
                                />
                                <Text style={[styles.emptyTitle, { color: theme.colors.textSecondary }]}>
                                    Chưa có khoản vay
                                </Text>
                                <Text style={[styles.emptySubtitle, { color: theme.colors.textDim }]}>
                                    Các khoản vay của bạn sẽ hiển thị tại đây
                                </Text>
                            </View>
                        )}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                    />
                )}
            >
                {loading && !refreshing && (
                    <View style={styles.loadingWrapper}>
                        <VentoUltimateLoading size={200} />
                    </View>
                )}
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
    },
    loadingWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    emptyWrapper: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        marginTop: 8,
    },
    listContent: {
        paddingBottom: 20,
    },
    loanCard: {
        padding: 16,
    },
    loanRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    loanDate: {
        fontSize: 12,
    },
    productName: {
        fontSize: 14,
        marginBottom: 8,
    },
    amountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    amountLabel: {
        fontSize: 13,
    },
    amountValue: {
        fontSize: 14,
        fontWeight: '600',
    },
});
