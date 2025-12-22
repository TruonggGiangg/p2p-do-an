import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DarkColors, DarkStyling } from '../../theme';

interface GlowBalanceProps {
    amount: number;
    label: string;
    currency?: string;
}

export const GlowBalance: React.FC<GlowBalanceProps> = ({
    amount,
    label,
    currency = 'VND'
}) => {
    const formatAmount = (num: number): string => {
        return num.toLocaleString('vi-VN');
    };

    return (
        <LinearGradient
            colors={['rgba(255, 0, 64, 0.15)', 'rgba(255, 0, 64, 0.05)']}
            style={styles.container}
        >
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.amount}>{formatAmount(amount)}</Text>
            <Text style={styles.currency}>{currency}</Text>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 24,
        borderRadius: DarkStyling.borderRadius.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.borderGlow,
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 8,
    },
    label: {
        color: DarkColors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
        marginBottom: 8,
    },
    amount: {
        color: DarkColors.primary,
        fontSize: 36,
        fontWeight: '800',
        textShadowColor: DarkColors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    currency: {
        color: DarkColors.textMuted,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 4,
    },
});
