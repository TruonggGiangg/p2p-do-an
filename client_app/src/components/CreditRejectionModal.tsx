import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditScoreBadge } from './CreditScoreBadge';

interface CreditRejectionModalProps {
    visible: boolean;
    onClose: () => void;
    creditData: {
        creditScore: number;
        grade: string;
        reasons: string[];
        recommendations: string[];
    };
}

export const CreditRejectionModal: React.FC<CreditRejectionModalProps> = ({
    visible,
    onClose,
    creditData
}) => {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#ef4444', '#dc2626']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <Text style={styles.headerIcon}>⚠️</Text>
                        <Text style={styles.headerTitle}>Khoản vay bị từ chối</Text>
                        <Text style={styles.headerSubtitle}>
                            Điểm tín dụng của bạn không đủ điều kiện
                        </Text>
                    </LinearGradient>

                    <ScrollView style={styles.content}>
                        {/* Credit Score Badge */}
                        <View style={styles.scoreSection}>
                            <CreditScoreBadge
                                score={creditData.creditScore}
                                grade={creditData.grade}
                                riskLevel="very_high"
                                size="large"
                            />
                            <Text style={styles.scoreSummary}>
                                Điểm tín dụng của bạn là {creditData.creditScore}/850
                            </Text>
                            <Text style={styles.scoreRequirement}>
                                Yêu cầu tối thiểu: 450 điểm
                            </Text>
                        </View>

                        {/* Rejection Reasons */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>❌ Lý do từ chối</Text>
                            {creditData.reasons.map((reason, index) => (
                                <View key={index} style={styles.reasonItem}>
                                    <View style={styles.bullet} />
                                    <Text style={styles.reasonText}>{reason}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Recommendations */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>💡 Cách cải thiện</Text>
                            {creditData.recommendations.map((rec, index) => (
                                <View key={index} style={styles.recommendationItem}>
                                    <Text style={styles.recommendationIcon}>✓</Text>
                                    <Text style={styles.recommendationText}>{rec}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Call to Action */}
                        <View style={styles.ctaSection}>
                            <Text style={styles.ctaText}>
                                Hãy cải thiện điểm tín dụng của bạn và thử lại sau!
                            </Text>
                        </View>
                    </ScrollView>

                    {/* Close Button */}
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onClose}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.closeButtonText}>Đã hiểu</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modal: {
        backgroundColor: '#fff',
        borderRadius: 20,
        width: '100%',
        maxWidth: 400,
        maxHeight: '90%',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        padding: 24,
        alignItems: 'center',
    },
    headerIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
        textAlign: 'center',
    },
    content: {
        padding: 24,
    },
    scoreSection: {
        alignItems: 'center',
        marginBottom: 24,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    scoreSummary: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
    },
    scoreRequirement: {
        fontSize: 14,
        color: '#ef4444',
        marginTop: 4,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 12,
    },
    reasonItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        paddingLeft: 8,
    },
    bullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ef4444',
        marginTop: 6,
        marginRight: 12,
    },
    reasonText: {
        flex: 1,
        fontSize: 14,
        color: '#4b5563',
        lineHeight: 20,
    },
    recommendationItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        backgroundColor: '#f0fdf4',
        padding: 12,
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#10b981',
    },
    recommendationIcon: {
        fontSize: 16,
        color: '#10b981',
        marginRight: 8,
        marginTop: 2,
    },
    recommendationText: {
        flex: 1,
        fontSize: 14,
        color: '#065f46',
        lineHeight: 20,
    },
    ctaSection: {
        padding: 16,
        backgroundColor: '#fef3c7',
        borderRadius: 12,
        marginTop: 8,
    },
    ctaText: {
        fontSize: 14,
        color: '#92400e',
        textAlign: 'center',
        fontWeight: '500',
    },
    closeButton: {
        backgroundColor: '#111827',
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 20,
        borderRadius: 12,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
