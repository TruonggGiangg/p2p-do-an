import React, { useState, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
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
    ActivityIndicator,
    Animated
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
    LoanPurpose,
} from '../../types';
import { CreditRejectionModal } from '../../components/CreditRejectionModal';
import { GradientBackground, GlassCard, GlassTokens } from '../../components/glass';

// Format helpers
const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const parseNumber = (str: string): number => parseInt(str.replace(/,/g, ''), 10) || 0;
const formatDate = (date: Date): string => date.toISOString().split('T')[0];

// Purpose icon mapper
const getPurposeIcon = (purposeName: string): string => {
    const lowerName = purposeName.toLowerCase();
    if (lowerName.includes('tiêu dùng') || lowerName.includes('consumption')) return 'cart-outline';
    if (lowerName.includes('kinh doanh') || lowerName.includes('business')) return 'briefcase-outline';
    if (lowerName.includes('y tế') || lowerName.includes('medical')) return 'medical-bag';
    if (lowerName.includes('giáo dục') || lowerName.includes('education')) return 'school-outline';
    if (lowerName.includes('nhà') || lowerName.includes('real')) return 'home-city-outline';
    if (lowerName.includes('du lịch') || lowerName.includes('travel')) return 'airplane';
    if (lowerName.includes('cưới') || lowerName.includes('wedding')) return 'ring';
    return 'cash-multiple';
};

// ✅ Debounce hook for smoother input
const useDebounce = (callback: () => void, delay: number) => {
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    return useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            callback();
        }, delay);
    }, [callback, delay]);
};

