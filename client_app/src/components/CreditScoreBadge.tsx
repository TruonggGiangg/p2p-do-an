import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface CreditScoreBadgeProps {
    score: number;        // 300-850
    grade: string;        // A+, A, B+, B, C+, C, D, F
    riskLevel: 'low' | 'medium' | 'high' | 'very_high';
    size?: 'small' | 'medium' | 'large';
}

export const CreditScoreBadge: React.FC<CreditScoreBadgeProps> = ({
    score,
    grade,
    riskLevel,
    size = 'medium'
}) => {
    // Grade colors
    const getColorsByGrade = (grade: string) => {
        if (grade.startsWith('A')) {
            return { colors: ['#10b981', '#059669'], text: '#fff', risk: 'Rủi ro thấp' };
        } else if (grade.startsWith('B')) {
            return { colors: ['#3b82f6', '#2563eb'], text: '#fff', risk: 'Rủi ro trung bình' };
        } else if (grade.startsWith('C')) {
            return { colors: ['#f59e0b', '#d97706'], text: '#fff', risk: 'Rủi ro cao' };
        } else if (grade === 'D') {
            return { colors: ['#f97316', '#ea580c'], text: '#fff', risk: 'Rủi ro rất cao' };
        } else {
            return { colors: ['#ef4444', '#dc2626'], text: '#fff', risk: 'Không đủ điều kiện' };
        }
    };

    const { colors, text: textColor, risk } = getColorsByGrade(grade);

    // Size dimensions
    const dimensions = {
        small: { size: 60, fontSize: 16, scoreSize: 10 },
        medium: { size: 80, fontSize: 20, scoreSize: 11 },
        large: { size: 100, fontSize: 24, scoreSize: 12 }
    };

    const dim = dimensions[size];

    // Calculate progress percentage (300-850 range)
    const progressPercentage = ((score - 300) / 550) * 100;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={colors}
                style={[
                    styles.badge,
                    { width: dim.size, height: dim.size, borderRadius: dim.size / 2 }
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <Text style={[styles.grade, { fontSize: dim.fontSize, color: textColor }]}>
                    {grade}
                </Text>
                <Text style={[styles.score, { fontSize: dim.scoreSize, color: textColor }]}>
                    {score}/850
                </Text>
            </LinearGradient>
            <View style={styles.info}>
                <Text style={styles.riskLevel}>{risk}</Text>
                <View style={styles.progressBar}>
                    <View
                        style={[
                            styles.progressFill,
                            { width: `${progressPercentage}%`, backgroundColor: colors[0] }
                        ]}
                    />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    badge: {
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        marginBottom: 12,
    },
    grade: {
        fontWeight: 'bold' as any,
        marginBottom: 2,
    },
    score: {
        fontWeight: '500' as any,
        opacity: 0.9,
    },
    info: {
        alignItems: 'center',
    },
    riskLevel: {
        fontSize: 14,
        fontWeight: '600' as any,
        color: '#6b7280',
        marginBottom: 8,
    },
    progressBar: {
        width: 120,
        height: 6,
        backgroundColor: '#e5e7eb',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
});
