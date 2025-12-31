/**
 * LoanCreateScreen - Fintech Calculator UI
 */

import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loanApi } from '../../services';
import {
    CheckRateRequest,
    CreateLoanRequest,
    RateCheckResponse,
    LOAN_WILLINGS,
    LOAN_PERIODS,
} from '../../types';
import { CreditRejectionModal } from '../../components/CreditRejectionModal';
import { GradientBackground, GlassCard, GlassTokens } from '../../components/glass';

// Format helpers
const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const parseNumber = (str: string): number => parseInt(str.replace(/,/g, ''), 10) || 0;
const formatDate = (date: Date): string => date.toISOString().split('T')[0];

export default function LoanCreateScreen({ navigation }: any) {
    useLayoutEffect(() => {
        navigation.setOptions({ headerShown: false });
    }, [navigation]);

    const [capital, setCapital] = useState<string>('10,000,000');
    const [periodMonth, setPeriodMonth] = useState<number>(12);
    const [willing, setWilling] = useState<string>(LOAN_WILLINGS[0]);
    const [disbursementDate] = useState<Date>(new Date(Date.now() + 86400000)); // Tomorrow

    const [ratePreview, setRatePreview] = useState<RateCheckResponse | null>(null);
    const [loadingRate, setLoadingRate] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [rejectionVisible, setRejectionVisible] = useState(false);
    const [rejectionData, setRejectionData] = useState<any>(null);

    const handleCheckRate = useCallback(async () => {
        const capitalValue = parseNumber(capital);
        if (!capitalValue || capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay tối thiểu là 1,000,000 đ');
            return;
        }

        try {
            setLoadingRate(true);
            const request: CheckRateRequest = {
                capital: capitalValue,
                periodMonth,
                disbursementDate: formatDate(disbursementDate),
            };
            const result = await loanApi.checkRate(request);
            setRatePreview(result);
        } catch (error: any) {
            Alert.alert('Lỗi', error.message || 'Không thể kiểm tra lãi suất');
        } finally {
            setLoadingRate(false);
        }
    }, [capital, periodMonth, disbursementDate]);

    const handleSubmit = useCallback(async () => {
        const capitalValue = parseNumber(capital);
        if (!capitalValue || capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay tối thiểu là 1,000,000 đ');
            return;
        }

        try {
            setSubmitting(true);
            const request: CreateLoanRequest = {
                capital: capitalValue,
                periodMonth,
                willing,
                disbursementDate: formatDate(disbursementDate),
            };

            const result = await loanApi.createLoan(request);

            Alert.alert(
                'Thành công!',
                'Hồ sơ vay đã được tạo thành công.',
                [{ text: 'Về trang chủ', onPress: () => navigation.goBack() }]
            );
        } catch (error: any) {
            if (error.status === 400 && error.data?.creditScore) {
                setRejectionData(error.data);
                setRejectionVisible(true);
            } else {
                Alert.alert('Lỗi', error.message || 'Không thể tạo khoản vay');
            }
        } finally {
            setSubmitting(false);
        }
    }, [capital, periodMonth, willing, disbursementDate, navigation]);

    return (
        <GradientBackground>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <Ionicons name="close" size={24} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Khoản vay mới</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Amount Input (Calculator Style) */}
                    <View style={styles.amountContainer}>
                        <Text style={styles.inputLabel}>Bạn muốn vay bao nhiêu?</Text>
                        <View style={styles.amountInputWrapper}>
                            <TextInput
                                value={capital}
                                onChangeText={(val) => {
                                    const num = parseNumber(val);
                                    setCapital(formatNumber(num));
                                    setRatePreview(null); // Reset preview on change
                                }}
                                keyboardType="numeric"
                                style={styles.amountInput}
                                placeholder="0"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                            <Text style={styles.currency}>₫</Text>
                        </View>
                        <Text style={styles.limitText}>Hạn mức tối đa: 100,000,000 đ</Text>
                    </View>

                    {/* Term Selector */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Kỳ hạn vay</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
                            {LOAN_PERIODS.map((item) => (
                                <TouchableOpacity
                                    key={item.value}
                                    onPress={() => {
                                        setPeriodMonth(item.value);
                                        setRatePreview(null);
                                    }}
                                    style={[
                                        styles.pill,
                                        periodMonth === item.value && styles.pillActive
                                    ]}
                                >
                                    <Text style={[
                                        styles.pillText,
                                        periodMonth === item.value && styles.pillTextActive
                                    ]}>
                                        {item.value} tháng
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Purpose Selector */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Mục đích vay</Text>
                        <View style={styles.gridContainer}>
                            {LOAN_WILLINGS.slice(0, 6).map((item) => (
                                <TouchableOpacity
                                    key={item}
                                    onPress={() => setWilling(item)}
                                    style={[
                                        styles.gridItem,
                                        willing === item && styles.gridItemActive
                                    ]}
                                >
                                    <Text style={[
                                        styles.gridText,
                                        willing === item && styles.gridTextActive
                                    ]}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Rate Result Ticket */}
                    {ratePreview ? (
                        <GlassCard blur={GlassTokens.blur.medium} style={styles.ticketCard}>
                            <View style={styles.ticketHeader}>
                                <Text style={styles.ticketLabel}>Dự tính trả hàng tháng</Text>
                                <Text style={styles.ticketAmount}>{formatNumber(ratePreview.monthlyPay)} ₫</Text>
                            </View>
                            <View style={styles.dashedLine} />
                            <View style={styles.ticketRow}>
                                <Text style={styles.ticketRowLabel}>Lãi suất</Text>
                                <Text style={styles.ticketRowValue}>{ratePreview.rate.toFixed(2)}% / tháng</Text>
                            </View>
                            <View style={styles.ticketRow}>
                                <Text style={styles.ticketRowLabel}>Tổng lãi dự kiến</Text>
                                <Text style={styles.ticketRowValue}>{formatNumber(ratePreview.entirelyPay - parseNumber(capital))} ₫</Text>
                            </View>
                            <View style={styles.ticketRow}>
                                <Text style={styles.ticketRowLabel}>Tổng thanh toán</Text>
                                <Text style={styles.ticketRowValue}>{formatNumber(ratePreview.entirelyPay)} ₫</Text>
                            </View>
                        </GlassCard>
                    ) : (
                        <TouchableOpacity
                            style={styles.checkRateButton}
                            onPress={handleCheckRate}
                            disabled={loadingRate}
                        >
                            {loadingRate ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.checkRateText}>Tính toán khoản vay</Text>
                            )}
                        </TouchableOpacity>
                    )}

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Footer Submit */}
                {ratePreview && (
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.submitButton}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <LinearGradient
                                    colors={['#3B82F6', '#2563EB']}
                                    style={styles.submitGradient}
                                >
                                    <Text style={styles.submitText}>Xác nhận vay ngay</Text>
                                    <Ionicons name="arrow-forward" size={20} color="white" />
                                </LinearGradient>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </KeyboardAvoidingView>

            {rejectionData && (
                <CreditRejectionModal
                    visible={rejectionVisible}
                    onClose={() => setRejectionVisible(false)}
                    creditData={rejectionData}
                />
            )}
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingHorizontal: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 50,
        paddingBottom: 20,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'white',
    },

    // Amount Input
    amountContainer: {
        alignItems: 'center',
        marginVertical: 20,
    },
    inputLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 10,
    },
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    amountInput: {
        fontSize: 40,
        fontWeight: '700',
        color: 'white',
        textAlign: 'center',
        minWidth: 100,
    },
    currency: {
        fontSize: 24,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        marginLeft: 8,
        marginTop: 10,
    },
    limitText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
    },

    // Sections
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
        marginBottom: 12,
    },
    pillsContainer: {
        gap: 10,
    },
    pill: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    pillActive: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    pillText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
    },
    pillTextActive: {
        color: 'white',
        fontWeight: '600',
    },

    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    gridItem: {
        width: '48%',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
    },
    gridItemActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: '#3B82F6',
    },
    gridText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
    },
    gridTextActive: {
        color: 'white',
        fontWeight: '600',
    },

    // Ticket
    ticketCard: {
        padding: 20,
        borderRadius: 24,
        marginTop: 10,
    },
    ticketHeader: {
        alignItems: 'center',
        marginBottom: 16,
    },
    ticketLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 4,
    },
    ticketAmount: {
        fontSize: 28,
        fontWeight: '700',
        color: '#10B981', // Emerald
    },
    dashedLine: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderStyle: 'dashed', // Note: React Native borderStyle 'dashed' needs borderWidth
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        marginBottom: 16,
    },
    ticketRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    ticketRowLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    ticketRowValue: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
    },

    checkRateButton: {
        marginTop: 20,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    checkRateText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 30,
        backgroundColor: '#0F172A',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    submitButton: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    submitGradient: {
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    submitText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
});