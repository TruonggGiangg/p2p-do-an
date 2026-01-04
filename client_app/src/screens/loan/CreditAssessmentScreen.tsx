/**
 * CreditAssessmentScreen
 * 
 * Hiển thị kết quả chấm điểm tín dụng mới nhất và lịch sử.
 * Cho phép chấm lại (tối đa 3 lần) với Digital Footprint.
 * 
 * Reference: mifos-web-app/src/app/loans/loans-view/credit-scorecard
 */

import React, { useEffect, useState, useCallback } from 'react';

import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    StyleSheet,
} from 'react-native';

import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { GradientBackground, GlassCard, GlassTokens } from '../../components/glass';
import { useDigitalFootprint } from '../../hooks/useDigitalFootprint';
import { loanApi } from '../../services';

// Max scoring attempts allowed (enforced on client)
const MAX_SCORING_ATTEMPTS = 3;

// Pre-loan data (from LoanCreate screen)
interface PreLoanData {
    capital: number;
    periodMonth: number;
    willing: string;
    disbursementDate: string;
    ratePreview?: any;
}

// Pre-assessment result
interface PreAssessResult {
    score: number;
    grade: string;
    riskLevel: 'low' | 'medium' | 'high' | 'very_high';
    canProceed: boolean;
    isApproved: boolean;
    rejectionMessage?: string;
    recommendations: string[];
}

// Route params - supports both pre-loan and post-loan modes
type RouteParams = {
    CreditAssessment: {
        // Post-loan mode (view/rescore existing loan)
        loanId?: string;
        fineractLoanId?: number;
        // Pre-loan mode (from LoanCreate)
        loanData?: PreLoanData;
    };
};

// Scorecard item from API
interface ScorecardItem {
    id: number;
    loanId: number;
    createdOn: string | Date;
    scoringMethod: 'digital' | 'ml' | 'ruleBased';
    mlScorecard?: {
        creditScore: number;
        predictedRisk: string;
        accuracy?: number;
    };
}

// API response
interface ScorecardResponse {
    scorecards: ScorecardItem[];
    count: number;
    latest: ScorecardItem | null;
}

