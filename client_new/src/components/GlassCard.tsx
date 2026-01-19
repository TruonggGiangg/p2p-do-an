import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassTokens } from '../theme';

interface GlassCardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    variant?: 'default' | 'primary' | 'success' | 'error';
    blur?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({
    children,
    style,
    variant = 'default',
    blur = GlassTokens.blur.light,
}) => {
    const getColors = () => {
        switch (variant) {
            case 'primary':
                return {
                    bg: GlassTokens.colors.primaryGlass,
                    border: GlassTokens.colors.primaryBorder,
                };
            case 'success':
                return {
                    bg: GlassTokens.colors.successGlass,
                    border: GlassTokens.colors.successBorder,
                };
            case 'error':
                return {
                    bg: GlassTokens.colors.errorGlass,
                    border: GlassTokens.colors.errorBorder,
                };
            default:
                return {
                    bg: GlassTokens.colors.glassDark,
                    border: GlassTokens.colors.border,
                };
        }
    };

    const colors = getColors();
    const flatStyle = StyleSheet.flatten(style) || {};
    const { borderRadius, backgroundColor, borderWidth, borderColor, ...restStyle } = flatStyle;
    const radius = borderRadius ?? GlassTokens.radius.lg;

    return (
        <View style={[styles.wrapper, { borderRadius: radius }]}>
            <BlurView intensity={blur} tint="dark" style={[styles.blurView, { borderRadius: radius, borderWidth: borderWidth ?? 1, borderColor: borderColor ?? colors.border }]}>
                <View style={[styles.inner, restStyle, { backgroundColor: backgroundColor ?? colors.bg, borderRadius: radius }]}>{children}</View>
            </BlurView>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        overflow: 'hidden',
        borderRadius: GlassTokens.radius.lg,
        marginBottom: GlassTokens.spacing.md,
    },
    blurView: {
        flex: 1,
    },
    inner: {
        padding: GlassTokens.spacing.lg,
    },
});

export default GlassCard;
