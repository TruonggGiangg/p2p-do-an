/**
 * UNIFIED THEME SYSTEM - iOS Fintech Premium (Refactored)
 * Style: Clean, Trustworthy, Glassmorphism, Apple-like Aesthetic
 */

// ========== UNIFIED COLOR PALETTE ==========
export const UnifiedColors = {
    // Backgrounds - Deep, Rich, OLED Friendly
    background: '#000000', // Pure black for depth
    backgroundSecondary: '#1C1C1E', // iOS System Gray 6
    backgroundTertiary: '#2C2C2E', // iOS System Gray 5

    // Glass surfaces - The core of the design
    // Kính mờ Apple: Màu nền nhẹ + Blur cao + Border siêu mỏng
    glassDark: 'rgba(30, 30, 30, 0.65)',
    glassLight: 'rgba(255, 255, 255, 0.1)',
    surface: 'rgba(28, 28, 30, 0.75)', // iOS Gray 6 with opacity
    surfaceLight: 'rgba(44, 44, 46, 0.6)', // iOS Gray 5 with opacity

    // Primary - iOS Blue (Trustworthy Fintech)
    primary: '#0A84FF', // iOS System Blue (Dark Mode)
    primaryDark: '#0066CC',
    primaryGlass: 'rgba(10, 132, 255, 0.12)',
    primaryBorder: 'rgba(10, 132, 255, 0.3)',
    primaryGlow: 'rgba(10, 132, 255, 0.25)',

    // Success - iOS Green (Growth/Profit)
    success: '#30D158', // iOS System Green (Dark Mode)
    successDark: '#248A3D',
    successGlass: 'rgba(48, 209, 88, 0.12)',
    successBorder: 'rgba(48, 209, 88, 0.3)',
    successGlow: 'rgba(48, 209, 88, 0.25)',

    // Error - iOS Red (Expense/Loss)
    error: '#FF453A', // iOS System Red (Dark Mode)
    errorDark: '#C4362E',
    errorGlass: 'rgba(255, 69, 58, 0.12)',
    errorBorder: 'rgba(255, 69, 58, 0.3)',
    errorGlow: 'rgba(255, 69, 58, 0.25)',

    // Warning - iOS Yellow
    warning: '#FFD60A', // iOS System Yellow (Dark Mode)
    warningDark: '#D7B100',
    warningGlass: 'rgba(255, 214, 10, 0.12)',
    warningBorder: 'rgba(255, 214, 10, 0.3)',
    warningGlow: 'rgba(255, 214, 10, 0.25)',

    // Info - iOS Teal/Cyan
    info: '#64D2FF', // iOS System Teal (Dark Mode)
    infoGlass: 'rgba(100, 210, 255, 0.12)',
    infoBorder: 'rgba(100, 210, 255, 0.3)',
    infoGlow: 'rgba(100, 210, 255, 0.25)',

    // Text - SF Pro Hierarchy
    text: '#FFFFFF',
    textPrimary: '#FFFFFF', // High Emphasis
    textSecondary: 'rgba(235, 235, 245, 0.6)', // 60% White (iOS standard)
    textMuted: 'rgba(235, 235, 245, 0.3)', // 30% White
    textDim: 'rgba(235, 235, 245, 0.18)',
    white: '#FFFFFF',

    // Borders - Subtle & Elegant
    borderGlass: 'rgba(255, 255, 255, 0.1)', // The "Frost" line
    borderGlassSubtle: 'rgba(255, 255, 255, 0.05)',
    borderLight: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.12)',
    borderGlow: 'rgba(10, 132, 255, 0.15)',

    // Legacy support
    surfaceGlass: 'rgba(255, 255, 255, 0.08)',
};

