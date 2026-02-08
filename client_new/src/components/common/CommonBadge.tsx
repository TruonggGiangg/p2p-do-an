import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface CommonBadgeProps {
    label: string;
    variant?: 'success' | 'error' | 'warning' | 'info' | 'primary' | 'muted';
    outline?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export const CommonBadge: React.FC<CommonBadgeProps> = ({
    label,
    variant = 'info',
    outline = false,
    style,
    textStyle,
}) => {
    const { theme } = useTheme();

    const getVariantStyles = () => {
        const colors = {
            success: theme.colors.success,
            error: theme.colors.error,
            warning: theme.colors.warning,
            info: theme.colors.textSecondary,
            primary: theme.colors.primary,
            muted: theme.colors.textMuted,
        };

        const bgColors = {
            success: theme.colors.successGlass,
            error: theme.colors.errorGlass,
            warning: theme.colors.warningGlass,
            info: theme.colors.surfaceLight,
            primary: theme.colors.primaryGlass,
            muted: theme.colors.surfaceLight,
        };

        const color = colors[variant];
        const backgroundColor = outline ? 'transparent' : bgColors[variant];

        return {
            container: {
                backgroundColor,
                borderColor: outline ? color : 'transparent',
                borderWidth: outline ? 1 : 0,
            },
            text: {
                color,
            },
        };
    };

    const vStyles = getVariantStyles();

    return (
        <View style={[styles.container, vStyles.container, style]}>
            <Text style={[styles.text, vStyles.text, textStyle]}>{label}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    text: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
    },
});
