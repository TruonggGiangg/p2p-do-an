/**
 * Theme System — Finesse Wallet × Emerald Editorial
 * Generated from Stitch MCP "Emerald Editorial" design system
 * Creative North Star: "The Digital Curator"
 *
 * Palette: Deep Teal + Lime Green (#CDEA2D)
 * Font: Be Vietnam Pro
 * Principles:
 *   1. No-Line Rule — no 1px borders, use tonal bg shifts
 *   2. Tonal Layering — 5-tier surface hierarchy
 *   3. Editorial Typography — oversized display + tight labels
 *   4. Glassmorphism overlays with tinted blur
 */

export type ThemeMode = 'light' | 'dark';

// ══════════════════════════════════════════════════════════════
//  DARK THEME — "Emerald Night"
// ══════════════════════════════════════════════════════════════
const DarkColors = {
    // ── Background Surface Tiers (deepest → lightest) ──
    background:          '#071610',   // surface / deepest foundation
    backgroundSecondary: '#101E18',   // surface-container-low
    backgroundTertiary:  '#14231C',   // surface-container (cards)
    backgroundElevated:  '#1E2D26',   // surface-container-high

    // ── Surfaces ──
    surface:       '#14231C',
    surfaceLight:  '#1E2D26',
    surfaceBright: '#2D3C35',

    // ── Glass & Overlays ──
    glassDark:  'rgba(20, 35, 28, 0.7)',
    glassLight: 'rgba(255, 255, 255, 0.05)',
    glassOverlay: 'rgba(41, 56, 49, 0.4)',  // for glassmorphism

    // ── Primary — Lime Green (CTA, profit, success actions) ──
    primary:       '#CDEA2D',
    primaryDark:   '#B7D306',
    primaryLight:  '#D3F034',
    primarySoft:   '#F6FFC0',         // softest primary tint (text on dark)
    primaryGlass:  'rgba(205, 234, 45, 0.12)',
    primaryBorder: 'rgba(205, 234, 45, 0.3)',
    onPrimary:     '#2C3400',         // text/icon on primary bg

    // ── Accent — Dark Teal (hero cards, headers) ──
    accent:       '#14342B',
    accentDark:   '#0D2820',
    accentLight:  '#1A3B34',
    accentGlass:  'rgba(20, 52, 43, 0.5)',

    // ── Tertiary — Soft Blue (trust badges, info chips) ──
    tertiary:          '#B8E2FF',
    tertiaryContainer: '#3C657E',

    // ── Success ──
    success:       '#0ECB81',
    successDark:   '#0A9D63',
    successGlass:  'rgba(14, 203, 129, 0.12)',
    successBorder: 'rgba(14, 203, 129, 0.3)',

    // ── Error ──
    error:       '#FFB4AB',
    errorDark:   '#93000A',
    errorGlass:  'rgba(255, 180, 171, 0.12)',
    errorBorder: 'rgba(255, 180, 171, 0.3)',

    // ── Warning ──
    warning:       '#F0B90B',
    warningDark:   '#C99D09',
    warningGlass:  'rgba(240, 185, 11, 0.12)',
    warningBorder: 'rgba(240, 185, 11, 0.3)',

    // ── Text Hierarchy ──
    text:          '#D5E7DC',         // on-surface (primary text)
    textPrimary:   '#D5E7DC',
    textSecondary: '#A5BEB2',         // on-secondary-container
    textMuted:     '#90937A',         // outline
    textDim:       '#454934',         // outline-variant

    // ── Borders & Outlines ──
    border:      '#293831',           // surface-variant
    borderLight: '#2D3C35',           // surface-bright
    borderGlow:  'rgba(205, 234, 45, 0.1)',
    ghostBorder: 'rgba(69, 73, 52, 0.15)', // outline-variant @ 15%
};

// ══════════════════════════════════════════════════════════════
//  LIGHT THEME — "Emerald Day"
// ══════════════════════════════════════════════════════════════
const LightColors = {
    // ── Background Surface Tiers ──
    background:          '#F5F5F0',
    backgroundSecondary: '#FFFFFF',
    backgroundTertiary:  '#EAEBE6',
    backgroundElevated:  '#F8F8F4',

    // ── Surfaces ──
    surface:       '#FFFFFF',
    surfaceLight:  '#F8F8F4',
    surfaceBright: '#EAEBE6',

    // ── Glass & Overlays — teal-tinted ──
    glassDark:  'rgba(20, 52, 43, 0.05)',
    glassLight: 'rgba(255, 255, 255, 0.7)',
    glassOverlay: 'rgba(20, 52, 43, 0.03)',

    // ── Primary — Dark Teal in light mode (no neon lime) ──
    primary:       '#14342B',
    primaryDark:   '#0D2820',
    primaryLight:  '#1A3B34',
    primarySoft:   '#E8F0ED',
    primaryGlass:  'rgba(20, 52, 43, 0.08)',
    primaryBorder: 'rgba(20, 52, 43, 0.15)',
    onPrimary:     '#FFFFFF',

    // ── Accent — Dark Teal ──
    accent:       '#14342B',
    accentDark:   '#0D2820',
    accentLight:  '#1A3B34',
    accentGlass:  'rgba(20, 52, 43, 0.06)',

    // ── Tertiary ──
    tertiary:          '#1F4B63',
    tertiaryContainer: '#E8F4FA',

    // ── Success ──
    success:       '#0A9D63',
    successDark:   '#087A4D',
    successGlass:  'rgba(10, 157, 99, 0.08)',
    successBorder: 'rgba(10, 157, 99, 0.2)',

    // ── Error ──
    error:       '#BA1A1A',
    errorDark:   '#93000A',
    errorGlass:  'rgba(186, 26, 26, 0.06)',
    errorBorder: 'rgba(186, 26, 26, 0.2)',

    // ── Warning ──
    warning:       '#C99D09',
    warningDark:   '#A68208',
    warningGlass:  'rgba(201, 157, 9, 0.08)',
    warningBorder: 'rgba(201, 157, 9, 0.2)',

    // ── Text Hierarchy — neutral grays ──
    text:          '#1A1A1A',
    textPrimary:   '#1A1A1A',
    textSecondary: '#6B7280',
    textMuted:     '#9CA3AF',
    textDim:       '#D1D5DB',

    // ── Borders — subtle, warm gray ──
    border:      '#E8E8E4',
    borderLight: '#F0F0EC',
    borderGlow:  'rgba(20, 52, 43, 0.08)',
    ghostBorder: 'rgba(0, 0, 0, 0.04)',
};

