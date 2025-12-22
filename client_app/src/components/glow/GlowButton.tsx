import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { DarkColors, DarkGradients, DarkStyling } from '../../theme';

interface GlowButtonProps {
    title: string;
    onPress: () => void;
    loading?: boolean;
    icon?: string;
    disabled?: boolean;
    style?: ViewStyle;
    variant?: 'primary' | 'glass';
    gradientColors?: readonly [string, string, ...string[]];
    textStyle?: TextStyle;
}

export const GlowButton: React.FC<GlowButtonProps> = ({
    title,
    onPress,
    loading = false,
    icon,
    disabled = false,
    style,
    variant = 'primary',
    gradientColors,
    textStyle
}) => {
    const isGlass = variant === 'glass';
    const defaultGradient = isGlass
        ? ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']
        : DarkGradients.primaryButton;

    const colors = gradientColors || defaultGradient;

    return (
        <TouchableOpacity
            style={[
                styles.button,
                isGlass && styles.buttonGlass,
                disabled && styles.buttonDisabled,
                style
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
        >
            <LinearGradient
                colors={disabled ? [DarkColors.textMuted, DarkColors.textMuted] : colors as any}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                {loading ? (
                    <ActivityIndicator color={DarkColors.white} />
                ) : (
                    <>
                        {icon && (
                            <MaterialCommunityIcons
                                name={icon}
                                size={24}
                                color={textStyle?.color || (isGlass ? DarkColors.primary : DarkColors.white) as any}
                                style={styles.icon}
                            />
                        )}
                        <Text style={[
                            styles.text,
                            isGlass && styles.textGlass,
                            textStyle
                        ]}>{title}</Text>
                    </>
                )}
            </LinearGradient>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        borderRadius: DarkStyling.borderRadius.md,
        overflow: 'hidden',
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 30,
        elevation: 12,
    },
    buttonGlass: {
        shadowOpacity: 0,
        elevation: 0,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    gradient: {
        flexDirection: 'row',
        padding: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    icon: {
        marginRight: 8,
    },
    text: {
        color: DarkColors.white,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    textGlass: {
        color: DarkColors.primary,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
});
