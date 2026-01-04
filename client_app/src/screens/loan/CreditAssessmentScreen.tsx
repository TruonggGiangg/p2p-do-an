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

// Route params
type RouteParams = {
    CreditAssessment: {
        loanId: string;
        fineractLoanId?: number;
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
    const navigation = useNavigation();
    const { loanId, fineractLoanId } = route.params || {};

    // State
    const [loading, setLoading] = useState(true);
    const [assessing, setAssessing] = useState(false);
    const [scorecards, setScorecards] = useState<ScorecardItem[]>([]);
    const [latestScore, setLatestScore] = useState<ScorecardItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Digital Footprint hook
    const { collectFootprint, loading: collectingFootprint } = useDigitalFootprint();

    // Check if can score again
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
     * Assess credit score with Digital Footprint
     */
    const handleAssessCredit = useCallback(async () => {
        if (!canScoreAgain) {
            Alert.alert(
                'Đã hết lượt',
                `Bạn đã sử dụng hết ${MAX_SCORING_ATTEMPTS} lượt chấm điểm cho khoản vay này.`,
            );
            return;
        }

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

    // Load on mount
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
                <Text style={styles.headerTitle}>Đánh giá tín dụng</Text>
                <TouchableOpacity onPress={loadScorecardHistory}>
                    <Ionicons name="refresh" size={24} color="white" />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
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
                        {/* Latest Score */}
                        {latestScore ? (
                            renderLatestScore()
                        ) : (
                            <GlassCard blur={GlassTokens.blur.light} style={styles.emptyCard}>
                                <Ionicons name="information-circle" size={48} color="#94A3B8" />
                                <Text style={styles.emptyText}>
                                    Chưa có kết quả chấm điểm
                                </Text>
                                <Text style={styles.emptySubtext}>
                                    Nhấn nút bên dưới để đánh giá tín dụng
                                </Text>
                            </GlassCard>
                        )}

                        {/* History */}
                        {renderHistory()}

                        {/* Remaining attempts info */}
                        {canScoreAgain && (
                            <View style={styles.attemptsInfo}>
                                <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
                                <Text style={styles.attemptsText}>
                                    Còn {remainingAttempts} lượt chấm điểm
                                </Text>
                            </View>
                        )}

                        {/* Spacer */}
                        <View style={{ height: 120 }} />
                    </>
                )}
            </ScrollView>

            {/* Assess Button */}
            {!loading && canScoreAgain && (
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.assessBtn, !canScoreAgain && styles.assessBtnDisabled]}
                        onPress={handleAssessCredit}
                        disabled={assessing || collectingFootprint || !canScoreAgain}
                    >
                        {assessing || collectingFootprint ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <LinearGradient
                                colors={['#10B981', '#059669']}
                                style={styles.assessGradient}
                            >
                                <Ionicons name="shield-checkmark" size={20} color="white" />
                                <Text style={styles.assessText}>
                                    {latestScore ? 'Chấm điểm lại' : 'Đánh giá tín dụng'}
                                </Text>
                            </LinearGradient>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* Max attempts reached */}
            {!loading && !canScoreAgain && (
                <View style={styles.footer}>
                    <View style={styles.maxAttemptsCard}>
                        <Ionicons name="lock-closed" size={20} color="#EF4444" />
                        <Text style={styles.maxAttemptsText}>
                            Đã sử dụng hết {MAX_SCORING_ATTEMPTS} lượt chấm điểm
                        </Text>
                    </View>
                </View>
            )}
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
});
