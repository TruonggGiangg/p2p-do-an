/**
 * RepaymentScreen - Make loan payments (Dark Theme)
 * Refactored with Common Components
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { loanApi, repaymentApi } from '../../services';
import { FineractLoanDetails } from '../../types';
import { DarkColors, DarkStyling } from '../../theme';
import {
    ScreenContainer,
    PageHeader,
    GlassInput,
    GlassDatePicker,
    InfoRow
} from '../../components/common';
import { GlowButton } from '../../components/glow';

// Format currency
const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('vi-VN').format(value);
};

export default function RepaymentScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { loanId, contractId, isPrepay } = route.params || {};

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [amount, setAmount] = useState('');
    const [transactionDate, setTransactionDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [note, setNote] = useState('');
    const [loanDetails, setLoanDetails] = useState<FineractLoanDetails | null>(null);
    const [prepayInfo, setPrepayInfo] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, [loanId, contractId]);

    const loadData = async () => {
        try {
            setLoading(true);
            const id = loanId || contractId;

            const details = await loanApi.getFineractDetails(id);
            setLoanDetails(details);

            if (isPrepay) {
                const prepay = await loanApi.getPrepayAmount(String(details.fineractLoanId));
                setPrepayInfo(prepay);
                setAmount(prepay.amount.toString());
            }
        } catch (error: any) {
            Alert.alert('Lỗi', 'Không thể tải thông tin: ' + error.message);
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setTransactionDate(selectedDate);
        }
    };

    const handleSubmit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }

        if (!loanDetails?.fineractLoanId) return;

        try {
            setSubmitting(true);
            const numAmount = parseFloat(amount.replace(/[^0-9]/g, ''));

            if (isPrepay) {
                // For prepay, still use loanApi
                const dateStr = transactionDate.toISOString().split('T')[0];
                await loanApi.prepayLoan({
                    loanId: loanDetails.contractId || String(loanDetails.fineractLoanId), // ✅ Add loanId for server
                    fineractLoanId: loanDetails.fineractLoanId,
                    transactionAmount: numAmount,
                    transactionDate: dateStr,
                    note: note,
                });
                Alert.alert('Thành công', 'Tất toán khoản vay thành công!', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                // Use new repayment API that handles distribution automatically
                await repaymentApi.makeRepayment({
                    loanId: loanDetails.contractId || String(loanDetails.fineractLoanId),
                    amount: numAmount,
                });
                Alert.alert('Thành công', 'Thanh toán thành công! Số tiền đã được phân phối tới các nhà đầu tư.', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error: any) {
            Alert.alert('Lỗi thanh toán', error.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScreenContainer scrollable>
            <PageHeader
                title={isPrepay ? 'Tất toán sớm' : 'Thanh toán'}
                subtitle={`Khoản vay #${loanDetails?.fineractLoanId || '...'}`}
            />

            <View style={styles.content}>
                {/* Header Icon */}
                <View style={styles.iconWrapper}>
                    <View style={[styles.headerIcon, { backgroundColor: isPrepay ? `${DarkColors.warning}20` : `${DarkColors.primary}20` }]}>
                        <MaterialCommunityIcons
                            name={isPrepay ? 'lightning-bolt' : 'cash'}
                            size={32}
                            color={isPrepay ? DarkColors.warning : DarkColors.primary}
                        />
                    </View>
                </View>

                {/* Prepay Info Card */}
                {isPrepay && prepayInfo && (
                    <BlurView intensity={20} tint="dark" style={styles.glassCard}>
                        <LinearGradient
                            colors={['rgba(255,165,2,0.1)', 'rgba(255,165,2,0.02)']}
                            style={styles.cardGradient}
                        >
                            <View style={styles.cardHeader}>
                                <MaterialCommunityIcons name="calculator" size={20} color={DarkColors.warning} />
                                <Text style={styles.cardTitle}>Chi tiết tất toán</Text>
                            </View>

                            <InfoRow label="Gốc còn lại" value={`${formatCurrency(prepayInfo.principalPortion)}₫`} />
                            <InfoRow label="Lãi phải trả" value={`${formatCurrency(prepayInfo.interestPortion)}₫`} />
                            <InfoRow
                                label="Phí & Phạt"
                                value={`${formatCurrency((prepayInfo.feeChargesPortion || 0) + (prepayInfo.penaltyChargesPortion || 0))}₫`}
                            />

                            <View style={styles.divider} />

                            <InfoRow
                                label="Tổng cộng"
                                value={`${formatCurrency(prepayInfo.amount)}₫`}
                                valueColor={DarkColors.warning}
                                style={{ paddingBottom: 0 }}
                            />
                        </LinearGradient>
                    </BlurView>
                )}

                {/* Payment Form */}
                <BlurView intensity={20} tint="dark" style={styles.glassCard}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                        style={styles.cardGradient}
                    >
                        <GlassInput
                            label="Số tiền thanh toán (VND)"
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            placeholder="0"
                            icon="cash-multiple"
                            editable={!loading && !submitting}
                        />
                        {isPrepay && (
                            <Text style={styles.hint}>
                                <MaterialCommunityIcons name="information" size={14} color={DarkColors.textSecondary} />
                                {' '}Số tiền được tính toán chính xác để đóng khoản vay
                            </Text>
                        )}

                        <GlassDatePicker
                            label="Ngày thanh toán"
                            value={transactionDate}
                            onPress={() => setShowDatePicker(true)}
                        />
                        {showDatePicker && (
                            <DateTimePicker
                                value={transactionDate}
                                mode="date"
                                display="default"
                                onChange={handleDateChange}
                            />
                        )}

                        <GlassInput
                            label="Ghi chú"
                            value={note}
                            onChangeText={setNote}
                            placeholder="Nhập ghi chú giao dịch..."
                            multiline
                            style={{ minHeight: 80, height: 'auto', textAlignVertical: 'top', paddingTop: 12 }}
                            icon="text-box-outline"
                        />
                    </LinearGradient>
                </BlurView>

                <View style={styles.footer}>
                    <GlowButton
                        title={isPrepay ? 'XÁC NHẬN TẤT TOÁN' : 'XÁC NHẬN THANH TOÁN'}
                        onPress={handleSubmit}
                        loading={submitting}
                        disabled={submitting}
                        icon="check-circle"
                        gradientColors={isPrepay ? ['#FFA502', '#FF6348'] : undefined}
                        style={{ marginTop: 12 }}
                    />
                </View>
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 20,
    },
    iconWrapper: {
        alignItems: 'center',
        marginBottom: 24,
    },
    headerIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        ...DarkStyling.shadow.glow,
    },
    glassCard: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        marginBottom: 20,
    },
    cardGradient: {
        padding: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: DarkColors.text,
        fontFamily: 'Poppins_600SemiBold',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 12,
    },
    hint: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        marginTop: -8,
        marginBottom: 16,
        fontStyle: 'italic',
        paddingHorizontal: 4,
    },
    footer: {
        marginBottom: 40,
    }
});
