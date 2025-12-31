import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { GlassTokens } from './GlassComponents';

interface QuickActionProps {
    icon: string;
    label: string;
    onPress: () => void;
    colors?: readonly [string, string, ...string[]];
    iconSize?: number;
    style?: ViewStyle;
}

export const QuickAction: React.FC<QuickActionProps> = ({
    icon,
    label,
    onPress,
    colors = ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)'], // Default minimal glass
    iconSize = 24,
    style
}) => {
    return (
        <TouchableOpacity style={[styles.container, style]} onPress={onPress} activeOpacity={0.8}>
            <LinearGradient
                colors={colors}
                style={styles.iconCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <MaterialCommunityIcons name={icon} size={iconSize} color="white" />
            </LinearGradient>
            <Text style={styles.label}>{label}</Text>
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
        borderRadius: 20, // Squircle shape (Modern standard)
        justifyContent: 'center',
        alignItems: 'center',
        // Subtle Shadow / Glow
        shadowColor: "white",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    label: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_500Medium',
        fontWeight: '500',
        letterSpacing: 0.2,
    },
});
