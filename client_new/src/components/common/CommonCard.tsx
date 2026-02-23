import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity, StyleProp } from 'react-native';
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
    padding = 16,
}) => {
    const { theme } = useTheme();

    const getVariantStyles = () => {
        switch (variant) {
            case 'surface':
                return {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                };
            case 'outline':
                return {
                    backgroundColor: 'transparent',
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                };
            default:
                return {
                    backgroundColor: theme.colors.backgroundSecondary,
                    borderColor: theme.colors.border,
                };
        }
    };

    const cardStyles = [
        styles.card,
        { padding, borderRadius: theme.radius.md },
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
        borderWidth: 1,
    },
});
