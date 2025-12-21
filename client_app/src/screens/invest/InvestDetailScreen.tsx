import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { investApi, AvailableLoan } from '../../services/invest';
import { DarkColors, DarkStyling } from '../../theme';

type RouteParams = {
    InvestDetail: { loan: AvailableLoan };
};

/**
 * InvestDetailScreen - Loan details and investment form (Dark Theme)
 */
export default function InvestDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<RouteParams, 'InvestDetail'>>();
    const { loan } = route.params;

    const noteValue = 100000; // 100k VND per note
    const [numNotes, setNumNotes] = useState('1');
    const [loading, setLoading] = useState(false);

    const investmentAmount = parseInt(numNotes || '0') * noteValue;
    const monthlyRate = loan.info.rate || 1.5;
    const periodMonth = loan.info.periodMonth || 6;
    const monthlyInterest = (investmentAmount * monthlyRate) / 100;
    const totalProfit = monthlyInterest * periodMonth;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    const handleInvest = async () => {
        const notes = parseInt(numNotes);
        if (!notes || notes < 1) {
            Alert.alert('Lỗi', 'Vui lòng nhập số notes hợp lệ');
            return;
        }

        if (notes > loan.availableNotes) {
            Alert.alert('Lỗi', `Chỉ còn ${loan.availableNotes} notes có thể đầu tư`);
            return;
        }

        Alert.alert(
            'Xác nhận đầu tư',
            `Bạn có muốn đầu tư ${formatCurrency(investmentAmount)}₫ vào khoản vay này?\n\nLợi nhuận dự kiến: ${formatCurrency(totalProfit)}₫`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xác nhận',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await investApi.createInvestment({
                                loanContractId: loan.contractId,
                                capital: investmentAmount,
                                numNotes: notes,
                            });
                            Alert.alert('Thành công', 'Đầu tư thành công!', [
                                { text: 'OK', onPress: () => navigation.goBack() },
                            ]);
                        } catch (error: any) {
                            Alert.alert('Lỗi', error.message || 'Không thể tạo đầu tư');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={DarkColors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Loan Info Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="file-document-outline" size={24} color={DarkColors.primary} />
                        <Text style={styles.cardTitle}>Thông tin khoản vay</Text>
                    </View>

                    <View style={styles.infoGrid}>
                        <InfoItem label="Mã hợp đồng" value={loan.contractId} />
                        <InfoItem label="Số tiền vay" value={`${formatCurrency(loan.info.capital)}₫`} />
                        <InfoItem label="Lãi suất" value={`${loan.info.rate}%/tháng`} highlight />
                        <InfoItem label="Thời hạn" value={`${loan.info.periodMonth} tháng`} />
                        <InfoItem label="Mục đích" value={loan.info.willing || 'Không xác định'} fullWidth />
                    </View>

                    {/* Progress */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Tiến độ gọi vốn</Text>
                            <Text style={styles.progressPercent}>{loan.fundedPercentage}%</Text>
                        </View>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${loan.fundedPercentage}%` }]} />
                        </View>
                        <Text style={styles.progressDetail}>
                            {loan.investedNotes}/{loan.totalNotes} notes • Còn {formatCurrency(loan.availableAmount)}₫
                        </Text>
                    </View>
                </View>

                {/* Investment Form Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="cash-plus" size={24} color={DarkColors.success} />
                        <Text style={styles.cardTitle}>Đầu tư</Text>
                    </View>

                    <Text style={styles.inputLabel}>
                        Số notes muốn mua (1 note = {formatCurrency(noteValue)}₫)
                    </Text>

                    <View style={styles.inputContainer}>
                        <TouchableOpacity
                            style={styles.adjustButton}
                            onPress={() => setNumNotes(Math.max(1, parseInt(numNotes || '0') - 1).toString())}
                        >
                            <MaterialCommunityIcons name="minus" size={24} color={DarkColors.text} />
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            value={numNotes}
                            onChangeText={setNumNotes}
                            keyboardType="numeric"
                            textAlign="center"
                            placeholderTextColor={DarkColors.textMuted}
                        />
                        <TouchableOpacity
                            style={styles.adjustButton}
                            onPress={() => setNumNotes(Math.min(loan.availableNotes, parseInt(numNotes || '0') + 1).toString())}
                        >
                            <MaterialCommunityIcons name="plus" size={24} color={DarkColors.text} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.maxNotes}>Tối đa: {loan.availableNotes} notes</Text>

                    {/* Summary */}
                    <View style={styles.summary}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Số tiền đầu tư</Text>
                            <Text style={styles.summaryValue}>{formatCurrency(investmentAmount)}₫</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Thu nhập/tháng (dự kiến)</Text>
                            <Text style={[styles.summaryValue, { color: DarkColors.success }]}>
                                +{formatCurrency(monthlyInterest)}₫
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Tổng lợi nhuận (dự kiến)</Text>
                            <Text style={[styles.summaryValue, { color: DarkColors.primary }]}>
                                {formatCurrency(totalProfit)}₫
                            </Text>
                        </View>
                    </View>

                    {/* Invest Button */}
                    <TouchableOpacity
                        onPress={handleInvest}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={loading ? [DarkColors.textMuted, DarkColors.textMuted] : ['#4347FF', '#6366F1'] as const}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.investButton}
                        >
                            {loading ? (
                                <ActivityIndicator color={DarkColors.white} />
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="check-circle" size={20} color={DarkColors.white} />
                                    <Text style={styles.investButtonText}>Xác nhận đầu tư</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

interface InfoItemProps {
    label: string;
    value: string;
    highlight?: boolean;
    fullWidth?: boolean;
}

function InfoItem({ label, value, highlight, fullWidth }: InfoItemProps) {
    return (
        <View style={[styles.infoItem, fullWidth && styles.infoItemFull]}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, highlight && { color: DarkColors.success }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    // Card
    card: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: DarkColors.text,
    },
    // Info Grid
    infoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
    },
    infoItem: {
        width: '50%',
        paddingHorizontal: 6,
        marginBottom: 16,
    },
    infoItemFull: {
        width: '100%',
    },
    infoLabel: {
        fontSize: 13,
        color: DarkColors.textSecondary,
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 15,
        fontWeight: '600',
        color: DarkColors.text,
    },
    // Progress
    progressSection: {
        marginTop: 8,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    progressLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    progressPercent: {
        fontSize: 14,
        fontWeight: '600',
        color: DarkColors.success,
    },
    progressBar: {
        height: 8,
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: DarkColors.success,
        borderRadius: 4,
    },
    progressDetail: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 8,
    },
    // Input
    inputLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        marginBottom: 12,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    adjustButton: {
        width: 52,
        height: 52,
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    input: {
        flex: 1,
        height: 52,
        fontSize: 24,
        fontWeight: '700',
        color: DarkColors.text,
        marginHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: DarkColors.primary,
    },
    maxNotes: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: 10,
        textAlign: 'center',
    },
    // Summary
    summary: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: DarkColors.border,
        gap: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryLabel: {
        fontSize: 14,
        color: DarkColors.textSecondary,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: '700',
        color: DarkColors.text,
    },
    // Button
    investButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: DarkStyling.borderRadius.sm,
        marginTop: 20,
        gap: 8,
    },
    investButtonText: {
        color: DarkColors.white,
        fontSize: 16,
        fontWeight: '600',
    },
});
