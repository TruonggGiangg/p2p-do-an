import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { UserCreditScoreHistoryItem, CreditScoreFactors } from '../../../types/auth.types';

const SCORE_MIN = 150;
const SCORE_MAX = 750;
const PAGE_LIMIT = 15;

const FACTOR_META: { key: keyof CreditScoreFactors; label: string; icon: string; color: string }[] = [
    { key: 'paymentHistory', label: 'Lịch sử thanh toán', icon: 'calendar-check', color: '#18A058' },
    { key: 'debtLevel', label: 'Dư nợ tín dụng', icon: 'cash-minus', color: '#2F80ED' },
    { key: 'creditAge', label: 'Tuổi tín dụng', icon: 'clock-outline', color: '#9B59B6' },
    { key: 'creditMix', label: 'Đa dạng tín dụng', icon: 'chart-pie', color: '#F2994A' },
    { key: 'newCredit', label: 'Tín dụng mới', icon: 'plus-circle-outline', color: '#EB5757' },
];

const creditScoreBand = (score: number) => {
    if (score >= 680) return { label: 'Rủi ro rất thấp', color: '#18A058' };
    if (score >= 570) return { label: 'Rủi ro thấp', color: '#2F80ED' };
    if (score >= 431) return { label: 'Rủi ro trung bình', color: '#F2C94C' };
    if (score >= 322) return { label: 'Rủi ro cao', color: '#F2994A' };
    return { label: 'Rủi ro rất cao', color: '#EB5757' };
};

const formatHistoryReason = (reason?: string) => {
    switch (reason) {
        case 'initial_account_creation':
            return 'Khởi tạo tài khoản';
        case 'loan_repayment':
            return 'Trả nợ đúng hạn';
        case 'loan_prepayment':
            return 'Tất toán trước hạn';
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
    const { user, refreshUser } = useAuth();
    const { theme } = useTheme();
    const c = theme.colors;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [items, setItems] = useState<UserCreditScoreHistoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [factors, setFactors] = useState<CreditScoreFactors | null>(null);

    const loadingMoreRef = useRef(false);

    const creditScore = user?.creditScore;
    const scoreValue = typeof creditScore?.score === 'number' ? creditScore.score : 570;
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
                // Refresh user to get latest credit score
                try { await refreshUser(); } catch { }
                await fetchHistory(1, false);
                if (active) setLoading(false);
            })();

            return () => {
                active = false;
            };
        }, [fetchHistory, refreshUser]),
    );

    // Keep factors in sync with user credit score
    useEffect(() => {
        if (user?.creditScore?.factors) {
            setFactors(user.creditScore.factors);
        }
    }, [user?.creditScore?.factors]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await refreshUser(); } catch { }
        await fetchHistory(1, false);
        setRefreshing(false);
    }, [fetchHistory, refreshUser]);

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

    const renderFactorBar = (meta: typeof FACTOR_META[0], value: number) => (
        <View key={meta.key} style={styles.factorRow}>
            <View style={styles.factorLabelRow}>
                <MaterialCommunityIcons name={meta.icon as any} size={16} color={meta.color} />
                <Text style={[styles.factorLabel, { color: c.textPrimary }]}>{meta.label}</Text>
                <Text style={[styles.factorValue, { color: meta.color }]}>{Math.round(value)}/100</Text>
            </View>
            <View style={[styles.factorTrack, { backgroundColor: c.border + '40' }]}>
                <View
                    style={[
                        styles.factorFill,
                        {
                            width: `${Math.max(Math.min(value, 100), 2)}%`,
                            backgroundColor: meta.color,
                        },
                    ]}
                />
            </View>
        </View>
    );

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
                    {item.factors && (
                        <View style={styles.historyFactorsRow}>
                            {FACTOR_META.map(m => (
                                <View key={m.key} style={[styles.historyFactorPill, { backgroundColor: m.color + '18' }]}>
                                    <Text style={[styles.historyFactorText, { color: m.color }]}>
                                        {m.label.substring(0, 2)}: {Math.round((item.factors as any)[m.key])}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                    {item.note ? (
                        <Text style={[styles.historyNote, { color: c.textMuted }]} numberOfLines={2}>
                            {item.note}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.historyRight}>
                    <Text style={[styles.historyScoreRange, { color: c.textMuted }]}>
                        {item.beforeScore ?? '--'} → {item.afterScore ?? '--'}
                    </Text>
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
                        {/* ── Hero Score Card ── */}
                        <CommonCard
                            style={[
                                styles.heroCard,
                                {
                                    backgroundColor: theme.mode === 'dark' ? c.backgroundSecondary : c.surface,
                                    borderColor: c.border + '40',
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

                            <View style={styles.scaleLabels}>
                                <Text style={[styles.scaleText, { color: c.textMuted }]}>{SCORE_MIN}</Text>
                                <Text style={[styles.scaleText, { color: c.textMuted }]}>{SCORE_MAX}</Text>
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

                        {/* ── 5-Factor Breakdown Card ── */}
                        <CommonCard
                            style={[
                                styles.factorCard,
                                {
                                    backgroundColor: theme.mode === 'dark' ? c.backgroundSecondary : c.surface,
                                    borderColor: c.border + '40',
                                },
                            ]}
                        >
                            <View style={styles.factorHeader}>
                                <View>
                                    <Text style={[styles.factorTitle, { color: c.textPrimary }]}>5 Yếu tố tín dụng</Text>
                                    <Text style={[styles.factorSubtitle, { color: c.textMuted }]}>Mỗi yếu tố 0-100 điểm · Cập nhật theo sự kiện</Text>
                                </View>
                            </View>

                            {factors ? (
                                <View style={styles.factorsContainer}>
                                    {FACTOR_META.map(m => renderFactorBar(m, (factors as any)[m.key] ?? 0))}
                                </View>
                            ) : (
                                <View style={styles.noFactors}>
                                    <MaterialCommunityIcons name="chart-bar" size={24} color={c.textMuted} />
                                    <Text style={[styles.noFactorsText, { color: c.textMuted }]}>
                                        Đang tải phân tích 5 yếu tố...
                                    </Text>
                                </View>
                            )}
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
                    ) : items.length > 0 ? (
                        <Text style={[styles.endText, { color: c.textMuted }]}>Đã hiển thị toàn bộ lịch sử</Text>
                    ) : null
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
        borderColor: 'transparent',
        marginBottom: 12,
    },
    heroCaption: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    heroScore: {
        fontSize: 48,
        lineHeight: 56,
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
    scaleLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    scaleText: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
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
    // ── Factor Card ──
    factorCard: {
        borderRadius: 18,
        padding: 20,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 16,
    },
    factorHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    factorTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    factorSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginTop: 1,
    },
    factorsContainer: {
        gap: 12,
    },
    factorRow: {
        gap: 6,
    },
    factorLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    factorLabel: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    factorValue: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    factorTrack: {
        height: 8,
        borderRadius: 999,
        overflow: 'hidden',
    },
    factorFill: {
        height: '100%',
        borderRadius: 999,
    },
    noFactors: {
        alignItems: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    noFactorsText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    // ── History ──
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
        alignItems: 'flex-start',
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
    historyFactorsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 6,
    },
    historyFactorPill: {
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
    },
    historyFactorText: {
        fontSize: 9,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyRight: {
        alignItems: 'flex-end',
    },
    historyAfter: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    historyScoreRange: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    historyNote: {
        marginTop: 4,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 15,
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