// ========== GRADIENTS (Subtle "Aurora" Mesh) ==========
export const UnifiedGradients = {
    // Background mesh - Tinh tế hơn, không còn màu tím gắt
    // Tạo cảm giác "Financial Deep Space"
    background: ['#000000', '#0f172a', '#1e1b4b', '#000000'] as const,
    backgroundLocations: [0, 0.4, 0.8, 1] as const,

    // Button gradients - Smooth Linear
    primary: ['#0A84FF', '#0066CC'] as const, // Apple Blue Gradient
    success: ['#30D158', '#248A3D'] as const,
    error: ['#FF453A', '#C4362E'] as const,
    warning: ['#FFD60A', '#D7B100'] as const,

    // Glow overlays - Reduced opacity for classier look
    primaryGlow: ['rgba(10, 132, 255, 0.1)', 'transparent'] as const,
    successGlow: ['rgba(48, 209, 88, 0.1)', 'transparent'] as const,
    errorGlow: ['rgba(255, 69, 58, 0.1)', 'transparent'] as const,

    // Legacy
    primaryButton: ['#0A84FF', '#0055b3'] as const,
    secondaryButton: ['#64D2FF', '#40a0cc'] as const,
    accentButton: ['#64D2FF', '#40a0cc'] as const,
};

// ========== SPACING (Strict iOS 4pt/8pt Grid) ==========
export const UnifiedSpacing = {
    xs: 8,   // Elements inside a card
    sm: 12,  // Icon to text
    md: 16,  // Standard padding
    lg: 20,  // Card padding
    xl: 24,  // Section spacing
    xxl: 32, // Screen edges (sometimes)
};

// ========== BORDER RADIUS (Apple "Squircle" Feel) ==========
export const UnifiedRadius = {
    sm: 10,  // Small elements / inner buttons
    md: 14,  // Standard buttons
    lg: 22,  // Cards / Modals
    xl: 32,  // Large Sheets
    xxl: 40,
    full: 9999, // Capsule
};

// ========== BLUR INTENSITIES (Glassmorphism) ==========
export const UnifiedBlur = {
    light: 15, // Subtle frost
    medium: 30, // Standard card
    heavy: 50, // Modal background
    ultra: 80, // Navigation bar / Tab bar
};

// ========== SHADOWS (Soft & Diffused) ==========
type ShadowStyle = {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
};

export const UnifiedShadows = {
    // Card: Very soft shadow to lift from black background
    card: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    } as ShadowStyle,

    // Hero: Colored glow behind credit cards/graphs
    hero: {
        shadowColor: UnifiedColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    } as ShadowStyle,

    // Button: Tight shadow
    button: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    } as ShadowStyle,

    // Glow: Ambient light
    glow: {
        shadowColor: UnifiedColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 6,
    } as ShadowStyle,
};

// ========== ALIASES ==========
export const DarkColors = UnifiedColors;
export const DarkGradients = UnifiedGradients;
export const DarkStyling = {
    borderRadius: UnifiedRadius,
    shadow: UnifiedShadows,
    spacing: UnifiedSpacing,
};

// GlassTokens
export const GlassTokens = {
    colors: UnifiedColors,
    gradients: UnifiedGradients,
    spacing: UnifiedSpacing,
    radius: UnifiedRadius,
    blur: UnifiedBlur,
};

