import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GlassTokens } from '../theme';

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
    return (
        <TouchableOpacity style={[styles.container, style]} onPress={onPress} activeOpacity={0.8} disabled={disabled}>
            <LinearGradient colors={colors} style={styles.iconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name={icon as any} size={iconSize} color="white" />
            </LinearGradient>
            <Text style={styles.label} numberOfLines={2}>
                {label}
            </Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 8,
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: 'white',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    label: {
        fontSize: 11,
        color: GlassTokens.colors.textSecondary,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: 80,
    },
});

export default QuickAction;