export default function CreditAssessmentScreen() {
    const route = useRoute<RouteProp<RouteParams, 'CreditAssessment'>>();
    const navigation = useNavigation<any>();
    const { loanId, fineractLoanId, loanData } = route.params || {};

    // Determine mode
    const isPreLoanMode = !!loanData && !loanId;

    // State
    const [loading, setLoading] = useState(!isPreLoanMode); // Pre-loan starts not loading
    const [assessing, setAssessing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [scorecards, setScorecards] = useState<ScorecardItem[]>([]);
    const [latestScore, setLatestScore] = useState<ScorecardItem | null>(null);
    const [preAssessResult, setPreAssessResult] = useState<PreAssessResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Digital Footprint hook
    const { collectFootprint, loading: collectingFootprint } = useDigitalFootprint();

    // Check if can score again (post-loan mode only)
    const canScoreAgain = scorecards.length < MAX_SCORING_ATTEMPTS;
    const remainingAttempts = MAX_SCORING_ATTEMPTS - scorecards.length;

    /**
     * Load scorecard history from API
     */
    const loadScorecardHistory = useCallback(async () => {
        if (!loanId) return;

        try {
            setLoading(true);
            setError(null);

            const data = await loanApi.getScorecardHistory(loanId);

            setScorecards(data.scorecards || []);
            setLatestScore(data.latest || null);

        } catch (err: any) {
            console.error('[CreditAssessment] Error loading history:', err);
            setError(err.message || 'Không thể tải lịch sử chấm điểm');
        } finally {
            setLoading(false);
        }
    }, [loanId]);

    /**
     * Assess credit score with Digital Footprint (Post-loan mode)
     */
    const handleAssessCredit = useCallback(async () => {
        if (!canScoreAgain) {
            Alert.alert(
                'Đã hết lượt',
                `Bạn đã sử dụng hết ${MAX_SCORING_ATTEMPTS} lượt chấm điểm cho khoản vay này.`,
            );
            return;
        }

        if (!loanId) return;

        try {
            setAssessing(true);
            setError(null);

            // Collect digital footprint
            const footprint = await collectFootprint();
            if (!footprint) {
                Alert.alert('Lỗi', 'Không thể thu thập dữ liệu thiết bị');
                return;
            }

            console.log('[CreditAssessment] Footprint:', footprint);

            // Call API to assess
            await loanApi.assessCredit(loanId, footprint);

            // Reload history
            await loadScorecardHistory();

            Alert.alert('Thành công', 'Đã chấm điểm tín dụng thành công!');

        } catch (err: any) {
            console.error('[CreditAssessment] Error assessing:', err);
            Alert.alert('Lỗi', err.message || 'Không thể chấm điểm tín dụng');
        } finally {
            setAssessing(false);
        }
    }, [loanId, canScoreAgain, collectFootprint, loadScorecardHistory]);

    /**
     * Pre-Assess credit score (Pre-loan mode)
     * Called when coming from LoanCreateScreen
     */
    const handlePreAssess = useCallback(async () => {
        if (!loanData) return;

        try {
            setAssessing(true);
            setError(null);

            // Collect digital footprint
            const footprint = await collectFootprint();
            if (!footprint) {
                Alert.alert('Lỗi', 'Không thể thu thập dữ liệu thiết bị. Vui lòng thử lại.');
                return;
            }

            console.log('[PreAssess] Footprint:', footprint);
            console.log('[PreAssess] Loan Data:', loanData);

            // Call pre-assess API
            const result = await loanApi.preAssess({
                capital: loanData.capital,
                periodMonth: loanData.periodMonth,
                willing: loanData.willing,
                footprint: {
                    battery_level: footprint.battery_level ?? 50,
                    submission_hour: footprint.submission_hour ?? new Date().getHours(),
                    connection_type: footprint.connection_type ?? 'unknown',
                    location_match: footprint.location_match ?? 'false',
                    device_score: footprint.device_score,
                },
            });

            console.log('[PreAssess] Result:', result);
            setPreAssessResult(result);

            // Handle rejection immediately
            if (!result.canProceed) {
                Alert.alert(
                    'Không đủ điều kiện',
                    result.rejectionMessage || 'Hồ sơ của bạn không đủ điều kiện để vay lúc này.',
                    [{ text: 'Đã hiểu', onPress: () => navigation.goBack() }]
                );
            }

        } catch (err: any) {
            console.error('[PreAssess] Error:', err);
            setError(err.message || 'Không thể đánh giá tín dụng');
            Alert.alert('Lỗi', err.message || 'Không thể đánh giá tín dụng');
        } finally {
            setAssessing(false);
        }
    }, [loanData, collectFootprint, navigation]);

    /**
     * Create loan after successful pre-assessment
     */
    const handleCreateLoan = useCallback(async () => {
        if (!loanData || !preAssessResult?.canProceed) return;

        try {
            setCreating(true);

            const result = await loanApi.createLoan({
                capital: loanData.capital,
                periodMonth: loanData.periodMonth,
                willing: loanData.willing,
                disbursementDate: loanData.disbursementDate,
                // Include credit assessment for backend reference
                digitalFootprint: {
                    battery_level: 50,
                    submission_hour: new Date().getHours(),
                    connection_type: 'wifi',
                    location_match: 'true',
                },
            });

            Alert.alert(
                '🎉 Thành công!',
                'Hồ sơ vay của bạn đã được tạo thành công.',
                [{
                    text: 'OK',
                    onPress: () => navigation.reset({
                        index: 0,
                        routes: [{ name: 'Loans' }],
                    })
                }],
                { cancelable: false }
            );

        } catch (err: any) {
            console.error('[CreateLoan] Error:', err);
            Alert.alert('Lỗi', err.message || 'Không thể tạo khoản vay');
        } finally {
            setCreating(false);
        }
    }, [loanData, preAssessResult, navigation]);

    // Load on mount (post-loan mode only)
    useEffect(() => {
        loadScorecardHistory();
    }, [loadScorecardHistory]);

    // Render risk badge
    const renderRiskBadge = (risk: string) => {
        const isGood = risk?.toLowerCase() === 'low' || risk?.toLowerCase() === 'good';
        const isBad = risk?.toLowerCase() === 'high' || risk?.toLowerCase() === 'bad';

        const backgroundColor = isGood ? '#10B981' : isBad ? '#EF4444' : '#F59E0B';
        const label = isGood ? 'THẤP' : isBad ? 'CAO' : 'TRUNG BÌNH';

        return (
            <View style={[styles.riskBadge, { backgroundColor }]}>
                <Text style={styles.riskBadgeText}>{label}</Text>
            </View>
        );
    };

    // Render latest score card
    const renderLatestScore = () => {
        if (!latestScore?.mlScorecard) return null;

        const { creditScore, predictedRisk, accuracy } = latestScore.mlScorecard;

        return (
            <GlassCard blur={GlassTokens.blur.medium} style={styles.scoreCard}>
                <View style={styles.scoreHeader}>
                    <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                    <Text style={styles.scoreTitle}>Điểm tín dụng mới nhất</Text>
                </View>

                <View style={styles.scoreBody}>
                    <Text style={styles.scoreValue}>{creditScore}</Text>
                    <Text style={styles.scoreMax}>/ 850</Text>
                </View>

                <View style={styles.scoreDetails}>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Mức độ rủi ro:</Text>
                        {renderRiskBadge(predictedRisk)}
                    </View>
                    {accuracy && (
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Độ chính xác:</Text>
                            <Text style={styles.detailValue}>
                                {(accuracy * 100).toFixed(1)}%
                            </Text>
                        </View>
                    )}
                </View>
            </GlassCard>
        );
    };

    // Render history table
    const renderHistory = () => {
        if (scorecards.length === 0) return null;

        return (
            <GlassCard blur={GlassTokens.blur.light} style={styles.historyCard}>
                <Text style={styles.historyTitle}>
                    Lịch sử chấm điểm ({scorecards.length}/{MAX_SCORING_ATTEMPTS})
                </Text>

                <View style={styles.historyTable}>
                    {/* Header */}
                    <View style={styles.historyHeader}>
                        <Text style={[styles.historyHeaderCell, { flex: 1.5 }]}>Thời gian</Text>
                        <Text style={styles.historyHeaderCell}>Điểm</Text>
                        <Text style={styles.historyHeaderCell}>Rủi ro</Text>
                    </View>

                    {/* Rows */}
                    {scorecards.map((item, idx) => (
                        <View key={item.id || idx} style={[styles.historyRow, idx % 2 === 0 && styles.historyRowAlt]}>
                            <Text style={[styles.historyCell, { flex: 1.5 }]}>
                                {new Date(item.createdOn).toLocaleString('vi-VN')}
                            </Text>
                            <Text style={styles.historyCell}>
                                {item.mlScorecard?.creditScore || 'N/A'}
                            </Text>
                            <View style={styles.historyCell}>
                                {renderRiskBadge(item.mlScorecard?.predictedRisk || 'unknown')}
                            </View>
                        </View>
                    ))}
                </View>
            </GlassCard>
        );
    };

    return (
        <GradientBackground>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {isPreLoanMode ? 'Đánh giá hồ sơ vay' : 'Đánh giá tín dụng'}
                </Text>
                {isPreLoanMode ? (
                    <View style={{ width: 40 }} />
                ) : (
                    <TouchableOpacity onPress={loadScorecardHistory}>
                        <Ionicons name="refresh" size={24} color="white" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView style={styles.content}>
                {/* ========== PRE-LOAN MODE ========== */}
                {isPreLoanMode ? (
                    <>
                        {/* Loan Summary */}
                        <GlassCard blur={GlassTokens.blur.light} style={styles.loanInfoCard}>
                            <Text style={styles.loanInfoTitle}>Thông tin khoản vay</Text>
                            <View style={styles.loanInfoRow}>
                                <Text style={styles.loanInfoLabel}>Số tiền:</Text>
                                <Text style={styles.loanInfoValue}>
                                    {loanData?.capital?.toLocaleString('vi-VN')} đ
                                </Text>
                            </View>
                            <View style={styles.loanInfoRow}>
                                <Text style={styles.loanInfoLabel}>Kỳ hạn:</Text>
                                <Text style={styles.loanInfoValue}>{loanData?.periodMonth} tháng</Text>
                            </View>
                            <View style={styles.loanInfoRow}>
                                <Text style={styles.loanInfoLabel}>Mục đích:</Text>
                                <Text style={styles.loanInfoValue}>{loanData?.willing}</Text>
                            </View>
                        </GlassCard>

                        {/* Assessment Result - Only show Approved/Rejected */}
                        {preAssessResult && (
                            <GlassCard blur={GlassTokens.blur.medium} style={styles.scoreCard}>
                                <View style={styles.resultContainer}>
                                    <Ionicons
                                        name={preAssessResult.canProceed ? "checkmark-circle" : "close-circle"}
                                        size={72}
                                        color={preAssessResult.canProceed ? "#10B981" : "#EF4444"}
                                    />
                                    <Text style={[
                                        styles.resultText,
                                        { color: preAssessResult.canProceed ? "#10B981" : "#EF4444" }
                                    ]}>
                                        {preAssessResult.canProceed ? "ĐANG ĐỢI ĐẦU TƯ" : "KHÔNG ĐỦ ĐIỀU KIỆN"}
                                    </Text>
                                    <Text style={styles.resultSubtext}>
                                        {preAssessResult.canProceed
                                            ? "Khoản vay của bạn đang chờ nhà đầu tư. Nhấn tiếp tục để tạo khoản vay."
                                            : "Hồ sơ của bạn hiện không đủ điều kiện để vay."}
                                    </Text>
                                </View>
                            </GlassCard>
                        )}

                        {/* Instructions */}
                        {!preAssessResult && !assessing && (
                            <GlassCard blur={GlassTokens.blur.light} style={styles.emptyCard}>
                                <Ionicons name="finger-print" size={48} color="#3B82F6" />
                                <Text style={styles.emptyText}>Đánh giá dấu vân tay số</Text>
                                <Text style={styles.emptySubtext}>
                                    Nhấn nút bên dưới để kiểm tra điều kiện vay
                                </Text>
                            </GlassCard>
                        )}

                        {assessing && (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#3B82F6" />
                                <Text style={styles.loadingText}>Đang phân tích...</Text>
                            </View>
                        )}
                        <View style={{ height: 120 }} />
                    </>
                ) : (
                    /* ========== POST-LOAN MODE ========== */
                    <>
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#3B82F6" />
                                <Text style={styles.loadingText}>Đang tải...</Text>
                            </View>
                        ) : error ? (
                            <GlassCard blur={GlassTokens.blur.light} style={styles.errorCard}>
                                <Ionicons name="alert-circle" size={48} color="#EF4444" />
                                <Text style={styles.errorText}>{error}</Text>
                                <TouchableOpacity style={styles.retryBtn} onPress={loadScorecardHistory}>
                                    <Text style={styles.retryText}>Thử lại</Text>
                                </TouchableOpacity>
                            </GlassCard>
                        ) : (
                            <>
                                {latestScore ? renderLatestScore() : (
                                    <GlassCard blur={GlassTokens.blur.light} style={styles.emptyCard}>
                                        <Ionicons name="information-circle" size={48} color="#94A3B8" />
                                        <Text style={styles.emptyText}>Chưa có kết quả chấm điểm</Text>
                                        <Text style={styles.emptySubtext}>Nhấn nút bên dưới để đánh giá</Text>
                                    </GlassCard>
                                )}
                                {renderHistory()}
                                {canScoreAgain && (
                                    <View style={styles.attemptsInfo}>
                                        <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
                                        <Text style={styles.attemptsText}>Còn {remainingAttempts} lượt</Text>
                                    </View>
                                )}
                                <View style={{ height: 120 }} />
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
                {/* Pre-loan: Assess button */}
                {isPreLoanMode && !preAssessResult && (
                    <TouchableOpacity style={styles.assessBtn} onPress={handlePreAssess} disabled={assessing}>
                        {assessing ? <ActivityIndicator color="white" /> : (
                            <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.assessGradient}>
                                <Ionicons name="finger-print" size={20} color="white" />
                                <Text style={styles.assessText}>Đánh giá điều kiện vay</Text>
                            </LinearGradient>
                        )}
                    </TouchableOpacity>
                )}

                {/* Pre-loan: Create button */}
                {isPreLoanMode && preAssessResult?.canProceed && (
                    <TouchableOpacity style={styles.assessBtn} onPress={handleCreateLoan} disabled={creating}>
                        {creating ? <ActivityIndicator color="white" /> : (
                            <LinearGradient colors={['#10B981', '#059669']} style={styles.assessGradient}>
                                <Ionicons name="checkmark-circle" size={20} color="white" />
                                <Text style={styles.assessText}>Xác nhận tạo khoản vay</Text>
                            </LinearGradient>
                        )}
                    </TouchableOpacity>
                )}

                {/* Post-loan: Assess button */}
                {!isPreLoanMode && !loading && canScoreAgain && (
                    <TouchableOpacity style={styles.assessBtn} onPress={handleAssessCredit} disabled={assessing}>
                        {assessing ? <ActivityIndicator color="white" /> : (
                            <LinearGradient colors={['#10B981', '#059669']} style={styles.assessGradient}>
                                <Ionicons name="shield-checkmark" size={20} color="white" />
                                <Text style={styles.assessText}>
                                    {latestScore ? 'Chấm điểm lại' : 'Đánh giá tín dụng'}
                                </Text>
                            </LinearGradient>
                        )}
                    </TouchableOpacity>
                )}

                {/* Post-loan: Max attempts */}
                {!isPreLoanMode && !loading && !canScoreAgain && (
                    <View style={styles.maxAttemptsCard}>
                        <Ionicons name="lock-closed" size={20} color="#EF4444" />
                        <Text style={styles.maxAttemptsText}>Đã hết lượt chấm điểm</Text>
                    </View>
                )}
            </View>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 50,
        paddingBottom: 16,
        paddingHorizontal: 20,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: 'white',
    },

    content: {
        flex: 1,
        paddingHorizontal: 20,
    },

    loadingContainer: {
        paddingTop: 100,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: 'rgba(255,255,255,0.6)',
    },

    // Score Card
    scoreCard: {
        padding: 24,
        marginBottom: 16,
    },
    scoreHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    scoreTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },
    scoreBody: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        marginBottom: 20,
    },
    scoreValue: {
        fontSize: 64,
        fontWeight: '700',
        color: '#10B981',
    },
    scoreMax: {
        fontSize: 24,
        color: 'rgba(255,255,255,0.5)',
        marginLeft: 8,
    },
    scoreDetails: {
        gap: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    detailLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
    },

    // Risk Badge
    riskBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    riskBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: 'white',
    },

    // History
    historyCard: {
        padding: 16,
        marginBottom: 16,
    },
    historyTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 12,
    },
    historyTable: {},
    historyHeader: {
        flexDirection: 'row',
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.2)',
    },
    historyHeaderCell: {
        flex: 1,
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
    historyRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        alignItems: 'center',
    },
    historyRowAlt: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 6,
    },
    historyCell: {
        flex: 1,
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
    },

    // Empty / Error states
    emptyCard: {
        padding: 40,
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 8,
        textAlign: 'center',
    },
    errorCard: {
        padding: 40,
        alignItems: 'center',
    },
    errorText: {
        fontSize: 14,
        color: '#EF4444',
        marginTop: 16,
        textAlign: 'center',
    },
    retryBtn: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
    },
    retryText: {
        color: 'white',
        fontWeight: '600',
    },

    // Attempts info
    attemptsInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
    },
    attemptsText: {
        fontSize: 12,
        color: '#94A3B8',
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
    assessBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    assessBtnDisabled: {
        opacity: 0.5,
    },
    assessGradient: {
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    assessText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },

    // Max attempts
    maxAttemptsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(239,68,68,0.1)',
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    maxAttemptsText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
    },

    // Pre-loan mode - Loan Info Card
    loanInfoCard: {
        padding: 16,
        marginBottom: 16,
    },
    loanInfoTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: 'white',
        marginBottom: 12,
    },
    loanInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    loanInfoLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    loanInfoValue: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
    },

    // Recommendations
    recommendations: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    recItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 4,
    },
    recText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        flex: 1,
    },

    // Result container for pre-loan assessment
    resultContainer: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    resultText: {
        fontSize: 24,
        fontWeight: '700',
        marginTop: 16,
        textAlign: 'center',
    },
    resultSubtext: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 16,
    },
});
