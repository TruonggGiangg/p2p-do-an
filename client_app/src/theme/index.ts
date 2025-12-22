/**
 * Cyberpunk Theme - Dark Navy with Red Glow
 * Unified theme for entire app - Samurai/Katana aesthetic
 */

// Main color palette
export const DarkColors = {
    // Background - Deep dark navy/blue
    background: '#0a0e27',
    backgroundSecondary: '#1a1f3a',
    backgroundTertiary: '#252b4a',

    // Surface colors with slight transparency
    surface: 'rgba(26, 31, 58, 0.8)',
    surfaceLight: 'rgba(37, 43, 74, 0.6)',
    surfaceGlass: 'rgba(255, 255, 255, 0.05)',

    // Red accents - Primary theme color
    primary: '#ff0040',
    primaryDark: '#cc0033',
    primaryGlow: 'rgba(255, 0, 64, 0.4)',

    // Purple/Magenta accents
    secondary: '#8b3a8b',
    secondaryLight: '#b649b6',
    secondaryGlow: 'rgba(139, 58, 139, 0.4)',

    // Cyan for cool contrast
    accent: '#00d9ff',
    accentGlow: 'rgba(0, 217, 255, 0.3)',

    // Text colors
    text: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    textDim: 'rgba(255, 255, 255, 0.3)',
    white: '#ffffff',

    // Status colors with glow
    success: '#00ff88',
    successGlow: 'rgba(0, 255, 136, 0.3)',
    warning: '#ffaa00',
    warningGlow: 'rgba(255, 170, 0, 0.3)',
    error: '#ff0040',
    errorGlow: 'rgba(255, 0, 64, 0.4)',

    // Borders and dividers
    border: 'rgba(255, 255, 255, 0.1)',
    borderLight: 'rgba(255, 255, 255, 0.05)',
    borderGlow: 'rgba(255, 0, 64, 0.2)',

    // Card backgrounds
    card: 'rgba(26, 31, 58, 0.7)',
    cardGlass: 'rgba(255, 255, 255, 0.03)',
};

// Gradient definitions
export const DarkGradients = {
    // Background gradients
    background: ['#0a0e27', '#1a1f3a', '#0a0e27'] as const,

    // Red glow gradient (for hero sections)
    redGlow: ['rgba(255, 0, 64, 0.0)', 'rgba(255, 0, 64, 0.2)', 'rgba(255, 0, 64, 0.0)'] as const,

    // Purple/Pink gradient
    purpleGlow: ['rgba(139, 58, 139, 0.0)', 'rgba(139, 58, 139, 0.3)', 'rgba(182, 73, 182, 0.2)'] as const,

    // Cyan accent gradient
    cyanGlow: ['rgba(0, 217, 255, 0.0)', 'rgba(0, 217, 255, 0.2)', 'rgba(0, 217, 255, 0.0)'] as const,

    // Button gradients
    primaryButton: ['#ff0040', '#cc0033'] as const,
    secondaryButton: ['#8b3a8b', '#6b2a6b'] as const,
    accentButton: ['#00d9ff', '#00a9cc'] as const,
};

// Shadow style type definition
type ShadowStyle = {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
};

// Styling constants
export const DarkStyling = {
    // Border radius
    borderRadius: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        full: 9999,
    },

    // Shadows with glow effect
    shadow: {
        card: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 3,
        } as ShadowStyle,
        glow: {
            shadowColor: '#ff0040',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
            elevation: 8,
        } as ShadowStyle,
        glowStrong: {
            shadowColor: '#ff0040',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 30,
            elevation: 12,
        } as ShadowStyle,
        subtle: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        } as ShadowStyle,
    },

    // Spacing
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
    },
};

// Glass morphism effect
export const GlassMorphism = {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
};

// Export aliases for compatibility
export const CyberpunkColors = DarkColors;
export const CyberpunkGradients = DarkGradients;
export const CyberpunkStyling = DarkStyling;

