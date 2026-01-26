import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

interface GlassCardProps {
    children: ReactNode;
    style?: ViewStyle;
    variant?: 'default' | 'primary' | 'success' | 'error';
    blur?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({
    children,
    style,
    variant = 'default',
    blur,
}) => {
    const { theme } = useTheme();
    const isDark = theme.mode === 'dark';
    const blurIntensity = blur ?? theme.blur.light;
    const isIOS = Platform.OS === 'ios';

    const getColors = () => {
        switch (variant) {
            case 'primary':
                return {
                    bg: isDark 
                        ? (isIOS ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.25)')
                        : 'rgba(255, 255, 255, 0.95)',
                    border: theme.colors.primaryBorder,
                };
            case 'success':
                return {
                    bg: isDark 
                        ? (isIOS ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.2)')
                        : 'rgba(255, 255, 255, 0.95)',
                    border: theme.colors.successBorder,
                };
            case 'error':
                return {
                    bg: isDark 
                        ? (isIOS ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.2)')
                        : 'rgba(255, 255, 255, 0.95)',
                    border: theme.colors.errorBorder,
                };
            default:
                return {
                    bg: isDark 
                        ? (isIOS ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.12)')
                        : 'rgba(255, 255, 255, 0.95)',
                    border: isDark 
                        ? 'rgba(255, 255, 255, 0.15)' 
                        : 'rgba(0, 0, 0, 0.08)',
                };
        }
    };

    const colors = getColors();
    const flatStyle = StyleSheet.flatten(style) || {};
    const { borderRadius, backgroundColor, borderWidth, borderColor, padding, ...restStyle } = flatStyle;
    const radius = borderRadius ?? theme.radius.lg;
    const cardPadding = padding ?? 24;

    // Android: Simplified structure without BlurView
    if (!isIOS) {
        return (
            <View
                style={[
                    styles.wrapper,
                    {
                        borderRadius: radius,
                        backgroundColor: backgroundColor ?? colors.bg,
                        borderWidth: borderWidth ?? 1,
                        borderColor: borderColor ?? colors.border,
                        ...theme.shadows.card,
                    },
                ]}
            >
                {/* Subtle Gradient Overlay for Android */}
                <LinearGradient
                    colors={isDark 
                        ? ['rgba(255, 255, 255, 0.05)', 'transparent']
                        : ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.95)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                        styles.gradientOverlay,
                        {
                            borderRadius: radius,
                        },
                    ]}
                />
                <View
                    style={[
                        styles.inner,
                        {
                            padding: cardPadding,
                        },
                        restStyle,
                    ]}
                >
                    {children}
                </View>
            </View>
        );
    }

    // iOS: Full glassmorphism with BlurView
    return (
        <View
            style={[
                styles.wrapper,
                {
                    borderRadius: radius,
                    ...theme.shadows.card,
                },
            ]}
        >
            <BlurView
                intensity={blurIntensity}
                tint={isDark ? 'dark' : 'light'}
                style={[
                    styles.blurView,
                    {
                        borderRadius: radius,
                    },
                ]}
            >
                <View
                    style={[
                        styles.baseBackground,
                        {
                            backgroundColor: backgroundColor ?? colors.bg,
                            borderRadius: radius,
                        },
                    ]}
                />
                <LinearGradient
                    colors={isDark 
                        ? ['rgba(255, 255, 255, 0.05)', 'transparent', 'rgba(0, 0, 0, 0.1)']
                        : ['rgba(255, 255, 255, 0.8)', 'rgba(255, 255, 255, 0.95)', 'rgba(248, 250, 252, 0.9)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                        styles.gradientOverlay,
                        {
                            borderRadius: radius,
                        },
                    ]}
                />
                <View
                    style={[
                        styles.border,
                        {
                            borderRadius: radius,
                            borderWidth: borderWidth ?? 1,
                            borderColor: borderColor ?? colors.border,
                        },
                    ]}
                />
                <View
                    style={[
                        styles.inner,
                        {
                            padding: cardPadding,
                            borderRadius: radius,
                        },
                        restStyle,
                    ]}
                >
                    {children}
                </View>
            </BlurView>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        overflow: 'hidden',
        marginBottom: 16,
        width: '100%',
    },
    blurView: {
        flex: 1,
        overflow: 'hidden',
    },
    baseBackground: {
        ...StyleSheet.absoluteFillObject,
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    border: {
        ...StyleSheet.absoluteFillObject,
        borderStyle: 'solid',
    },
    inner: {
        position: 'relative',
        zIndex: 1,
    },
});

export default GlassCard;
