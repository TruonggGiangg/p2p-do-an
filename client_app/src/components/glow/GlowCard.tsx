import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { DarkColors, DarkStyling } from '../../theme';

interface GlowCardProps {
    children: React.ReactNode;
    variant?: 'default' | 'primary' | 'glass';
    style?: ViewStyle;
}

export const GlowCard: React.FC<GlowCardProps> = ({
    children,
    variant = 'default',
    style
}) => {
    const cardStyle = [
        styles.card,
        variant === 'primary' && styles.cardPrimary,
        variant === 'glass' && styles.cardGlass,
        style
    ];

    return (
        <View style={cardStyle}>
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.lg,
        borderWidth: 1,
        borderColor: DarkColors.border,
        padding: 16,
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 8,
    },
    cardPrimary: {
        backgroundColor: DarkColors.surfaceGlass,
        borderColor: DarkColors.borderGlow,
    },
    cardGlass: {
        backgroundColor: DarkColors.surfaceGlass,
        borderColor: DarkColors.borderLight,
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 5,
    },
});
