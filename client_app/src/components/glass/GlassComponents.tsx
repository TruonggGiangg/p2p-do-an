// Shared Glassmorphism Components for Consistent UI
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { UnifiedColors, UnifiedGradients, UnifiedSpacing, UnifiedRadius, UnifiedBlur } from '../../theme';

// Re-export for convenience (single source of truth from theme)
export const GlassTokens = {
    colors: UnifiedColors,
    gradients: UnifiedGradients,
    spacing: UnifiedSpacing,
    radius: UnifiedRadius,
    blur: UnifiedBlur,
};

// Glass Card Component - Fixed border radius clipping
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
    blur = GlassTokens.blur.light
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
                    border: GlassTokens.colors.borderGlass,
                };
        }
    };

    const colors = getColors();

    // Extract borderRadius from style if present, otherwise use default
    const flatStyle = StyleSheet.flatten(style) || {};
    const radius = flatStyle.borderRadius ?? GlassTokens.radius.xl;

    return (
        <View style={[styles.glassCardWrapper, style, { borderRadius: radius }]}>
            <BlurView
                intensity={blur}
                tint="dark"
                style={[styles.glassBlurView, {
                    borderColor: colors.border,
                    borderRadius: radius
                }]}
            >
                <View style={[styles.glassCardInner, {
                    backgroundColor: colors.bg,
                    borderRadius: radius
                }]}>
                    {children}
                </View>
            </BlurView>
        </View>
    );
};

// Info Row Component
interface InfoRowProps {
    label: string;
    value: string | number;
    accent?: boolean;
}

export const InfoRow: React.FC<InfoRowProps> = ({ label, value, accent }) => (
    <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[
            styles.infoValue,
            accent && { color: GlassTokens.colors.primary }
        ]}>
            {value}
        </Text>
    </View>
);

// Section Title Component
interface SectionTitleProps {
    children: React.ReactNode;
    style?: TextStyle;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({ children, style }) => (
    <Text style={[styles.sectionTitle, style]}>{children}</Text>
);

// Glass Button Component
interface GlassButtonProps {
    children: React.ReactNode;
    onPress: () => void;
    variant?: 'primary' | 'success' | 'error' | 'outline';
    style?: ViewStyle;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
    children,
    onPress,
    variant = 'primary',
    style
}) => {
    const getGradient = () => {
        switch (variant) {
            case 'success':
                return GlassTokens.gradients.success;
            case 'error':
                return GlassTokens.gradients.error;
            default:
                return GlassTokens.gradients.primary;
        }
    };

    if (variant === 'outline') {
        return (
            <BlurView intensity={20} tint="dark" style={[styles.buttonOutline, style]}>
                <Text style={styles.buttonOutlineText}>{children}</Text>
            </BlurView>
        );
    }

    return (
        <LinearGradient
            colors={getGradient()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, style]}
        >
            <Text style={styles.buttonText}>{children}</Text>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    // Wrapper to enforce border radius clipping
    glassCardWrapper: {
        overflow: 'hidden',
        borderRadius: GlassTokens.radius.xl, // Default radius
        marginBottom: GlassTokens.spacing.md,
    },
    glassBlurView: {
        borderWidth: 0, // Increased for better visibility
        flex: 1,
    },
    glassCardInner: {
        padding: GlassTokens.spacing.lg,
    },

    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start', // Align to top for multiline text
        paddingVertical: GlassTokens.spacing.sm,
        borderBottomWidth: 0.5,
        borderBottomColor: GlassTokens.colors.borderGlassSubtle,
    },
    infoLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        letterSpacing: 0.1,
        maxWidth: '35%', // Prevent label from getting too wide
        marginTop: 2, // Slight adjustment for alignment with value line-height
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: -0.2,
        flex: 1, // Take up remaining space
        textAlign: 'right', // Align to right
        marginLeft: 16, // Add breathing room from label
    },

    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        marginBottom: GlassTokens.spacing.md,
        letterSpacing: -0.3,
    },

    button: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: GlassTokens.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    buttonOutline: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: GlassTokens.radius.md,
        borderWidth: 0,
        borderColor: GlassTokens.colors.borderGlass,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: GlassTokens.colors.glassLight,
        overflow: 'hidden',
    },
    buttonOutlineText: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: 0.5,
    },
});