// ══════════════════════════════════════════════════════════════
//  GRADIENTS
// ══════════════════════════════════════════════════════════════
export const Gradients = {
    dark: {
        background: ['#071610', '#101E18', '#071610'],
        primary:    ['#CDEA2D', '#B7D306', '#A8C020'],
        primaryAlt: ['#F6FFC0', '#CDEA2D', '#B7D306'],        // "Glow Gradient" for CTAs
        primaryGlow:['#D3F034', '#CDEA2D'],                   // Subtle CTA glow
        accent:     ['#14342B', '#1A3B34', '#245649'],
        success:    ['#0ECB81', '#059669'],
        error:      ['#FFB4AB', '#93000A'],
        warning:    ['#F0B90B', '#C99D09'],
        bnpl:       ['#CDEA2D', '#B5D125'],
    },
    light: {
        background: ['#F5F5F0', '#FFFFFF', '#F5F5F0'],
        primary:    ['#CDEA2D', '#B5D125', '#A8C020'],
        primaryAlt: ['#DEFF5E', '#CDEA2D', '#B5D125'],
        primaryGlow:['#DEFF5E', '#CDEA2D'],
        accent:     ['#14342B', '#1A3B34', '#1E4D3F'],
        success:    ['#0ECB81', '#059669'],
        error:      ['#F6465D', '#D9304E'],
        warning:    ['#F0B90B', '#C99D09'],
        bnpl:       ['#CDEA2D', '#B5D125'],
    },
};

// ══════════════════════════════════════════════════════════════
//  SPACING — 4px base grid
// ══════════════════════════════════════════════════════════════
export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

// ══════════════════════════════════════════════════════════════
//  TYPOGRAPHY SCALE — Be Vietnam Pro
// ══════════════════════════════════════════════════════════════
export const Typography = {
    displayLg: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
    displayMd: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.3 },
    headlineLg: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
    headlineSm: { fontSize: 18, fontWeight: '700' as const },
    bodyLg: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodyMd: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    labelLg: { fontSize: 13, fontWeight: '600' as const },
    labelMd: { fontSize: 12, fontWeight: '600' as const },
    labelSm: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
};

// ══════════════════════════════════════════════════════════════
//  BORDER RADIUS
// ══════════════════════════════════════════════════════════════
export const Radius = {
    sm: 8,
    md: 14,
    lg: 16,     // nested elements (badges, inputs)
    xl: 20,     // main content cards
    xxl: 24,    // hero cards, dashboard cards
    pill: 9999, // buttons, chips
};

// ══════════════════════════════════════════════════════════════
//  BLUR
// ══════════════════════════════════════════════════════════════
export const Blur = {
    light: 15,
    medium: 20,   // standard glassmorphism
    heavy:  40,   // bottom sheets, overlays
};

// ══════════════════════════════════════════════════════════════
//  SHADOWS — Tinted, never pure black
// ══════════════════════════════════════════════════════════════
export const Shadows = {
    dark: {
        card: {
            shadowColor: '#03110B',      // tinted shadow
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 5,
        },
        glow: {
            shadowColor: '#CDEA2D',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 8,
        },
        ambient: {
            shadowColor: '#03110B',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.4,
            shadowRadius: 40,
            elevation: 10,
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
            shadowColor: '#CDEA2D',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 6,
        },
        ambient: {
            shadowColor: '#14342B',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 8,
        },
    },
};

// ══════════════════════════════════════════════════════════════
//  THEME OBJECTS
// ══════════════════════════════════════════════════════════════
export const themes = {
    dark: {
        mode: 'dark' as ThemeMode,
        colors: DarkColors,
        gradients: Gradients.dark,
        spacing: Spacing,
        typography: Typography,
        radius: Radius,
        blur: Blur,
        shadows: Shadows.dark,
    },
    light: {
        mode: 'light' as ThemeMode,
        colors: LightColors,
        gradients: Gradients.light,
        spacing: Spacing,
        typography: Typography,
        radius: Radius,
        blur: Blur,
        shadows: Shadows.light,
    },
};

export type Theme = typeof themes.dark;