// React Native Paper theme compatibility with safe spread
export const DarkTheme = {
    dark: true,
    roundness: 16,
    version: 3 as const,
    isV3: true as const,
    colors: {
        primary: DarkColors.primary,
        onPrimary: '#FFFFFF',
        primaryContainer: DarkColors.surfaceLight,
        onPrimaryContainer: DarkColors.primary,
        secondary: DarkColors.secondary,
        onSecondary: '#FFFFFF',
        secondaryContainer: 'rgba(139, 58, 139, 0.2)',
        onSecondaryContainer: DarkColors.secondaryLight,
        tertiary: DarkColors.accent,
        onTertiary: '#000000',
        tertiaryContainer: 'rgba(0, 217, 255, 0.2)',
        onTertiaryContainer: DarkColors.accent,
        error: DarkColors.error,
        onError: '#FFFFFF',
        errorContainer: 'rgba(255, 0, 64, 0.2)',
        onErrorContainer: DarkColors.error,
        background: DarkColors.background,
        onBackground: DarkColors.text,
        surface: DarkColors.surface,
        onSurface: DarkColors.text,
        surfaceVariant: DarkColors.surfaceLight,
        onSurfaceVariant: DarkColors.textSecondary,
        surfaceDisabled: 'rgba(255, 255, 255, 0.12)',
        onSurfaceDisabled: 'rgba(255, 255, 255, 0.38)',
        outline: DarkColors.border,
        outlineVariant: DarkColors.borderLight,
        shadow: '#000000',
        scrim: '#000000',
        inverseSurface: '#E6E1E5',
        inverseOnSurface: '#313033',
        inversePrimary: DarkColors.primaryDark,
        backdrop: 'rgba(0, 0, 0, 0.4)',
        elevation: {
            level0: 'transparent',
            level1: DarkColors.surface,
            level2: DarkColors.surfaceLight,
            level3: DarkColors.surfaceLight,
            level4: DarkColors.surfaceLight,
            level5: DarkColors.surfaceLight,
        }
    },
    fonts: {
        displayLarge: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 57,
            fontWeight: '400' as const,
            letterSpacing: 0,
            lineHeight: 64,
        },
        displayMedium: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 45,
            fontWeight: '400' as const,
            letterSpacing: 0,
            lineHeight: 52,
        },
        displaySmall: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 36,
            fontWeight: '400' as const,
            letterSpacing: 0,
            lineHeight: 44,
        },
        headlineLarge: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 32,
            fontWeight: '400' as const,
            letterSpacing: 0,
            lineHeight: 40,
        },
        headlineMedium: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 28,
            fontWeight: '400' as const,
            letterSpacing: 0,
            lineHeight: 36,
        },
        headlineSmall: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 24,
            fontWeight: '400' as const,
            letterSpacing: 0,
            lineHeight: 32,
        },
        titleLarge: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 22,
            fontWeight: '500' as const,
            letterSpacing: 0,
            lineHeight: 28,
        },
        titleMedium: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 16,
            fontWeight: '500' as const,
            letterSpacing: 0.15,
            lineHeight: 24,
        },
        titleSmall: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 14,
            fontWeight: '500' as const,
            letterSpacing: 0.1,
            lineHeight: 20,
        },
        labelLarge: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 14,
            fontWeight: '500' as const,
            letterSpacing: 0.1,
            lineHeight: 20,
        },
        labelMedium: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 12,
            fontWeight: '500' as const,
            letterSpacing: 0.5,
            lineHeight: 16,
        },
        labelSmall: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 11,
            fontWeight: '500' as const,
            letterSpacing: 0.5,
            lineHeight: 16,
        },
        bodyLarge: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 16,
            fontWeight: '400' as const,
            letterSpacing: 0.5,
            lineHeight: 24,
        },
        bodyMedium: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 14,
            fontWeight: '400' as const,
            letterSpacing: 0.25,
            lineHeight: 20,
        },
        bodySmall: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 12,
            fontWeight: '400' as const,
            letterSpacing: 0.4,
            lineHeight: 16,
        },
        default: {
            fontFamily: 'Poppins_400Regular',
            fontSize: 14,
            fontWeight: '400' as const,
            letterSpacing: 0,
        },
    },
    animation: {
        scale: 1.0,
    },
};

export const PremiumTheme = DarkTheme; // Alias for compatibility

export default {
    DarkColors,
    DarkGradients,
    DarkStyling,
    DarkTheme,
    PremiumTheme,
    GlassMorphism,
};
