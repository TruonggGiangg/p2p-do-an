import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';

// ===== ORIGINAL LIGHT THEME =====
export const Colors = {
    primary: '#2979FF',
    primaryLight: '#E3F2FD',
    secondary: '#00B0FF',
    background: '#F7F9FC',
    surface: '#FFFFFF',
    text: '#1A1D1E',
    textSecondary: '#90A4AE',
    error: '#FF3D00',
    success: '#00C853',
    warning: '#FFAB00',
    border: '#ECEFF1',
    white: '#FFFFFF',
};

// ===== NEW DARK FINTECH THEME =====
// Based on reference: Dark mode with blue accent, glassmorphism cards
export const DarkColors = {
    // Core palette from reference
    primary: '#4347FF',       // Main blue accent
    primaryLight: '#6366F1',  // Lighter blue
    secondary: '#5DD2EB',     // Cyan/Turquoise accent

    // Backgrounds (dark)
    background: '#0D0D12',    // Deepest dark
    surface: '#18191E',       // Card background
    surfaceLight: '#1E1F26',  // Elevated cards
    surfaceGlass: 'rgba(30, 31, 38, 0.8)', // Glassmorphism

    // Text
    text: '#FFFFFF',
    textSecondary: '#8B8D97',
    textMuted: '#5A5C66',

    // Semantic colors
    error: '#FF4757',
    success: '#2ED573',
    warning: '#FFA502',
    info: '#5DD2EB',

    // Borders & dividers
    border: 'rgba(255,255,255,0.08)',
    borderLight: 'rgba(255,255,255,0.12)',

    // Special
    white: '#FFFFFF',
    black: '#000000',

    // Gradients (for LinearGradient)
    gradientPrimary: ['#4347FF', '#6366F1'],
    gradientDark: ['#18191E', '#0D0D12'],
    gradientCard: ['rgba(30, 31, 38, 0.9)', 'rgba(24, 25, 30, 0.95)'],
};

// Status colors for loans (dark mode)
export const DarkStatusColors = {
    waiting: { color: '#FFA502', bg: 'rgba(255, 165, 2, 0.15)' },
    pending: { color: '#FFA502', bg: 'rgba(255, 165, 2, 0.15)' },
    approved: { color: '#2ED573', bg: 'rgba(46, 213, 115, 0.15)' },
    success: { color: '#2ED573', bg: 'rgba(46, 213, 115, 0.15)' },
    active: { color: '#4347FF', bg: 'rgba(67, 71, 255, 0.15)' },
    on_going: { color: '#4347FF', bg: 'rgba(67, 71, 255, 0.15)' },
    done: { color: '#8B8D97', bg: 'rgba(139, 141, 151, 0.15)' },
    closed: { color: '#8B8D97', bg: 'rgba(139, 141, 151, 0.15)' },
    clean: { color: '#8B8D97', bg: 'rgba(139, 141, 151, 0.15)' },
    overdue: { color: '#FF4757', bg: 'rgba(255, 71, 87, 0.15)' },
    fail: { color: '#FF4757', bg: 'rgba(255, 71, 87, 0.15)' },
    rejected: { color: '#FF4757', bg: 'rgba(255, 71, 87, 0.15)' },
    withdrawn: { color: '#8B8D97', bg: 'rgba(139, 141, 151, 0.15)' },
};

// Common styling constants
export const DarkStyling = {
    borderRadius: {
        xs: 8,
        sm: 12,
        md: 16,
        lg: 20,
        xl: 24,
        full: 9999,
    },
    shadow: {
        card: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
        },
        subtle: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 4,
        },
    },
    glassmorphism: {
        backgroundColor: 'rgba(30, 31, 38, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
};

export const PremiumTheme = {
    ...MD3LightTheme,
    roundness: 16,
    colors: {
        ...MD3LightTheme.colors,
        primary: Colors.primary,
        onPrimary: '#FFFFFF',
        primaryContainer: Colors.primaryLight,
        onPrimaryContainer: Colors.primary,
        secondary: Colors.secondary,
        background: Colors.background,
        surface: Colors.surface,
        onSurface: Colors.text,
        surfaceVariant: '#FFFFFF',
        onSurfaceVariant: Colors.textSecondary,
        outline: Colors.border,
        error: Colors.error,
        elevation: {
            level1: Colors.surface,
            level2: Colors.surface,
            level3: Colors.surface,
            level4: Colors.surface,
            level5: Colors.surface,
        }
    },
};

export const DarkTheme = {
    ...MD3DarkTheme,
    roundness: 16,
    colors: {
        ...MD3DarkTheme.colors,
        primary: DarkColors.primary,
        onPrimary: '#FFFFFF',
        primaryContainer: DarkColors.surfaceLight,
        onPrimaryContainer: DarkColors.primary,
        secondary: DarkColors.secondary,
        background: DarkColors.background,
        surface: DarkColors.surface,
        onSurface: DarkColors.text,
        surfaceVariant: DarkColors.surfaceLight,
        onSurfaceVariant: DarkColors.textSecondary,
        outline: DarkColors.border,
        error: DarkColors.error,
        elevation: {
            level1: DarkColors.surface,
            level2: DarkColors.surfaceLight,
            level3: DarkColors.surfaceLight,
            level4: DarkColors.surfaceLight,
            level5: DarkColors.surfaceLight,
        }
    },
};
