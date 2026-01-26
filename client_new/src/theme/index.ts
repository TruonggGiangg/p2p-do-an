/**
 * Theme System - Light & Dark Mode Support
 * Re-export for backward compatibility
 * Use useTheme() hook for dynamic theme switching
 */

export * from './themes';
export { useTheme, ThemeProvider } from '../contexts/ThemeContext';

// Legacy exports for backward compatibility (defaults to dark theme)
import { themes } from './themes';
export const GlassTokens = themes.dark;
export const Colors = themes.dark.colors;
export const Gradients = themes.dark.gradients;
export const Spacing = themes.dark.spacing;
export const Radius = themes.dark.radius;
export const Blur = themes.dark.blur;
export const Shadows = themes.dark.shadows;

export default {
    Colors,
    Gradients,
    Spacing,
    Radius,
    Blur,
    Shadows,
    GlassTokens,
};
