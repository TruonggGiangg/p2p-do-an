/**
 * Theme System - Modern Fintech Dark Theme
 * Inspired by iOS design with glassmorphism
 */

// ========== COLORS ==========
export const Colors = {
    // Backgrounds
    background: '#0a0e27',
    backgroundSecondary: '#1a1f3a',
    backgroundTertiary: '#252b4a',

    // Glass surfaces
    glassDark: 'rgba(30, 30, 30, 0.65)',
    glassLight: 'rgba(255, 255, 255, 0.1)',
    surface: 'rgba(26, 31, 58, 0.75)',
    surfaceLight: 'rgba(37, 43, 74, 0.6)',

    // Primary - Blue
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    primaryGlass: 'rgba(59, 130, 246, 0.12)',
    primaryBorder: 'rgba(59, 130, 246, 0.3)',

    // Success - Green
    success: '#10b981',
    successDark: '#059669',
    successGlass: 'rgba(16, 185, 129, 0.12)',
    successBorder: 'rgba(16, 185, 129, 0.3)',

    // Error - Red
    error: '#ef4444',
    errorDark: '#dc2626',
    errorGlass: 'rgba(239, 68, 68, 0.12)',
    errorBorder: 'rgba(239, 68, 68, 0.3)',

    // Warning - Yellow
    warning: '#f59e0b',
    warningDark: '#d97706',
    warningGlass: 'rgba(245, 158, 11, 0.12)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',

    // Text
    text: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    textDim: 'rgba(255, 255, 255, 0.3)',

    // Borders
    border: 'rgba(255, 255, 255, 0.1)',
    borderLight: 'rgba(255, 255, 255, 0.05)',
    borderGlow: 'rgba(59, 130, 246, 0.2)',
};

// ========== GRADIENTS ==========
export const Gradients = {
    background: ['#0a0e27', '#1a1f3a', '#0a0e27'],
    primary: ['#3b82f6', '#2563eb'],
    success: ['#10b981', '#059669'],
    error: ['#ef4444', '#dc2626'],
    warning: ['#f59e0b', '#d97706'],
    bnpl: ['#ec4899', '#db2777'],
};

// ========== SPACING ==========
export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

// ========== BORDER RADIUS ==========
export const Radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 9999,
};

// ========== BLUR ==========
export const Blur = {
    light: 15,
    medium: 30,
    heavy: 50,
};

// ========== SHADOWS ==========
export const Shadows = {
    card: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    glow: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 8,
    },
};

// ========== GLASS TOKENS ==========
export const GlassTokens = {
    colors: Colors,
    gradients: Gradients,
    spacing: Spacing,
    radius: Radius,
    blur: Blur,
    shadows: Shadows,
};

export default {
    Colors,
    Gradients,
    Spacing,
    Radius,
    Blur,
    Shadows,
    GlassTokens,
};
