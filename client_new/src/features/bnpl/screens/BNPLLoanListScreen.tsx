import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BinanceHeader, CommonCard, VentoUltimateLoading } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';
import type { BnplLoan } from '../api/bnpl.api';

type RouteParams = { loans: BnplLoan[] };

export default function BNPLLoanListScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<any>();
    const route = useRoute();
    const { loans = [] } = (route.params || {}) as RouteParams;
    const c = theme.colors;

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
            {loans.length === 0 ? (
                <View style={styles.empty}>
                    <MaterialCommunityIcons name="file-document-outline" size={56} color={c.textDim} />
                    <Text style={[styles.emptyText, { color: c.textDim }]}>Chưa có khoản vay nào</Text>
                </View>
            ) : (
                <FlatList
                    data={loans}
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

                                    {/* Progress */}
                                    <View style={[styles.progressBg, { backgroundColor: c.border }]}>
                                        <View
                                            style={[styles.progressFill, {
                                                width: `${paidPct}%`,
                                                backgroundColor: item.status === 'closed' ? '#0ECB81' : c.primary,
                                            }]}
                                        />
                                    </View>
                                    <View style={styles.progressRow}>
                                        <Text style={[styles.progressLabel, { color: c.textDim }]}>
                                            Đã trả: {formatCurrency(item.paidAmount)}
                                        </Text>
                                        <Text style={[styles.progressLabel, { color: c.textDim }]}>
                                            Còn: {formatCurrency(item.outstandingBalance)}
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
