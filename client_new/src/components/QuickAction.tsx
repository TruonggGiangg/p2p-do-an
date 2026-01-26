import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface QuickActionProps {
    icon: string;
    label: string;
    onPress?: () => void;
    // Accept any readonly string array to be flexible with Gradients.* definitions
    colors?: readonly string[];
    iconSize?: number;
    style?: ViewStyle;
    disabled?: boolean;
}

export const QuickAction: React.FC<QuickActionProps> = ({
    icon,
    label,
    onPress,
    colors = ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)'],
    iconSize = 24,
    style,
    disabled = false,
}) => {
    const { theme } = useTheme();
    return (
        <TouchableOpacity style={[styles.container, style]} onPress={onPress} activeOpacity={0.8} disabled={disabled}>
            <LinearGradient
                colors={colors as any}
                style={[
                    styles.iconCircle,
                    {
                        borderRadius: theme.radius.lg,
                        ...theme.shadows.card,
                    },
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <MaterialCommunityIcons name={icon as any} size={iconSize} color="white" />
            </LinearGradient>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {label}
            </Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    iconCircle: {
        width: 60,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    label: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        maxWidth: 85,
        flexShrink: 1,
    },
});

export default QuickAction;
