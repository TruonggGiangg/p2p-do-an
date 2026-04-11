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
import { LinearGradient } from 'expo-linear-gradient';
import { BinanceHeader, CommonCard } from '../../../components';
import { useToast } from '../../../components';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { authAPI } from '../../auth/api/auth.api';
import type { UserCreditScoreHistoryItem, CreditScoreFactors } from '../../../types/auth.types';

const SCORE_MIN = 150;
const SCORE_MAX = 750;
const PAGE_LIMIT = 15;

const FACTOR_META: { key: keyof CreditScoreFactors; label: string; short: string; icon: string; color: string }[] = [
    { key: 'paymentHistory', label: 'Lịch sử thanh toán', short: 'Thanh toán', icon: 'calendar-check', color: '#18A058' },
    { key: 'debtLevel', label: 'Dư nợ tín dụng', short: 'Dư nợ', icon: 'cash-minus', color: '#F2994A' },
    { key: 'creditAge', label: 'Tuổi tín dụng', short: 'Tuổi TD', icon: 'clock-outline', color: '#2F80ED' },
    { key: 'creditMix', label: 'Đa dạng tín dụng', short: 'Đa dạng', icon: 'chart-pie', color: '#9B51E0' },
    { key: 'newCredit', label: 'Tín dụng mới', short: 'TD mới', icon: 'plus-circle-outline', color: '#EB5757' },
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
    const toast = useToast();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [items, setItems] = useState<UserCreditScoreHistoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [factors, setFactors] = useState<CreditScoreFactors | null>(null);

    const loadingMoreRef = useRef(false);
    const [recalculating, setRecalculating] = useState(false);

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
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),
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

    const handleRecalculate = useCallback(async () => {
        if (recalculating) return;
        setRecalculating(true);
        try {
            const result = await authAPI.recalculateCreditScore();
            // Refresh user & history to reflect new score
            await refreshUser();
            await fetchHistory(1, false);
            setFactors(result.factors);
            toast.show({
                type: 'success',
                title: 'Tính lại thành công',
                message: `Điểm mới: ${result.score} — ${result.risk?.label ?? '--'}`,
            });
        } catch (err: any) {
            toast.show({
                type: 'error',
                title: 'Lỗi',
                message: err?.message || 'Không thể tính lại điểm tín dụng',
            });
        } finally {
            setRecalculating(false);
        }
    }, [recalculating, refreshUser, fetchHistory, toast]);

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

    const reasonIcon = (reason?: string): { name: string; color: string; bg: string } => {
        switch (reason) {
            case 'late_payment':
                return { name: 'clock-alert-outline', color: '#EB5757', bg: '#EB575715' };
            case 'loan_repayment':
                return { name: 'check-circle-outline', color: '#18A058', bg: '#18A05815' };
            case 'loan_prepayment':
                return { name: 'lightning-bolt', color: '#2F80ED', bg: '#2F80ED15' };
            case 'system_recalculation':
                return { name: 'sync', color: '#9B59B6', bg: '#9B59B615' };
            case 'manual_adjustment':
                return { name: 'pencil-outline', color: '#F2994A', bg: '#F2994A15' };
            case 'initial_account_creation':
                return { name: 'account-plus-outline', color: '#2F80ED', bg: '#2F80ED15' };
            default:
                return { name: 'information-outline', color: c.textMuted, bg: c.border + '20' };
        }
    };

    const renderHistoryItem = ({ item, index }: { item: UserCreditScoreHistoryItem; index: number }) => {
        const change = Number(item?.changeAmount || 0);
        const isUp = change > 0;
        const isDown = change < 0;
        const changeColor = isUp ? '#18A058' : isDown ? '#EB5757' : c.textMuted;
        const icon = reasonIcon(item.reason);

        return (
            <View
                style={[
                    styles.historyCard,
                    {
                        backgroundColor: isDark ? c.backgroundSecondary : c.surface,
                        borderColor: isDark ? c.border + '30' : '#F0F0F0',
                    },
                ]}
            >
                {/* Top row: icon + title + score change */}
                <View style={styles.historyTopRow}>
                    <View style={[styles.historyIconWrap, { backgroundColor: icon.bg }]}>
                        <MaterialCommunityIcons name={icon.name as any} size={20} color={icon.color} />
                    </View>
                    <View style={styles.historyTitleArea}>
                        <Text style={[styles.historyReason, { color: c.textPrimary }]} numberOfLines={1}>
                            {formatHistoryReason(item.reason)}
                        </Text>
                        <Text style={[styles.historyDate, { color: c.textMuted }]}>
                            {formatDateTime(item.createdAt)}
                        </Text>
                    </View>
                    <View style={styles.historyScoreArea}>
                        <Text style={[styles.historyScoreRange, { color: c.textSecondary }]}>
                            {item.beforeScore ?? '--'} → {item.afterScore ?? '--'}
                        </Text>
                        <View style={[styles.historyDeltaBadge, {
                            backgroundColor: isUp ? '#18A05818' : isDown ? '#EB575718' : c.border + '30',
                        }]}>
                            <Text style={[styles.historyDelta, { color: changeColor }]}>
                                {isUp ? `+${change}` : `${change}`}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Factor pills row */}
                {item.factors && (
                    <View style={styles.historyFactorsRow}>
                        {FACTOR_META.map(m => {
                            const val = Math.round((item.factors as any)[m.key]);
                            return (
                                <View
                                    key={m.key}
                                    style={[styles.historyFactorPill, { backgroundColor: m.color + '1A' }]}
                                >
                                    <Text style={[styles.historyFactorPillLabel, { color: m.color }]}>
                                        {m.short}:
                                    </Text>
                                    <Text style={[styles.historyFactorPillValue, { color: m.color }]}>
                                        {val}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Note */}
                {item.note ? (
                    <Text style={[styles.historyNote, { color: c.textMuted }]} numberOfLines={2}>
                        {item.note}
                    </Text>
                ) : null}
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
                        {/* ── Hero Score Card with Gradient ── */}
                        <View style={styles.heroCardWrap}>
                            <LinearGradient
                                colors={isDark
                                    ? [c.backgroundSecondary, c.backgroundTertiary]
                                    : ['#FFFFFF', '#F8FAF9']}
                                style={[
                                    styles.heroCard,
                                    { borderColor: isDark ? c.border + '30' : '#E8E8E8' },
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                {/* Score header */}
                                <View style={styles.heroTopRow}>
                                    <View>
                                        <Text style={[styles.heroCaption, { color: c.textMuted }]}>Điểm tín dụng hiện tại</Text>
                                        <Text style={[styles.heroScore, { color: c.textPrimary }]}>{scoreValue}</Text>
                                    </View>
                                    <View style={[styles.bandPill, { backgroundColor: band.color + '22' }]}>
                                        <View style={[styles.bandDot, { backgroundColor: band.color }]} />
                                        <Text style={[styles.bandPillText, { color: band.color }]}>{band.label}</Text>
                                    </View>
                                </View>

                                {/* Progress bar */}
                                <View style={[styles.scoreProgressTrack, { backgroundColor: isDark ? c.border + '60' : '#E8ECE9' }]}>
                                    <LinearGradient
                                        colors={[band.color + 'CC', band.color]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={[
                                            styles.scoreProgressFill,
                                            { width: `${Math.max(scoreRatio * 100, 5)}%` },
                                        ]}
                                    />
                                </View>

                                <View style={styles.scaleLabels}>
                                    <Text style={[styles.scaleText, { color: c.textMuted }]}>{SCORE_MIN}</Text>
                                    <Text style={[styles.scaleText, { color: c.textMuted }]}>{SCORE_MAX}</Text>
                                </View>

                                {/* Meta stats */}
                                <View style={styles.metaRow}>
                                    <View style={[styles.metaItem, { backgroundColor: isDark ? c.backgroundTertiary : '#F4F6F5', borderRadius: 12, padding: 10 }]}>
                                        <MaterialCommunityIcons name="file-document-outline" size={16} color={c.textMuted} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.metaLabel, { color: c.textMuted }]}>Khoản vay</Text>
                                        <Text style={[styles.metaValue, { color: c.textPrimary }]}>{creditScore?.totalLoans ?? 0}</Text>
                                    </View>
                                    <View style={[styles.metaItem, { backgroundColor: isDark ? c.backgroundTertiary : '#F4F6F5', borderRadius: 12, padding: 10 }]}>
                                        <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#EB5757" style={{ marginBottom: 4 }} />
                                        <Text style={[styles.metaLabel, { color: c.textMuted }]}>Trả trễ</Text>
                                        <Text style={[styles.metaValue, { color: (creditScore?.latePayments ?? 0) > 0 ? '#EB5757' : c.textPrimary }]}>
                                            {creditScore?.latePayments ?? 0}
                                        </Text>
                                    </View>
                                    <View style={[styles.metaItem, { backgroundColor: isDark ? c.backgroundTertiary : '#F4F6F5', borderRadius: 12, padding: 10 }]}>
                                        <MaterialCommunityIcons name="update" size={16} color={c.textMuted} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.metaLabel, { color: c.textMuted }]}>Cập nhật</Text>
                                        <Text style={[styles.metaValue, { color: c.textPrimary }]} numberOfLines={1}>
                                            {formatDateTime(creditScore?.lastUpdated)}
                                        </Text>
                                    </View>
                                </View>

                                {/* Recalculate Button */}
                                <TouchableOpacity
                                    style={[
                                        styles.recalcBtn,
                                        {
                                            backgroundColor: band.color + '18',
                                            borderColor: band.color + '40',
                                        },
                                        recalculating && { opacity: 0.6 },
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={handleRecalculate}
                                    disabled={recalculating}
                                >
                                    {recalculating ? (
                                        <ActivityIndicator size="small" color={band.color} />
                                    ) : (
                                        <MaterialCommunityIcons name="refresh" size={16} color={band.color} />
                                    )}
                                    <Text style={[styles.recalcBtnText, { color: band.color }]}>
                                        {recalculating ? 'Đang tính lại...' : 'Tính lại điểm'}
                                    </Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>

                        {/* ── 5-Factor Breakdown Card ── */}
                        <CommonCard
                            style={[
                                styles.factorCard,
                                {
                                    backgroundColor: isDark ? c.backgroundSecondary : c.surface,
                                    borderColor: isDark ? c.border + '30' : '#E8E8E8',
                                },
                            ]}
                        >
                            <View style={styles.factorHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <View style={[styles.factorIconWrap, { backgroundColor: isDark ? c.backgroundTertiary : '#F0F4F2' }]}>
                                        <MaterialCommunityIcons name="chart-bar" size={16} color={c.textSecondary} />
                                    </View>
                                    <View>
                                        <Text style={[styles.factorTitle, { color: c.textPrimary }]}>5 Yếu tố tín dụng</Text>
                                        <Text style={[styles.factorSubtitle, { color: c.textMuted }]}>Mỗi yếu tố 0-100 điểm</Text>
                                    </View>
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={[styles.historyHeaderIcon, { backgroundColor: isDark ? c.backgroundTertiary : '#F0F4F2' }]}>
                                    <MaterialCommunityIcons name="history" size={16} color={c.textSecondary} />
                                </View>
                                <View>
                                    <Text style={[styles.historyTitle, { color: c.textPrimary }]}>Lịch sử cập nhật</Text>
                                    <Text style={[styles.historySubtitle, { color: c.textMuted }]}>Vuốt xuống để làm mới, kéo xuống cuối để tải thêm</Text>
                                </View>
                            </View>
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
    // ── Hero Card ──
    heroCardWrap: {
        marginBottom: 12,
    },
    heroCard: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    heroTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    heroCaption: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    heroScore: {
        fontSize: 48,
        lineHeight: 56,
        fontFamily: 'Poppins_700Bold',
        marginTop: 2,
    },
    bandPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    bandDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    bandPillText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    scoreProgressTrack: {
        height: 10,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 18,
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
    metaItem: {
        flex: 1,
        alignItems: 'center',
    },
    metaLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 2,
    },
    metaValue: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    // ── Recalculate Button ──
    recalcBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    recalcBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    // ── Factor Card ──
    factorCard: {
        borderRadius: 20,
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
    factorIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
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
        gap: 14,
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
        marginBottom: 12,
    },
    historyHeaderIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    historyTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 1,
    },
    historySubtitle: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
    },
    historyCard: {
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
    },
    historyTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    historyIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    historyTitleArea: {
        flex: 1,
        paddingRight: 8,
    },
    historyReason: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyDate: {
        marginTop: 1,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    historyScoreArea: {
        alignItems: 'flex-end',
    },
    historyScoreRange: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    historyDeltaBadge: {
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginTop: 4,
    },
    historyDelta: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    historyFactorsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 10,
    },
    historyFactorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    historyFactorPillLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyFactorPillValue: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    historyNote: {
        marginTop: 8,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 15,
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
        paddingHorizontal: 20,
        paddingVertical: 10,
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
