import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import type { BnplLoan } from '../api/bnpl.api';

type RouteParams = { loans: BnplLoan[] };
type FilterKey = 'all' | 'active' | 'closed' | 'pending';

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
    { key: 'all',     label: 'Tất cả',     icon: 'view-list' },
    { key: 'active',  label: 'Đang vay',   icon: 'clock-outline' },
    { key: 'closed',  label: 'Đã tất toán', icon: 'check-circle-outline' },
    { key: 'pending', label: 'Chờ duyệt',  icon: 'timer-sand' },
];

export default function BNPLLoanListScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { loans = [] } = (route.params || {}) as RouteParams;
    const c = theme.colors;

    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const counts = useMemo(() => ({
        all:     loans.length,
        active:  loans.filter(l => l.status.toLowerCase() === 'active').length,
        closed:  loans.filter(l => l.status.toLowerCase() === 'closed').length,
        pending: loans.filter(l => l.status.toLowerCase() === 'pending').length,
    }), [loans]);

    const filtered = useMemo(() =>
        activeFilter === 'all'
            ? loans
            : loans.filter(l => l.status.toLowerCase() === activeFilter),
        [loans, activeFilter]
    );

    const getStatusMeta = (status: string) => {
        switch (status.toLowerCase()) {
            case 'active':
                return { label: 'Đang vay', bg: c.successGlass, color: c.success };
            case 'closed':
                return { label: 'Đã tất toán', bg: '#0ECB8120', color: '#0ECB81' };
            case 'pending':
                return { label: 'Chờ duyệt', bg: c.warningGlass, color: c.warning };
            default:
                return { label: status, bg: c.glassLight, color: c.textSecondary };
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Danh sách khoản vay" showBack />

            {/* Filter tabs */}
            <View style={[styles.filterWrapper, { borderBottomColor: c.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    {FILTERS.map(f => {
                        const isActive = activeFilter === f.key;
                        return (
                            <TouchableOpacity
                                key={f.key}
                                activeOpacity={0.75}
                                onPress={() => setActiveFilter(f.key)}
                                style={[
                                    styles.filterTab,
                                    isActive && { backgroundColor: c.primary + '22', borderColor: c.primary },
                                    !isActive && { borderColor: c.border },
                                ]}
                            >
                                <MaterialCommunityIcons
                                    name={f.icon as any}
                                    size={15}
                                    color={isActive ? c.primary : c.textDim}
                                    style={{ marginRight: 5 }}
                                />
                                <Text style={[styles.filterTabText, { color: isActive ? c.primary : c.textDim }]}>
                                    {f.label}
                                </Text>
                                {counts[f.key] > 0 && (
                                    <View style={[styles.badge, { backgroundColor: isActive ? c.primary : c.border }]}>
                                        <Text style={[styles.badgeText, { color: isActive ? '#fff' : c.textDim }]}>
                                            {counts[f.key]}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {filtered.length === 0 ? (
                <View style={styles.empty}>
                    <MaterialCommunityIcons name="file-document-outline" size={56} color={c.textDim} />
                    <Text style={[styles.emptyText, { color: c.textDim }]}>
                        {activeFilter === 'all' ? 'Chưa có khoản vay nào' : `Không có khoản vay "${FILTERS.find(f => f.key === activeFilter)?.label}"`}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => {
                        const meta = getStatusMeta(item.status);
                        const paid = (item.totalRepayment - item.outstandingBalance);
                        const paidPct = item.totalRepayment > 0 ? Math.min((paid / item.totalRepayment) * 100, 100) : 0;
                        return (
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => navigation.navigate('BNPLLoanDetail', { loan: item })}
                            >
                                <CommonCard style={styles.card}>
                                    <View style={styles.cardTop}>
                                        <View>
                                            <Text style={[styles.loanId, { color: c.textDim }]}>#{item.fineractLoanId}</Text>
                                            <Text style={[styles.amount, { color: c.textPrimary }]}>
                                                {formatCurrency(item.principal)}
                                            </Text>
                                        </View>
                                        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                                            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                                        </View>
                                    </View>

                                    {/* Progress bar */}
                                    <View style={[styles.progressBg, { backgroundColor: c.border }]}>
                                        <View
                                            style={[styles.progressFill, {
                                                width: `${paidPct}%` as any,
                                                backgroundColor: item.status === 'closed' ? '#0ECB81' : c.primary,
                                            }]}
                                        />
                                    </View>
                                    <View style={styles.progressRow}>
                                        <Text style={[styles.progressLabel, { color: c.textDim }]}>
                                            Đã trả: {formatCurrency(item.paidAmount ?? paid)}
                                        </Text>
                                        <Text style={[styles.progressLabel, { color: c.textDim }]}>
                                            Còn lại: {formatCurrency(item.outstandingBalance)}
                                        </Text>
                                    </View>

                                    <View style={[styles.row, { marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }]}>
                                        <Text style={[styles.meta, { color: c.textDim }]}>
                                            {item.numberOfRepayments} kỳ · {item.description || 'BNPL'}
                                        </Text>
                                        <MaterialCommunityIcons name="chevron-right" size={18} color={c.textDim} />
                                    </View>
                                </CommonCard>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    filterWrapper: { borderBottomWidth: 1, paddingVertical: 10 },
    filterScroll: { paddingHorizontal: 16, gap: 8 },
    filterTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    filterTabText: { fontSize: 13, fontWeight: '600' },
    badge: {
        marginLeft: 6,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { fontSize: 10, fontWeight: '700' },
    list: { padding: 16, gap: 12, paddingBottom: 40 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15 },
    card: { padding: 18 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
    loanId: { fontSize: 12, marginBottom: 4 },
    amount: { fontSize: 22, fontWeight: '700' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    statusText: { fontSize: 12, fontWeight: '700' },
    progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    progressLabel: { fontSize: 11 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    meta: { fontSize: 12 },
});
