/**
 * Cyberpunk Theme - Dark Navy with Red Glow
 * Inspired by samurai/katana aesthetic
 */

export const CyberpunkColors = {
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

    // Card backgrounds with gradient
    card: 'rgba(26, 31, 58, 0.7)',
    cardGlass: 'rgba(255, 255, 255, 0.03)',
};

export const CyberpunkGradients = {
    // Background gradients
    background: ['#0a0e27', '#1a1f3a', '#0a0e27'],

    // Red glow gradient (for hero sections)
    redGlow: ['rgba(255, 0, 64, 0.0)', 'rgba(255, 0, 64, 0.2)', 'rgba(255, 0, 64, 0.0)'],

    // Purple/Pink gradient
    purpleGlow: ['rgba(139, 58, 139, 0.0)', 'rgba(139, 58, 139, 0.3)', 'rgba(182, 73, 182, 0.2)'],

    // Cyan accent gradient
    cyanGlow: ['rgba(0, 217, 255, 0.0)', 'rgba(0, 217, 255, 0.2)', 'rgba(0, 217, 255, 0.0)'],

    // Button gradients
    primaryButton: ['#ff0040', '#cc0033'],
    secondaryButton: ['#8b3a8b', '#6b2a6b'],
    accentButton: ['#00d9ff', '#00a9cc'],
};

// Aurora orb positions for mesh gradient effect
export const AuroraOrbs = {
    orb1: {
        position: 'absolute' as const,
        top: -100,
        left: -100,
        width: 350,
        height: 350,
        borderRadius: 175,
        backgroundColor: 'rgba(255, 0, 64, 0.15)', // Red
        opacity: 0.8,
    },
    orb2: {
        position: 'absolute' as const,
        top: '45%',
        right: -80,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(139, 58, 139, 0.15)', // Purple
        opacity: 0.6,
    },
    orb3: {
        position: 'absolute' as const,
        bottom: -120,
        left: '30%',
        width: 400,
        height: 400,
        borderRadius: 200,
        backgroundColor: 'rgba(0, 217, 255, 0.12)', // Cyan
        opacity: 0.5,
    },
};

export const CyberpunkStyling = {
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
        },
        glow: {
            shadowColor: '#ff0040',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
            elevation: 8,
        },
        glowStrong: {
            shadowColor: '#ff0040',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 30,
            elevation: 12,
        },
        subtle: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        },
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
    backdropFilter: 'blur(10px)', // Note: React Native doesn't support this, just for reference
};

export default {
    CyberpunkColors,
    CyberpunkGradients,
    AuroraOrbs,
    CyberpunkStyling,
    GlassMorphism,
};