export default function LoanCreateScreen({ navigation }: any) {
    useLayoutEffect(() => {
        navigation.setOptions({ headerShown: false });
    }, [navigation]);

    // ✅ Use raw input for smooth typing, format only for display
    const [capitalRaw, setCapitalRaw] = useState<string>('10000000');
    const [periodMonth, setPeriodMonth] = useState<number>(12);
    const [willing, setWilling] = useState<string>('');
    const [disbursementDate] = useState<Date>(new Date(Date.now() + 86400000)); // Tomorrow
    const [purposes, setPurposes] = useState<LoanPurpose[]>([]);
    const [loadingPurposes, setLoadingPurposes] = useState(false);

    const [ratePreview, setRatePreview] = useState<RateCheckResponse | null>(null);
    const [loadingRate, setLoadingRate] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [rejectionVisible, setRejectionVisible] = useState(false);
    const [rejectionData, setRejectionData] = useState<any>(null);

    // ✅ Memoized formatted display value
    const capitalDisplay = useMemo(() => formatNumber(parseInt(capitalRaw) || 0), [capitalRaw]);

    // Animation values
    const rateCardFadeAnim = useRef(new Animated.Value(0)).current;

    // ✅ Debounced rate preview reset
    const debouncedResetPreview = useDebounce(() => {
        setRatePreview(null);
    }, 300);

    const loadPurposes = useCallback(async () => {
        try {
            setLoadingPurposes(true);
            const data = await loanApi.getLoanPurposes();
            if (data && data.length > 0) {
                setPurposes(data);
                // Set initial willing if not set
                setWilling(data[0].name);
            } else {
                // Fallback
                setPurposes(LOAN_WILLINGS.map((name, index) => ({ id: index, name, position: index })));
                setWilling(LOAN_WILLINGS[0]);
            }
        } catch (error) {
            console.warn('[LoanCreate] Failed to fetch purposes:', error);
            setPurposes(LOAN_WILLINGS.map((name, index) => ({ id: index, name, position: index })));
            setWilling(LOAN_WILLINGS[0]);
        } finally {
            setLoadingPurposes(false);
        }
    }, []);

    useLayoutEffect(() => {
        loadPurposes();
    }, [loadPurposes]);

    const handleCheckRate = useCallback(async () => {
        const capitalValue = parseInt(capitalRaw) || 0;
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
            // Fade in rate card
            Animated.timing(rateCardFadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }
    }, [capitalRaw, periodMonth, disbursementDate]);

    const handleSubmit = useCallback(async () => {
        const capitalValue = parseInt(capitalRaw) || 0;
        if (!capitalValue || capitalValue < 1000000) {
            Alert.alert('Lỗi', 'Số tiền vay tối thiểu là 1,000,000 đ');
            return;
        }

        if (!willing) {
            Alert.alert('Lỗi', 'Vui lòng chọn mục đích vay');
            return;
        }

        // Navigate to CreditAssessment screen with loan data
        // Pre-loan scoring will be performed there
        navigation.navigate('CreditAssessment', {
            loanData: {
                capital: capitalValue,
                periodMonth,
                willing,
                disbursementDate: formatDate(disbursementDate),
                ratePreview, // Pass rate preview for display
            },
        });
    }, [capitalRaw, periodMonth, willing, disbursementDate, navigation, ratePreview]);

    return (
        <GradientBackground seed={capitalRaw}>
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
                        <View style={styles.sectionHeaderWithIcon}>
                            <Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.7)" style={styles.sectionIcon} />
                            <Text style={styles.inputLabel}>Bạn muốn vay bao nhiêu?</Text>
                        </View>
                        <View style={styles.amountInputWrapper}>
                            <TextInput
                                value={capitalDisplay}
                                onChangeText={(val) => {
                                    // ✅ Only store raw digits for smooth typing
                                    const digits = val.replace(/[^0-9]/g, '');
                                    setCapitalRaw(digits);
                                    debouncedResetPreview(); // Debounced reset
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
                        <View style={styles.sectionHeaderWithIcon}>
                            <Ionicons name="calendar-outline" size={18} color="white" style={styles.sectionIcon} />
                            <Text style={styles.sectionLabel}>Kỳ hạn vay</Text>
                        </View>
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
                        <View style={styles.sectionHeaderWithIcon}>
                            <Ionicons name="list-outline" size={18} color="white" style={styles.sectionIcon} />
                            <Text style={styles.sectionLabel}>Mục đích vay</Text>
                        </View>
                        {loadingPurposes ? (
                            <ActivityIndicator color={GlassTokens.colors.primary} style={{ marginVertical: 20 }} />
                        ) : (
                            <View style={styles.gridContainer}>
                                {purposes.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        activeOpacity={0.7}
                                        style={styles.gridItemWrapper}
                                        onPress={() => setWilling(item.name)}
                                    >
                                        <View
                                            style={[
                                                styles.gridItem,
                                                willing === item.name && styles.gridItemActive,
                                            ]}
                                        >
                                            <MaterialCommunityIcons
                                                name={getPurposeIcon(item.name)}
                                                size={24}
                                                color={willing === item.name ? '#3B82F6' : 'rgba(255,255,255,0.5)'}
                                                style={styles.purposeIcon}
                                            />
                                            <Text style={[
                                                styles.gridText,
                                                willing === item.name && styles.gridTextActive
                                            ]}>
                                                {item.name}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Rate Result Ticket */}
                    {ratePreview ? (
                        <Animated.View style={{ opacity: rateCardFadeAnim }}>
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
                                    <Text style={styles.ticketRowValue}>{formatNumber(ratePreview.entirelyPay - (parseInt(capitalRaw) || 0))} ₫</Text>
                                </View>
                                <View style={styles.ticketRow}>
                                    <Text style={styles.ticketRowLabel}>Tổng thanh toán</Text>
                                    <Text style={styles.ticketRowValue}>{formatNumber(ratePreview.entirelyPay)} ₫</Text>
                                </View>

                                {/* Schedule Preview Table (WYSIWYG) */}
                                {ratePreview.schedulePreview && ratePreview.schedulePreview.length > 0 && (
                                    <View style={styles.scheduleContainer}>
                                        <View style={styles.dashedLine} />
                                        <Text style={styles.scheduleTitle}>Lịch trả nợ chi tiết</Text>
                                        <View style={styles.scheduleHeader}>
                                            <Text style={[styles.scheduleHeaderText, { flex: 0.5 }]}>Kỳ</Text>
                                            <Text style={styles.scheduleHeaderText}>Gốc</Text>
                                            <Text style={styles.scheduleHeaderText}>Lãi</Text>
                                            <Text style={styles.scheduleHeaderText}>Tổng</Text>
                                        </View>
                                        {ratePreview.schedulePreview.map((item, idx) => (
                                            <View key={idx} style={[styles.scheduleRow, idx % 2 === 0 && styles.scheduleRowAlt]}>
                                                <Text style={[styles.scheduleCell, { flex: 0.5 }]}>{item.period}</Text>
                                                <Text style={styles.scheduleCell}>{formatNumber(item.principal)}</Text>
                                                <Text style={styles.scheduleCell}>{formatNumber(item.interest)}</Text>
                                                <Text style={[styles.scheduleCell, { fontWeight: '600', color: '#10B981' }]}>
                                                    {formatNumber(item.total)}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </GlassCard>
                        </Animated.View>
                    ) : (
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={[
                                styles.checkRateButton,
                                loadingRate && styles.checkRateButtonDisabled
                            ]}
                            onPress={handleCheckRate}
                            disabled={loadingRate}
                        >
                            <LinearGradient
                                colors={loadingRate ? ['rgba(59,130,246,0.3)', 'rgba(37,99,235,0.3)'] : ['#3B82F6', '#2563EB']}
                                style={styles.checkRateButtonGradient}
                            >
                                {loadingRate ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <>
                                        <Ionicons name="calculator-outline" size={20} color="white" style={{ marginRight: 8 }} />
                                        <Text style={styles.checkRateText}>Tính toán khoản vay</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    )
                    }

                    <View style={{ height: 100 }} />
                </ScrollView >

                {/* Footer Submit */}
                {
                    ratePreview && (
                        <View style={styles.footer}>
                            <View style={styles.submitButtonShadowWrapper}>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    style={styles.submitButton}
                                    onPress={handleSubmit}
                                    disabled={submitting}
                                >
                                    <LinearGradient
                                        colors={['#3B82F6', '#2563EB']}
                                        style={styles.submitGradient}
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <>
                                                <Text style={styles.submitText}>Xác nhận vay ngay</Text>
                                                <Ionicons name="arrow-forward" size={20} color="white" />
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )
                }
            </KeyboardAvoidingView >

            {rejectionData && (
                <CreditRejectionModal
                    visible={rejectionVisible}
                    onClose={() => setRejectionVisible(false)}
                    creditData={rejectionData}
                />
            )
            }
        </GradientBackground >
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
        marginBottom: 36,
    },
    sectionHeaderWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionIcon: {
        marginRight: 8,
    },
    sectionLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: 'white',
        letterSpacing: 0.3,
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
        justifyContent: 'space-between',
        paddingHorizontal: 0,
    },
    gridItemWrapper: {
        width: '48%',
        marginBottom: 12,
    },
    gridItem: {
        width: '100%',
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    gridItemActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        borderColor: '#3B82F6',
        borderWidth: 2,
        shadowColor: '#3B82F6',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    purposeIcon: {
        marginBottom: 8,
    },
    gridText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 18,
    },
    gridTextActive: {
        color: 'white',
        fontWeight: '600',
    },

    // Ticket
    ticketCard: {
        padding: 24,
        paddingHorizontal: 20,
        borderRadius: 24,
        marginTop: 16,
        marginHorizontal: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        // Avoid overflow: 'hidden' here if GlassCard handles it, 
        // but ensure radius is consistent
    },
    ticketHeader: {
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 16,
    },
    ticketLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 8,
        letterSpacing: 0.3,
    },
    ticketAmount: {
        fontSize: 32,
        fontWeight: '700',
        color: '#10B981', // Emerald
        letterSpacing: -0.5,
    },
    dashedLine: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginVertical: 16,
    },
    ticketRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        marginBottom: 4,
    },
    ticketRowLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    ticketRowValue: {
        fontSize: 15,
        fontWeight: '600',
        color: 'white',
    },

    checkRateButton: {
        marginTop: 20,
        borderRadius: 16,
        backgroundColor: '#3B82F6', // Base color to prevent corner bleeding
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    checkRateButtonDisabled: {
        opacity: 0.6,
    },
    checkRateButtonGradient: {
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
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
    submitButtonShadowWrapper: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    submitButton: {
        borderRadius: 16,
        backgroundColor: '#3B82F6',
    },
    submitGradient: {
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
        gap: 8,
    },
    submitText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },

    // Schedule Preview Table (WYSIWYG)
    scheduleContainer: {
        marginTop: 16,
    },
    scheduleTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 12,
        marginTop: 8,
    },
    scheduleHeader: {
        flexDirection: 'row',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(59,130,246,0.3)',
        backgroundColor: 'rgba(59,130,246,0.15)',
        borderRadius: 12,
        paddingHorizontal: 8,
        marginBottom: 8,
    },
    scheduleHeaderText: {
        flex: 1,
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    scheduleRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderRadius: 6,
        marginBottom: 2,
    },
    scheduleRowAlt: {
        backgroundColor: 'rgba(59,130,246,0.08)',
    },
    scheduleCell: {
        flex: 1,
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        fontWeight: '500',
    },
});