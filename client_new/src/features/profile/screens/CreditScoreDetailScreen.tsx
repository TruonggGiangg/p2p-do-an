import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard } from '../../../components';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { authAPI } from '../../auth/api/auth.api';
import type { UserCreditScoreHistoryItem } from '../../../types/auth.types';

const SCORE_MIN = 300;
const SCORE_MAX = 850;
const PAGE_LIMIT = 15;

const creditScoreBand = (score: number) => {
    if (score >= 800) return { label: 'Xuất sắc', color: '#18A058' };
    if (score >= 740) return { label: 'Tốt', color: '#2F80ED' };
    if (score >= 670) return { label: 'Khá', color: '#F2C94C' };
    if (score >= 580) return { label: 'Trung bình', color: '#F2994A' };
    return { label: 'Cần cải thiện', color: '#EB5757' };
};

const formatHistoryReason = (reason?: string) => {
    switch (reason) {
        case 'initial_account_creation':
            return 'Khởi tạo tài khoản';
        case 'loan_repayment':
            return 'Trả nợ đúng hạn';
        case 'late_payment':
            return 'Chậm thanh toán';
        case 'manual_adjustment':
            return 'Điều chỉnh thủ công';
        case 'system_recalculation':
            return 'Hệ thống tính lại';
        default:
            return 'Cập nhật điểm';
    }
};

const formatDateTime = (value?: string) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
};