// ========== REACT NATIVE PAPER THEME (Material 3 Adaptation) ==========
export const DarkTheme = {
    dark: true,
    roundness: UnifiedRadius.md,
    version: 3 as const,
    isV3: true as const,
    colors: {
        primary: UnifiedColors.primary,
        onPrimary: '#FFFFFF',
        primaryContainer: 'rgba(10, 132, 255, 0.15)',
        onPrimaryContainer: '#64D2FF',

        secondary: UnifiedColors.info,
        onSecondary: '#FFFFFF',
        secondaryContainer: 'rgba(64, 210, 255, 0.15)',
        onSecondaryContainer: '#64D2FF',

        tertiary: UnifiedColors.success,
        onTertiary: '#000000',
        tertiaryContainer: 'rgba(48, 209, 88, 0.15)',
        onTertiaryContainer: UnifiedColors.success,

        error: UnifiedColors.error,
        onError: '#FFFFFF',
        errorContainer: 'rgba(255, 69, 58, 0.15)',
        onErrorContainer: '#FFD4D1',

        background: UnifiedColors.background,
        onBackground: UnifiedColors.textPrimary,

        surface: UnifiedColors.surface,
        onSurface: UnifiedColors.textPrimary,
        surfaceVariant: UnifiedColors.surfaceLight,
        onSurfaceVariant: UnifiedColors.textSecondary,

        surfaceDisabled: 'rgba(255, 255, 255, 0.1)',
        onSurfaceDisabled: 'rgba(255, 255, 255, 0.3)',

        outline: UnifiedColors.border,
        outlineVariant: UnifiedColors.borderLight,

        shadow: '#000000',
        scrim: '#000000',
        inverseSurface: '#E5E5EA', // iOS Light Gray
        inverseOnSurface: '#1C1C1E',
        inversePrimary: UnifiedColors.primaryDark,
        backdrop: 'rgba(0, 0, 0, 0.6)', // Darker dim for modals

        elevation: {
            level0: 'transparent',
            level1: UnifiedColors.surface,
            level2: UnifiedColors.surface,
            level3: UnifiedColors.surfaceLight,
            level4: UnifiedColors.surfaceLight,
            level5: UnifiedColors.surfaceLight,
        }
    },
    fonts: {
        // Updated to Poppins but mimicking SF Pro tracking (letterSpacing)
        displayLarge: { fontFamily: 'Poppins_400Regular', fontSize: 57, fontWeight: '400' as const, letterSpacing: -0.25, lineHeight: 64 },
        displayMedium: { fontFamily: 'Poppins_400Regular', fontSize: 45, fontWeight: '400' as const, letterSpacing: 0, lineHeight: 52 },
        displaySmall: { fontFamily: 'Poppins_600SemiBold', fontSize: 36, fontWeight: '600' as const, letterSpacing: 0, lineHeight: 44 }, // Bolder Headings

        headlineLarge: { fontFamily: 'Poppins_600SemiBold', fontSize: 32, fontWeight: '600' as const, letterSpacing: 0, lineHeight: 40 },
        headlineMedium: { fontFamily: 'Poppins_600SemiBold', fontSize: 28, fontWeight: '600' as const, letterSpacing: 0, lineHeight: 36 },
        headlineSmall: { fontFamily: 'Poppins_600SemiBold', fontSize: 24, fontWeight: '600' as const, letterSpacing: 0, lineHeight: 32 },

        titleLarge: { fontFamily: 'Poppins_500Medium', fontSize: 22, fontWeight: '500' as const, letterSpacing: 0, lineHeight: 28 },
        titleMedium: { fontFamily: 'Poppins_500Medium', fontSize: 16, fontWeight: '500' as const, letterSpacing: 0.15, lineHeight: 24 },
        titleSmall: { fontFamily: 'Poppins_500Medium', fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1, lineHeight: 20 },

        labelLarge: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, fontWeight: '600' as const, letterSpacing: 0.1, lineHeight: 20 }, // Buttons
        labelMedium: { fontFamily: 'Poppins_500Medium', fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.5, lineHeight: 16 },
        labelSmall: { fontFamily: 'Poppins_500Medium', fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5, lineHeight: 16 },

        bodyLarge: { fontFamily: 'Poppins_400Regular', fontSize: 16, fontWeight: '400' as const, letterSpacing: 0.15, lineHeight: 24 }, // Readable body
        bodyMedium: { fontFamily: 'Poppins_400Regular', fontSize: 14, fontWeight: '400' as const, letterSpacing: 0.25, lineHeight: 20 },
        bodySmall: { fontFamily: 'Poppins_400Regular', fontSize: 12, fontWeight: '400' as const, letterSpacing: 0.4, lineHeight: 16 },

        default: { fontFamily: 'Poppins_400Regular', fontSize: 14, fontWeight: '400' as const, letterSpacing: 0 },
    },
    animation: { scale: 1.0 },
};

// ========== EXPORTS ==========
export const PremiumTheme = DarkTheme;
export const GlassMorphism = {
    backgroundColor: UnifiedColors.glassDark,
    borderWidth: 1,
    borderColor: UnifiedColors.borderGlass,
};

export default {
    UnifiedColors,
    UnifiedGradients,
    UnifiedSpacing,
    UnifiedRadius,
    UnifiedBlur,
    UnifiedShadows,
    DarkTheme,
    PremiumTheme,
    GlassTokens,
    GlassMorphism,
};