import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import { bnplAPI } from '../api/bnpl.api';
import type { BnplTransaction } from '../api/bnpl.api';

// ── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'disbursement' | 'repayment' | 'prepayment' | 'fee' | 'adjustment' | 'other';

const TYPE_FILTERS: { key: FilterType; label: string; icon: string; color: string; bg: string }[] = [
    { key: 'all',          label: 'Tất cả',          icon: 'view-list',              color: '#4F8EF7', bg: '#4F8EF720' },
    { key: 'disbursement', label: 'Giải ngân',        icon: 'cash-plus',              color: '#0ECB81', bg: '#0ECB8120' },
    { key: 'repayment',    label: 'Trả nợ',           icon: 'credit-card-check',      color: '#F0A500', bg: '#F0A50020' },
    { key: 'prepayment',   label: 'Trả trước hạn',   icon: 'lightning-bolt',         color: '#9B59B6', bg: '#9B59B620' },
    { key: 'fee',          label: 'Phí',              icon: 'receipt',                color: '#F6465D', bg: '#F6465D20' },
    { key: 'adjustment',   label: 'Điều chỉnh',       icon: 'tune',                   color: '#64748B', bg: '#64748B20' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
    disbursement: { label: 'Giải ngân',      color: '#0ECB81', icon: 'cash-plus' },
    repayment:    { label: 'Trả nợ',         color: '#F0A500', icon: 'credit-card-check-outline' },
    prepayment:   { label: 'Trả trước hạn',       color: '#9B59B6', icon: 'lightning-bolt' },
    fee:          { label: 'Phí & lãi',            color: '#F6465D', icon: 'receipt' },
    adjustment:   { label: 'Điều chỉnh',    color: '#64748B', icon: 'tune' },
    other:        { label: 'Khác',      color: '#4F8EF7', icon: 'swap-horizontal' },
};

const parseDateKey = (raw?: string) => {
    if (!raw) return 'Khác';
    try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
    } catch { }
    return 'Khác';
};