export default function CreditScoreDetailScreen() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const c = theme.colors;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [items, setItems] = useState<UserCreditScoreHistoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(true);

    const loadingMoreRef = useRef(false);

    const creditScore = user?.creditScore;
    const scoreValue = typeof creditScore?.score === 'number' ? creditScore.score : 650;
    const scoreRatio = Math.max(0, Math.min(1, (scoreValue - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
    const band = useMemo(() => creditScoreBand(scoreValue), [scoreValue]);

    const fetchHistory = useCallback(async (targetPage = 1, append = false) => {
        try {
            const data = await authAPI.getCreditScoreHistory(targetPage, PAGE_LIMIT);
            setHasNextPage(data.pagination.hasNextPage);
            setPage(data.pagination.page);
            setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        } catch (error) {
            console.error('Không thể tải lịch sử điểm tín dụng:', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            (async () => {
                setLoading(true);
                await fetchHistory(1, false);
                if (active) setLoading(false);
            })();

            return () => {
                active = false;
            };
        }, [fetchHistory]),
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchHistory(1, false);
        setRefreshing(false);
    }, [fetchHistory]);

    const onLoadMore = useCallback(async () => {
        if (loadingMoreRef.current || !hasNextPage || loading || refreshing) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            await fetchHistory(page + 1, true);
        } finally {
            setLoadingMore(false);
            loadingMoreRef.current = false;
        }
    }, [fetchHistory, hasNextPage, loading, page, refreshing]);

    const renderHistoryItem = ({ item, index }: { item: UserCreditScoreHistoryItem; index: number }) => {
        const change = Number(item?.changeAmount || 0);
        const isUp = change > 0;
        const isDown = change < 0;
        const changeColor = isUp ? '#18A058' : isDown ? '#EB5757' : c.textMuted;

        return (
            <View
                style={[
                    styles.historyItem,
                    { borderBottomColor: c.border + '30' },
                    index === items.length - 1 ? { borderBottomWidth: 0 } : null,
                ]}
            >
                <View style={styles.historyLeft}>
                    <Text style={[styles.historyReason, { color: c.textPrimary }]}>
                        {formatHistoryReason(item.reason)}
                    </Text>
                    <Text style={[styles.historyDate, { color: c.textMuted }]}>
                        {formatDateTime(item.createdAt)}
                    </Text>
                </View>
                <View style={styles.historyRight}>
                    <Text style={[styles.historyAfter, { color: c.textPrimary }]}>{item.afterScore ?? '--'}</Text>
                    <Text style={[styles.historyDelta, { color: changeColor }]}>
                        {isUp ? `+${change}` : `${change}`}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader mode="standard" title="Điểm tín dụng" showBack={true} />

            <FlatList
                data={items}
                keyExtractor={(item, index) => item._id || `${index}-${item.createdAt || ''}`}
                renderItem={renderHistoryItem}
                onEndReached={onLoadMore}
                onEndReachedThreshold={0.35}
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.contentContainer}
                ListHeaderComponent={
                    <>
                        <CommonCard
                            style={[
                                styles.heroCard,
                                {
                                    backgroundColor: theme.mode === 'dark' ? c.backgroundSecondary : '#FFF8E7',
                                },
                            ]}
                        >
                            <Text style={[styles.heroCaption, { color: c.textMuted }]}>Điểm tín dụng hiện tại</Text>
                            <Text style={[styles.heroScore, { color: c.textPrimary }]}>{scoreValue}</Text>

                            <View style={[styles.bandPill, { backgroundColor: band.color + '22' }]}>
                                <Text style={[styles.bandPillText, { color: band.color }]}>{band.label}</Text>
                            </View>

                            <View style={[styles.scoreProgressTrack, { backgroundColor: c.border + '45' }]}>
                                <View
                                    style={[
                                        styles.scoreProgressFill,
                                        {
                                            width: `${Math.max(scoreRatio * 100, 5)}%`,
                                            backgroundColor: band.color,
                                        },
                                    ]}
                                />
                            </View>

                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Text style={[styles.metaLabel, { color: c.textMuted }]}>Tổng khoản vay</Text>
                                    <Text style={[styles.metaValue, { color: c.textPrimary }]}>{creditScore?.totalLoans ?? 0}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={[styles.metaLabel, { color: c.textMuted }]}>Trả trễ hạn</Text>
                                    <Text style={[styles.metaValue, { color: c.textPrimary }]}>{creditScore?.latePayments ?? 0}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={[styles.metaLabel, { color: c.textMuted }]}>Cập nhật cuối</Text>
                                    <Text style={[styles.metaValue, { color: c.textPrimary }]}>
                                        {formatDateTime(creditScore?.lastUpdated)}
                                    </Text>
                                </View>
                            </View>
                        </CommonCard>

                        <View style={styles.historyHeader}>
                            <Text style={[styles.historyTitle, { color: c.textPrimary }]}>Lịch sử cập nhật điểm tín dụng</Text>
                            <Text style={[styles.historySubtitle, { color: c.textMuted }]}>Vuốt xuống để làm mới, kéo xuống cuối để tải thêm</Text>
                        </View>
                    </>
                }
                ListEmptyComponent={
                    loading ? (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator color={c.primary} />
                        </View>
                    ) : (
                        <View style={styles.emptyWrap}>
                            <MaterialCommunityIcons name="history" size={28} color={c.textMuted} />
                            <Text style={[styles.emptyText, { color: c.textMuted }]}>Chưa có lịch sử cập nhật điểm.</Text>
                        </View>
                    )
                }
                ListFooterComponent={
                    loadingMore ? (
                        <ActivityIndicator style={styles.footerLoader} color={c.primary} />
                    ) : hasNextPage && items.length > 0 ? (
                        <TouchableOpacity
                            style={[styles.loadMoreBtn, { borderColor: c.border }]}
                            activeOpacity={0.8}
                            onPress={onLoadMore}
                        >
                            <Text style={[styles.loadMoreText, { color: c.textSecondary }]}>Tải thêm lịch sử</Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={[styles.endText, { color: c.textMuted }]}>Đã hiển thị toàn bộ lịch sử</Text>
                    )
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    contentContainer: {
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === 'ios' ? 120 : 100,
        paddingTop: 16,
    },
    heroCard: {
        borderRadius: 18,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(194,157,70,0.25)',
        marginBottom: 16,
    },
    heroCaption: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    heroScore: {
        fontSize: 64,
        lineHeight: 72,
        fontFamily: 'Poppins_700Bold',
        marginTop: 4,
    },
    bandPill: {
        alignSelf: 'flex-start',
        marginTop: 2,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    bandPillText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    scoreProgressTrack: {
        height: 10,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 16,
    },
    scoreProgressFill: {
        height: '100%',
        borderRadius: 999,
    },
    metaRow: {
        marginTop: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    metaItem: { flex: 1 },
    metaLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 4,
    },
    metaValue: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyHeader: {
        marginBottom: 8,
    },
    historyTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    historySubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: 12,
    },
    historyLeft: {
        flex: 1,
        paddingRight: 8,
    },
    historyReason: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    historyDate: {
        marginTop: 2,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    historyRight: {
        alignItems: 'flex-end',
    },
    historyAfter: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    historyDelta: {
        marginTop: 1,
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    loadingWrap: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyWrap: {
        paddingVertical: 36,
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    footerLoader: {
        marginVertical: 14,
    },
    loadMoreBtn: {
        marginTop: 8,
        alignSelf: 'center',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    loadMoreText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    endText: {
        textAlign: 'center',
        marginTop: 10,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
});
