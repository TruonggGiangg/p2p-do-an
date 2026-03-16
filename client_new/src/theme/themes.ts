/**
 * Theme System — Finesse Wallet Design
 * Clean fintech palette: Dark Teal + Lime Green
 * Inspired by modern Vietnamese banking apps
 */

export type ThemeMode = 'light' | 'dark';

// ========== DARK THEME COLORS ==========
const DarkColors = {
    // Backgrounds — Deep teal-black
    background: '#0B1A14',
    backgroundSecondary: '#14261E',
    backgroundTertiary: '#1A3028',

    // Surfaces
    glassDark: 'rgba(20, 38, 30, 0.7)',
    glassLight: 'rgba(255, 255, 255, 0.05)',
    surface: '#1A3028',
    surfaceLight: '#1E3D30',

    // Primary — Lime Green (CTA)
    primary: '#CDEA2D',
    primaryDark: '#A8C020',
    primaryLight: '#DEFF5E',
    primaryGlass: 'rgba(205, 234, 45, 0.12)',
    primaryBorder: 'rgba(205, 234, 45, 0.3)',

    // Accent — Dark Teal (headers, icon circles, feature cards)
    accent: '#1A3B34',
    accentDark: '#14342B',
    accentLight: '#245649',
    accentGlass: 'rgba(26, 59, 52, 0.5)',

    // Success — Green
    success: '#0ECB81',
    successDark: '#0A9D63',
    successGlass: 'rgba(14, 203, 129, 0.12)',
    successBorder: 'rgba(14, 203, 129, 0.3)',

    // Error — Red
    error: '#F6465D',
    errorDark: '#D9304E',
    errorGlass: 'rgba(246, 70, 93, 0.12)',
    errorBorder: 'rgba(246, 70, 93, 0.3)',

    // Warning
    warning: '#F0B90B',
    warningDark: '#C99D09',
    warningGlass: 'rgba(240, 185, 11, 0.12)',
    warningBorder: 'rgba(240, 185, 11, 0.3)',

    // Text
    text: '#EAECEF',
    textPrimary: '#EAECEF',
    textSecondary: '#7A8A82',
    textMuted: '#5A6B62',
    textDim: '#3D4F46',

    // Borders
    border: '#1E3D30',
    borderLight: '#245649',
    borderGlow: 'rgba(205, 234, 45, 0.1)',
};

// ========== LIGHT THEME COLORS ==========
const LightColors = {
    // Backgrounds — Warm light gray
    background: '#F5F5F0',
    backgroundSecondary: '#FFFFFF',
    backgroundTertiary: '#EAEBE6',

    // Surfaces
    glassDark: 'rgba(255, 255, 255, 0.9)',
    glassLight: 'rgba(255, 255, 255, 0.7)',
    surface: '#FFFFFF',
    surfaceLight: '#F8F8F4',

    // Primary — Lime Green (CTA)
    primary: '#CDEA2D',
    primaryDark: '#B5D125',
    primaryLight: '#DEFF5E',
    primaryGlass: 'rgba(205, 234, 45, 0.15)',
    primaryBorder: 'rgba(205, 234, 45, 0.4)',

    // Accent — Dark Teal
    accent: '#14342B',
    accentDark: '#0D2820',
    accentLight: '#1A3B34',
    accentGlass: 'rgba(20, 52, 43, 0.08)',

    // Success — Green
    success: '#0ECB81',
    successDark: '#0A9D63',
    successGlass: 'rgba(14, 203, 129, 0.1)',
    successBorder: 'rgba(14, 203, 129, 0.4)',

    // Error — Red
    error: '#F6465D',
    errorDark: '#D9304E',
    errorGlass: 'rgba(246, 70, 93, 0.1)',
    errorBorder: 'rgba(246, 70, 93, 0.4)',

    // Warning
    warning: '#F0B90B',
    warningDark: '#C99D09',
    warningGlass: 'rgba(240, 185, 11, 0.1)',
    warningBorder: 'rgba(240, 185, 11, 0.4)',

    // Text — Darkened for better light-mode contrast
    text: '#111111',
    textPrimary: '#111111',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    textDim: '#9CA3AF',

    // Borders
    border: '#E8E8E4',
    borderLight: '#F0F0EC',
    borderGlow: 'rgba(205, 234, 45, 0.2)',
};

// ========== GRADIENTS ==========
export const Gradients = {
    dark: {
        background: ['#0B1A14', '#14261E', '#0B1A14'],
        primary: ['#CDEA2D', '#B5D125', '#A8C020'],
        primaryAlt: ['#DEFF5E', '#CDEA2D', '#B5D125'],
        accent: ['#14342B', '#1A3B34', '#245649'],
        success: ['#0ECB81', '#059669'],
        error: ['#F6465D', '#D9304E'],
        warning: ['#F0B90B', '#C99D09'],
        bnpl: ['#CDEA2D', '#B5D125'],
    },
    light: {
        background: ['#F5F5F0', '#FFFFFF', '#F5F5F0'],
        primary: ['#CDEA2D', '#B5D125', '#A8C020'],
        primaryAlt: ['#DEFF5E', '#CDEA2D', '#B5D125'],
        accent: ['#14342B', '#1A3B34', '#1E4D3F'],
        success: ['#0ECB81', '#059669'],
        error: ['#F6465D', '#D9304E'],
        warning: ['#F0B90B', '#C99D09'],
        bnpl: ['#CDEA2D', '#B5D125'],
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
    md: 14,
    lg: 20,
    xl: 24,
    xxl: 28,
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
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 8,
        },
    },
    light: {
        card: {
            shadowColor: '#14342B',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.06,
            shadowRadius: 16,
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