const parseDateFull = (raw?: string) => {
    if (!raw) return '';
    try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} · ${time}`;
        }
    } catch { }
    return raw;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BNPLTransactionHistoryScreen() {
    const { theme } = useTheme();
    const c = theme.colors;
    const insets = useSafeAreaInsets();

    const [transactions, setTransactions] = useState<BnplTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    const fetchTransactions = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await bnplAPI.getTransactions(200);
            setTransactions(res.transactions || []);
        } catch {
            setTransactions([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTransactions(true);
    }, [fetchTransactions]);

    // Filter counts
    const counts = useMemo(() => {
        const base: Record<FilterType, number> = { all: transactions.length, disbursement: 0, repayment: 0, prepayment: 0, fee: 0, adjustment: 0, other: 0 };
        transactions.forEach(tx => {
            const k = (tx.type || 'other') as FilterType;
            if (k in base) base[k]++;
            else base.other++;
        });
        return base;
    }, [transactions]);

    const filtered = useMemo(() =>
        activeFilter === 'all'
            ? transactions
            : transactions.filter(tx => (tx.type || 'other') === activeFilter),
        [transactions, activeFilter]
    );

    // Group by date
    const grouped = useMemo(() => {
        const map: { date: string; items: BnplTransaction[] }[] = [];
        const keys: Record<string, number> = {};
        filtered.forEach(tx => {
            const key = parseDateKey(tx.date || tx.createdAt);
            if (keys[key] === undefined) {
                keys[key] = map.length;
                map.push({ date: key, items: [] });
            }
            map[keys[key]].items.push(tx);
        });
        return map;
    }, [filtered]);

    // Stats for active filter
    const totalIn = useMemo(() =>
        filtered.filter(tx => tx.type === 'disbursement').reduce((s, t) => s + (t.amount || 0), 0),
        [filtered]);
    const totalOut = useMemo(() =>
        filtered.filter(tx => tx.type !== 'disbursement').reduce((s, t) => s + Math.abs(t.amount || 0), 0),
        [filtered]);

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Lịch sử Ví trả sau" showBack />

            {/* Filter chips */}
            <View style={[styles.filterBar, { borderBottomColor: c.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    {TYPE_FILTERS.map(f => {
                        const active = activeFilter === f.key;
                        return (
                            <TouchableOpacity
                                key={f.key}
                                activeOpacity={0.75}
                                onPress={() => setActiveFilter(f.key)}
                                style={[
                                    styles.chip,
                                    active
                                        ? { backgroundColor: f.bg, borderColor: f.color, borderWidth: 1.5 }
                                        : { backgroundColor: 'transparent', borderColor: c.textPrimary, borderWidth: 1.5 },
                                ]}
                            >
                                <MaterialCommunityIcons name={f.icon as any} size={14} color={active ? f.color : c.textPrimary} style={{ marginRight: 5 }} />
                                <Text style={[styles.chipText, { color: active ? f.color : c.textPrimary, fontWeight: active ? '700' : '500' }]}>
                                    {f.label}
                                </Text>
                                {counts[f.key] > 0 && (
                                    <View style={[styles.chipBadge, { backgroundColor: active ? f.color : c.textPrimary }]}>
                                        <Text style={[styles.chipBadgeText, { color: '#fff' }]}>{counts[f.key]}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Summary row */}
            {!loading && filtered.length > 0 && (
                <View style={[styles.summaryRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                    <View style={styles.summaryStat}>
                        <Text style={[styles.summaryLabel, { color: c.textDim }]}>Tổng giải ngân</Text>
                        <Text style={[styles.summaryValue, { color: '#0ECB81' }]}>+{formatCurrency(totalIn)}</Text>
                    </View>
                    <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
                    <View style={styles.summaryStat}>
                        <Text style={[styles.summaryLabel, { color: c.textDim }]}>Tổng đã trả</Text>
                        <Text style={[styles.summaryValue, { color: '#F6465D' }]}>-{formatCurrency(totalOut)}</Text>
                    </View>
                    <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
                    <View style={styles.summaryStat}>
                        <Text style={[styles.summaryLabel, { color: c.textDim }]}>Số giao dịch</Text>
                        <Text style={[styles.summaryValue, { color: c.textPrimary }]}>{filtered.length}</Text>
                    </View>
                </View>
            )}

            {/* Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={c.primary} />
                    <Text style={[styles.loadingText, { color: c.textDim }]}>Đang tải giao dịch...</Text>
                </View>
            ) : filtered.length === 0 ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="history" size={56} color={c.textDim} />
                    <Text style={[styles.emptyText, { color: c.textDim }]}>Không có giao dịch nào</Text>
                </View>
            ) : (
                <FlatList
                    data={grouped}
                    keyExtractor={item => item.date}
                    contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
                    renderItem={({ item: group }) => (
                        <View style={styles.group}>
                            {/* Date header */}
                            <View style={styles.dateHeaderRow}>
                                <View style={[styles.dateLine, { backgroundColor: c.border }]} />
                                <Text style={[styles.dateHeaderText, { color: c.textDim, backgroundColor: c.background }]}>
                                    {group.date}
                                </Text>
                                <View style={[styles.dateLine, { backgroundColor: c.border }]} />
                            </View>

                            {/* Transactions */}
                            <CommonCard style={styles.groupCard}>
                                {group.items.map((tx, idx) => {
                                    const meta = TYPE_META[tx.type || 'other'] ?? TYPE_META.other;
                                    const isDisbursement = tx.type === 'disbursement';
                                    const amtColor = isDisbursement ? '#0ECB81' : '#F6465D';
                                    const amtPrefix = isDisbursement ? '+' : '-';
                                    const isLast = idx === group.items.length - 1;

                                    return (
                                        <View
                                            key={tx.id || idx}
                                            style={[
                                                styles.txRow,
                                                !isLast && { borderBottomWidth: 1, borderBottomColor: c.border },
                                            ]}
                                        >
                                            {/* Icon */}
                                            <View style={[styles.txIconWrap, { backgroundColor: meta.color + '18' }]}>
                                                <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
                                            </View>

                                            {/* Info */}
                                            <View style={styles.txInfo}>
                                                <Text style={[styles.txTitle, { color: c.textPrimary }]} numberOfLines={1}>
                                                    {tx.description || meta.label}
                                                </Text>
                                                <View style={styles.txMeta}>
                                                    <View style={[styles.txTypePill, { backgroundColor: meta.color + '18' }]}>
                                                        <Text style={[styles.txTypeText, { color: meta.color }]}>{meta.label}</Text>
                                                    </View>
                                                    <Text style={[styles.txTime, { color: c.textDim }]}>
                                                        {parseDateFull(tx.date || tx.createdAt)}
                                                    </Text>
                                                </View>
                                                {tx.fineractLoanId && (
                                                    <Text style={[styles.txLoanRef, { color: c.textDim }]}>
                                                        Khoản vay #{tx.fineractLoanId}
                                                    </Text>
                                                )}
                                            </View>

                                            {/* Amount */}
                                            <Text style={[styles.txAmount, { color: amtColor }]}>
                                                {amtPrefix}{formatCurrency(Math.abs(tx.amount || 0))}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </CommonCard>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Filter bar
    filterBar: { borderBottomWidth: 1, paddingVertical: 10 },
    filterScroll: { paddingHorizontal: 16, gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
    chipText: { fontSize: 13 },
    chipBadge: { marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    chipBadgeText: { fontSize: 10, fontWeight: '700' },

    // Summary
    summaryRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1 },
    summaryStat: { flex: 1, alignItems: 'center' },
    summaryLabel: { fontSize: 11, marginBottom: 3 },
    summaryValue: { fontSize: 13, fontWeight: '700' },
    summaryDivider: { width: 1, marginVertical: 4 },

    // States
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 14 },
    emptyText: { fontSize: 15 },

    // List
    listContent: { padding: 16, gap: 4 },
    group: { marginBottom: 12 },

    // Date header
    dateHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginHorizontal: 4 },
    dateLine: { flex: 1, height: 1 },
    dateHeaderText: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10 },

    // Transaction items
    groupCard: { padding: 0, overflow: 'hidden' },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
    txIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    txInfo: { flex: 1, gap: 4 },
    txTitle: { fontSize: 14, fontWeight: '600' },
    txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    txTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    txTypeText: { fontSize: 10, fontWeight: '700' },
    txTime: { fontSize: 11 },
    txLoanRef: { fontSize: 11 },
    txAmount: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
});
