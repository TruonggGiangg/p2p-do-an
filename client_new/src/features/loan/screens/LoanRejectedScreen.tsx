/**
 * LoanRejectedScreen — Hiển thị khi đơn vay bị AI từ chối tự động (auto_rejected).
 * Show: hạng tín dụng, điểm, lý do từ chối (rule-based) + điểm mạnh hồ sơ.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BinanceHeader, CommonButton, CommonCard } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';

const RISK_META: Record<string, { label: string; color: string; icon: string }> = {
    LOW: { label: 'Rủi ro thấp', color: '#10B981', icon: 'shield-check-outline' },
    MEDIUM: { label: 'Rủi ro trung bình', color: '#F59E0B', icon: 'shield-alert-outline' },
    HIGH: { label: 'Rủi ro cao', color: '#EF4444', icon: 'shield-alert' },
    VERY_HIGH: { label: 'Rủi ro rất cao', color: '#991B1B', icon: 'shield-off-outline' },
};

export default function LoanRejectedScreen() {
    const { theme } = useTheme();
    const c = theme.colors;
    const route = useRoute();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const params = (route.params || {}) as {
        message?: string;
        evaluationScore?: number;
        grade?: string;
        subGrade?: string;
        riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
        modelDecision?: string;
        decisionExplanation?: string;
        riskFactors?: string[];
        positiveFactors?: string[];
    };

    const meta = RISK_META[params.riskLevel || 'VERY_HIGH'] || RISK_META.VERY_HIGH;
    const score = params.evaluationScore ?? 0;
    const riskFactors = params.riskFactors || [];
    const positiveFactors = params.positiveFactors || [];

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader title="Khoản vay bị từ chối" mode="standard" showBack />

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <View style={[styles.heroCard, { backgroundColor: meta.color + '12' }]}>
                    <View style={[styles.heroIconWrap, { backgroundColor: meta.color + '20' }]}>
                        <MaterialCommunityIcons name={meta.icon as any} size={40} color={meta.color} />
                    </View>
                    <Text style={[styles.heroTitle, { color: meta.color }]}>
                        Tự động từ chối — {meta.label}
                    </Text>
                    <Text style={[styles.heroSub, { color: c.textSecondary }]}>
                        {params.message || 'Hồ sơ chưa đáp ứng tiêu chí phê duyệt tự động của hệ thống.'}
                    </Text>
                </View>

                {/* Score & Grade */}
                <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Kết quả đánh giá AI</Text>

                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Điểm đánh giá</Text>
                        <Text style={[styles.detailValue, { color: meta.color }]}>{score}/100</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Hạng tín dụng</Text>
                        <Text style={[styles.detailValue, { color: c.textPrimary }]}>
                            {params.grade || 'N/A'}{params.subGrade ? ` — ${params.subGrade}` : ''}
                        </Text>
                    </View>
                    <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.detailLabel, { color: c.textSecondary }]}>Mức rủi ro</Text>
                        <View style={[styles.severityBadge, { backgroundColor: meta.color + '20' }]}>
                            <Text style={[styles.severityText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                    </View>

                    {!!params.decisionExplanation && (
                        <View style={[styles.explainBox, { backgroundColor: c.background }]}>
                            <Text style={[styles.explainText, { color: c.textSecondary }]}>
                                {params.decisionExplanation}
                            </Text>
                        </View>
                    )}
                </CommonCard>

                {/* Risk Factors */}
                {riskFactors.length > 0 && (
                    <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                            Lý do bị từ chối
                        </Text>
                        {riskFactors.map((reason, idx) => (
                            <View key={idx} style={styles.reasonRow}>
                                <MaterialCommunityIcons
                                    name="close-circle"
                                    size={18}
                                    color="#EF4444"
                                    style={styles.reasonIcon}
                                />
                                <Text style={[styles.reasonText, { color: c.textPrimary }]}>{reason}</Text>
                            </View>
                        ))}
                    </CommonCard>
                )}

                {/* Positive Factors */}
                {positiveFactors.length > 0 && (
                    <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                            Điểm mạnh hồ sơ
                        </Text>
                        {positiveFactors.map((reason, idx) => (
                            <View key={idx} style={styles.reasonRow}>
                                <MaterialCommunityIcons
                                    name="check-circle"
                                    size={18}
                                    color="#10B981"
                                    style={styles.reasonIcon}
                                />
                                <Text style={[styles.reasonText, { color: c.textPrimary }]}>{reason}</Text>
                            </View>
                        ))}
                    </CommonCard>
                )}

                {/* Suggestions */}
                <CommonCard style={[styles.card, { backgroundColor: c.surface }]}>
                    <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                        Hướng dẫn cải thiện
                    </Text>
                    <View style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: meta.color + '20' }]}>
                            <Text style={[styles.stepNumText, { color: meta.color }]}>1</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>
                            Bổ sung/cập nhật thu nhập, kinh nghiệm làm việc và giấy tờ chứng minh tài chính.
                        </Text>
                    </View>
                    <View style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: meta.color + '20' }]}>
                            <Text style={[styles.stepNumText, { color: meta.color }]}>2</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>
                            Giảm số tiền vay hoặc kéo dài kỳ hạn để giảm tỷ lệ nợ trên thu nhập.
                        </Text>
                    </View>
                    <View style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: meta.color + '20' }]}>
                            <Text style={[styles.stepNumText, { color: meta.color }]}>3</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>
                            Thanh toán đúng hạn các khoản vay hiện hành để cải thiện điểm tín dụng nội bộ.
                        </Text>
                    </View>
                </CommonCard>
            </ScrollView>

            <View style={[styles.bottomBar, { backgroundColor: c.background, paddingBottom: insets.bottom + 12 }]}>
                <CommonButton
                    title="Về trang chủ"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={() => navigation.navigate('Main')}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 16, paddingTop: 8 },
    heroCard: { borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 16 },
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
    detailValue: { fontSize: 13, fontWeight: '700' },
    severityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    severityText: { fontSize: 12, fontWeight: '700' },
    explainBox: { marginTop: 12, padding: 12, borderRadius: 10 },
    explainText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
    reasonRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
    reasonIcon: { marginRight: 10, marginTop: 1 },
    reasonText: { flex: 1, fontSize: 13, lineHeight: 19 },
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
