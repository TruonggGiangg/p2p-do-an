import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity, StyleProp, Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface CommonCardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    onPress?: () => void;
    variant?: 'default' | 'surface' | 'outline';
    padding?: number;
}

export const CommonCard: React.FC<CommonCardProps> = ({
    children,
    style,
    onPress,
    variant = 'default',
    padding = 20,
}) => {
    const { theme } = useTheme();
    const isDark = theme.mode === 'dark';

    const getVariantStyles = () => {
        switch (variant) {
            case 'surface':
                return {
                    backgroundColor: theme.colors.surface,
                };
            case 'outline':
                return {
                    backgroundColor: 'transparent',
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                };
            default:
                return {
                    backgroundColor: isDark ? theme.colors.backgroundSecondary : '#FFFFFF',
                };
        }
    };

    const cardStyles = [
        styles.card,
        {
            padding,
            borderRadius: theme.radius.lg,
            ...Platform.select({
                ios: {
                    shadowColor: isDark ? '#000' : '#14342B',
                    shadowOffset: { width: 0, height: isDark ? 4 : 3 },
                    shadowOpacity: isDark ? 0.25 : 0.06,
                    shadowRadius: isDark ? 10 : 16,
                },
                android: {
                    elevation: isDark ? 4 : 3,
                },
            }),
        },
        getVariantStyles(),
        style,
    ];

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.8}
                style={cardStyles}
            >
                {children}
            </TouchableOpacity>
        );
    }

    return <View style={cardStyles}>{children}</View>;
};

const styles = StyleSheet.create({
    card: {
        width: '100%',
    },
});
