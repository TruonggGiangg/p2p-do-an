/**
 * LoanBlockedScreen — Dedicated policy violation screen
 * Shows when borrower is blocked from creating new loans due to delinquency policies.
 * NO Alert.alert — full screen UX with contract link and highlighted blocking reason.
 */
import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BinanceHeader, CommonButton, CommonCard } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../shared/utils';

const DEBT_GROUP_META: Record<number, { label: string; severity: string; color: string; icon: string }> = {
    1: { label: 'Nợ cần chú ý', severity: 'Thấp', color: '#F59E0B', icon: 'alert-circle-outline' },
    2: { label: 'Nợ cần chú ý', severity: 'Trung bình', color: '#F97316', icon: 'alert-outline' },
    3: { label: 'Nợ dưới tiêu chuẩn', severity: 'Cao', color: '#EF4444', icon: 'shield-alert-outline' },
    4: { label: 'Nợ nghi ngờ', severity: 'Rất cao', color: '#DC2626', icon: 'shield-off-outline' },
    5: { label: 'Nợ có khả năng mất vốn', severity: 'Nghiêm trọng', color: '#991B1B', icon: 'skull-outline' },
};

interface PolicyFlags {
    blockNewLoan?: boolean;
    freezeAccount?: boolean;
    permanentBan?: boolean;
    applyPenalty?: boolean;
    legalEscalation?: boolean;
    collectionStage?: string;
}

