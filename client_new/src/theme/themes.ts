/**
 * Theme System - Light & Dark Mode Support
 * Modern Fintech Design with Glassmorphism
 */

export type ThemeMode = 'light' | 'dark';

// ========== DARK THEME COLORS ==========
const DarkColors = {
    // Backgrounds - Darker purple/blue base
    background: '#0f0a1a',
    backgroundSecondary: '#1a0f2e',
    backgroundTertiary: '#251a3a',

    // Glass surfaces
    glassDark: 'rgba(30, 30, 30, 0.65)',
    glassLight: 'rgba(255, 255, 255, 0.1)',
    surface: 'rgba(26, 31, 58, 0.75)',
    surfaceLight: 'rgba(37, 43, 74, 0.6)',

    // Primary - Purple/Blue gradient colors
    primary: '#8b5cf6', // Purple as primary
    primaryDark: '#6366f1', // Indigo
    primaryLight: '#a855f7', // Lighter purple
    primaryGlass: 'rgba(139, 92, 246, 0.15)',
    primaryBorder: 'rgba(139, 92, 246, 0.35)',

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

// ========== LIGHT THEME COLORS ==========
const LightColors = {
    // Backgrounds - Very light purple/white tint
    background: '#faf5ff', // Very light purple
    backgroundSecondary: '#f3e8ff', // Light purple tint
    backgroundTertiary: '#ede9fe', // Lighter purple tint

    // Glass surfaces
    glassDark: 'rgba(255, 255, 255, 0.8)',
    glassLight: 'rgba(255, 255, 255, 0.6)',
    surface: 'rgba(255, 255, 255, 0.9)',
    surfaceLight: 'rgba(255, 255, 255, 0.7)',

    // Primary - Blue
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    primaryLight: '#60a5fa',
    primaryGlass: 'rgba(59, 130, 246, 0.15)',
    primaryBorder: 'rgba(59, 130, 246, 0.4)',

    // Success - Green
    success: '#10b981',
    successDark: '#059669',
    successGlass: 'rgba(16, 185, 129, 0.15)',
    successBorder: 'rgba(16, 185, 129, 0.4)',

    // Error - Red
    error: '#ef4444',
    errorDark: '#dc2626',
    errorGlass: 'rgba(239, 68, 68, 0.15)',
    errorBorder: 'rgba(239, 68, 68, 0.4)',

    // Warning - Yellow
    warning: '#f59e0b',
    warningDark: '#d97706',
    warningGlass: 'rgba(245, 158, 11, 0.15)',
    warningBorder: 'rgba(245, 158, 11, 0.4)',

    // Text
    text: '#0f172a',
    textPrimary: '#0f172a',
    textSecondary: 'rgba(15, 23, 42, 0.7)',
    textMuted: 'rgba(15, 23, 42, 0.5)',
    textDim: 'rgba(15, 23, 42, 0.3)',

    // Borders
    border: 'rgba(15, 23, 42, 0.1)',
    borderLight: 'rgba(15, 23, 42, 0.05)',
    borderGlow: 'rgba(59, 130, 246, 0.3)',
};

// ========== GRADIENTS ==========
export const Gradients = {
    dark: {
        // Smooth Purple/Blue gradient for premium feel
        background: ['#0f0a1a', '#1a0f2e', '#0f0a1a'],
        primary: ['#8b5cf6', '#6366f1', '#3b82f6'], // Purple to Blue smooth gradient
        primaryAlt: ['#a855f7', '#8b5cf6', '#6366f1'], // Alternative purple gradient
        success: ['#10b981', '#059669'],
        error: ['#ef4444', '#dc2626'],
        warning: ['#f59e0b', '#d97706'],
        bnpl: ['#ec4899', '#db2777'],
    },
    light: {
        // Light mode with subtle purple/blue tints
        background: ['#faf5ff', '#f3e8ff', '#faf5ff'], // Very light purple tint
        primary: ['#8b5cf6', '#6366f1', '#3b82f6'], // Same gradient for consistency
        primaryAlt: ['#a855f7', '#8b5cf6', '#6366f1'],
        success: ['#10b981', '#059669'],
        error: ['#ef4444', '#dc2626'],
        warning: ['#f59e0b', '#d97706'],
        bnpl: ['#ec4899', '#db2777'],
    },
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
    lg: 16, // Standard card radius
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
    dark: {
        card: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 5,
        },
        glow: {
            shadowColor: DarkColors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 8,
        },
    },
    light: {
        card: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 3,
        },
        glow: {
            shadowColor: LightColors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 16,
            elevation: 6,
        },
    },
};

// ========== THEME OBJECTS ==========
export const themes = {
    dark: {
        mode: 'dark' as ThemeMode,
        colors: DarkColors,
        gradients: Gradients.dark,
        spacing: Spacing,
        radius: Radius,
        blur: Blur,
        shadows: Shadows.dark,
    },
    light: {
        mode: 'light' as ThemeMode,
        colors: LightColors,
        gradients: Gradients.light,
        spacing: Spacing,
        radius: Radius,
        blur: Blur,
        shadows: Shadows.light,
    },
};

export type Theme = typeof themes.dark;
