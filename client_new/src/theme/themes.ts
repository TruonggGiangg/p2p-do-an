/**
 * Theme System - Light & Dark Mode Support
 * Modern Fintech Design with Glassmorphism
 */

export type ThemeMode = 'light' | 'dark';

// ========== DARK THEME COLORS ==========
const DarkColors = {
    // Backgrounds - Binance Deep Dark
    background: '#111318',
    backgroundSecondary: '#1E2329',
    backgroundTertiary: '#2B3139',

    // Surfaces
    glassDark: 'rgba(30, 35, 41, 0.7)',
    glassLight: 'rgba(255, 255, 255, 0.05)',
    surface: '#1E2329',
    surfaceLight: '#2B3139',

    // Primary - Binance Yellow
    primary: '#FCD535',
    primaryDark: '#C9A514',
    primaryLight: '#FFE066',
    primaryGlass: 'rgba(252, 213, 53, 0.1)',
    primaryBorder: 'rgba(252, 213, 53, 0.3)',

    // Success - Binance Green
    success: '#0ECB81',
    successDark: '#0A9D63',
    successGlass: 'rgba(14, 203, 129, 0.1)',
    successBorder: 'rgba(14, 203, 129, 0.3)',

    // Error - Binance Red
    error: '#F6465D',
    errorDark: '#D9304E',
    errorGlass: 'rgba(246, 70, 93, 0.1)',
    errorBorder: 'rgba(246, 70, 93, 0.3)',

    // Warning - Orange/Yellow
    warning: '#F0B90B',
    warningDark: '#C99D09',
    warningGlass: 'rgba(240, 185, 11, 0.1)',
    warningBorder: 'rgba(240, 185, 11, 0.3)',

    // Text
    text: '#EAECEF',
    textPrimary: '#EAECEF',
    textSecondary: '#848E9C',
    textMuted: '#5E6673',
    textDim: '#474D57',

    // Borders
    border: '#2B3139',
    borderLight: '#2B3139',
    borderGlow: 'rgba(252, 213, 53, 0.1)',
};

// ========== LIGHT THEME COLORS ==========
const LightColors = {
    // Backgrounds
    background: '#FFFFFF',
    backgroundSecondary: '#F8F8F6',
    backgroundTertiary: '#EAECEF',

    // Surfaces
    glassDark: 'rgba(255, 255, 255, 0.9)',
    glassLight: 'rgba(255, 255, 255, 0.7)',
    surface: '#FFFFFF',
    surfaceLight: '#F8F8F6',

    // Primary - Binance Gold/Yellow
    primary: '#ecc813',
    primaryDark: '#d9b812',
    primaryLight: '#fde047',
    primaryGlass: 'rgba(236, 200, 19, 0.1)',
    primaryBorder: 'rgba(236, 200, 19, 0.4)',

    // Success - Green
    success: '#0ECB81',
    successDark: '#0A9D63',
    successGlass: 'rgba(14, 203, 129, 0.1)',
    successBorder: 'rgba(14, 203, 129, 0.4)',

    // Error - Red
    error: '#F6465D',
    errorDark: '#D9304E',
    errorGlass: 'rgba(246, 70, 93, 0.1)',
    errorBorder: 'rgba(246, 70, 93, 0.4)',

    // Warning - Yellow
    warning: '#F0B90B',
    warningDark: '#C99D09',
    warningGlass: 'rgba(240, 185, 11, 0.1)',
    warningBorder: 'rgba(240, 185, 11, 0.4)',

    // Text
    text: '#1E2329',
    textPrimary: '#1E2329',
    textSecondary: '#707A8A',
    textMuted: '#929AA5',
    textDim: '#B7BDC6',

    // Borders
    border: '#EAECEF',
    borderLight: '#F5F5F5',
    borderGlow: 'rgba(236, 200, 19, 0.2)',
};

// ========== GRADIENTS ==========
export const Gradients = {
    dark: {
        // Smooth Yellow/Gold gradient
        background: ['#111318', '#1E2329', '#111318'],
        primary: ['#FCD535', '#EAC126', '#EAC126'],
        primaryAlt: ['#FFE066', '#FCD535', '#FCD535'],
        success: ['#0ECB81', '#059669'],
        error: ['#F6465D', '#D9304E'],
        warning: ['#F0B90B', '#C99D09'],
        bnpl: ['#FCD535', '#F0B90B'],
    },
    light: {
        background: ['#FFFFFF', '#F8F8F6', '#FFFFFF'],
        primary: ['#ecc813', '#d9b812', '#d9b812'],
        primaryAlt: ['#fde047', '#ecc813', '#ecc813'],
        success: ['#0ECB81', '#059669'],
        error: ['#F6465D', '#D9304E'],
        warning: ['#F0B90B', '#C99D09'],
        bnpl: ['#ecc813', '#F0B90B'],
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