export default function LoanBlockedScreen() {
    const { theme } = useTheme();
    const c = theme.colors;
    const route = useRoute();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const params = (route.params || {}) as {
        debtGroup?: number;
        overdueDays?: number;
        overdueAmount?: number;
        fineractLoanId?: number;
        policy?: PolicyFlags;
        message?: string;
    };

    const debtGroup = params.debtGroup ?? 3;
    const overdueDays = params.overdueDays ?? 0;
    const overdueAmount = params.overdueAmount ?? 0;
    const fineractLoanId = params.fineractLoanId;
    const policy = params.policy ?? {};
    const meta = DEBT_GROUP_META[debtGroup] || DEBT_GROUP_META[3];

    const collectionStageLabel: Record<string, string> = {
        NONE: 'Theo dõi',
        REMINDER: 'Nhắc nợ tự động',
        WARNING: 'Cảnh báo chính thức',
        COLLECTION: 'Chuyển bộ phận thu hồi nợ',
        LEGAL: 'Xử lý pháp lý',
        WRITE_OFF: 'Nợ mất vốn — xóa sổ',
    };

    const enforcementItems: { icon: string; label: string; active: boolean; highlight?: boolean }[] = [
        { icon: 'cash-lock', label: 'Chặn tạo khoản vay mới', active: !!policy.blockNewLoan },
        { icon: 'calculator', label: 'Áp dụng lãi phạt quá hạn', active: !!policy.applyPenalty },
        { icon: 'snowflake', label: 'Đóng băng tài khoản (chỉ cho trả nợ)', active: !!policy.freezeAccount, highlight: true },
        { icon: 'gavel', label: 'Xử lý pháp lý', active: !!policy.legalEscalation, highlight: true },
        { icon: 'cancel', label: 'Cấm vĩnh viễn', active: !!policy.permanentBan, highlight: true },
    ];

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Chặn khoản vay" mode="standard" showBack />

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Warning */}
                <View style={[styles.heroCard, { backgroundColor: meta.color + '12' }]}>
                    <View style={[styles.heroIconWrap, { backgroundColor: meta.color + '20' }]}>
                        <MaterialCommunityIcons name={meta.icon as any} size={40} color={meta.color} />
                    </View>
                    <Text style={[styles.heroTitle, { color: meta.color }]}>
                        Nhóm nợ {debtGroup} — {meta.label}
                    </Text>
                    <Text style={[styles.heroSub, { color: c.textSecondary }]}>
                        Bạn không thể tạo khoản vay mới do vi phạm chính sách nợ quá hạn.
                    </Text>
                </View>

                {/* Overdue Details */}
                <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Chi tiết nợ quá hạn</Text>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Khoản vay</Text>
                        <Text style={[styles.detailValue, { color: c.textPrimary }]}>
                            #{fineractLoanId || '---'}
                        </Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Số ngày quá hạn</Text>
                        <Text style={[styles.detailValue, { color: meta.color, fontWeight: '700' }]}>
                            {overdueDays} ngày
                        </Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Tổng nợ quá hạn</Text>
                        <Text style={[styles.detailValue, { color: meta.color, fontWeight: '700' }]}>
                            {formatCurrency(overdueAmount)}
                        </Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Mức độ nghiêm trọng</Text>
                        <View style={[styles.severityBadge, { backgroundColor: meta.color + '18' }]}>
                            <Text style={[styles.severityText, { color: meta.color }]}>{meta.severity}</Text>
                        </View>
                    </View>
                    {policy.collectionStage && policy.collectionStage !== 'NONE' && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Giai đoạn xử lý</Text>
                            <Text style={[styles.detailValue, { color: meta.color, fontWeight: '600' }]}>
                                {collectionStageLabel[policy.collectionStage] || policy.collectionStage}
                            </Text>
                        </View>
                    )}
                </CommonCard>

                {/* Enforcement Actions */}
                <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Các biện pháp đang áp dụng</Text>

                    {enforcementItems.map((item, idx) => (
                        <View
                            key={idx}
                            style={[
                                styles.enforcementRow,
                                item.active && item.highlight && { backgroundColor: meta.color + '08', borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8 },
                            ]}
                        >
                            <View style={[styles.enforcementIcon, { backgroundColor: item.active ? meta.color + '20' : c.border + '30' }]}>
                                <MaterialCommunityIcons
                                    name={item.icon as any}
                                    size={18}
                                    color={item.active ? meta.color : c.textMuted}
                                />
                            </View>
                            <Text
                                style={[
                                    styles.enforcementLabel,
                                    { color: item.active ? c.textPrimary : c.textMuted },
                                    item.active && item.highlight && { color: meta.color, fontWeight: '700' },
                                ]}
                            >
                                {item.label}
                            </Text>
                            <MaterialCommunityIcons
                                name={item.active ? 'check-circle' : 'minus-circle-outline'}
                                size={20}
                                color={item.active ? meta.color : c.border}
                            />
                        </View>
                    ))}
                </CommonCard>

                {/* What to do */}
                <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Cách khắc phục</Text>
                    <View style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: c.primary + '15' }]}>
                            <Text style={[styles.stepNumText, { color: c.primary }]}>1</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>
                            Thanh toán toàn bộ nợ quá hạn ({formatCurrency(overdueAmount)})
                        </Text>
                    </View>
                    <View style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: c.primary + '15' }]}>
                            <Text style={[styles.stepNumText, { color: c.primary }]}>2</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>
                            Chờ hệ thống cập nhật trạng thái nợ (tự động mỗi đêm 0h)
                        </Text>
                    </View>
                    <View style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: c.primary + '15' }]}>
                            <Text style={[styles.stepNumText, { color: c.primary }]}>3</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>
                            Sau khi hết nợ quá hạn, bạn có thể tạo khoản vay mới
                        </Text>
                    </View>
                </CommonCard>
            </ScrollView>

            {/* Bottom CTA */}
            <View style={[styles.bottomBar, { backgroundColor: c.background, paddingBottom: insets.bottom + 12 }]}>
                {fineractLoanId ? (
                    <CommonButton
                        title="Trả nợ ngay"
                        variant="primary"
                        size="lg"
                        fullWidth
                        onPress={() => navigation.navigate('LoanDetail', { loanId: undefined, fineractLoanId })}
                    />
                ) : (
                    <CommonButton
                        title="Về trang chủ"
                        variant="primary"
                        size="lg"
                        fullWidth
                        onPress={() => navigation.navigate('Main')}
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 16, paddingTop: 8 },
    heroCard: {
        borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 16,
    },
    heroIconWrap: {
        width: 72, height: 72, borderRadius: 36,
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    heroTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
    heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
    card: { borderRadius: 16, padding: 18, marginBottom: 12 },
    sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
    detailRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000010',
    },
    detailLabel: { fontSize: 13 },
    detailValue: { fontSize: 13, fontWeight: '600' },
    severityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    severityText: { fontSize: 12, fontWeight: '700' },
    enforcementRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    },
    enforcementIcon: {
        width: 34, height: 34, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center',
    },
    enforcementLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
    stepNum: {
        width: 28, height: 28, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
    },
    stepNumText: { fontSize: 13, fontWeight: '700' },
    stepText: { flex: 1, fontSize: 13, lineHeight: 20, paddingTop: 4 },
    bottomBar: {
        paddingHorizontal: 16, paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#00000010',
    },
});
