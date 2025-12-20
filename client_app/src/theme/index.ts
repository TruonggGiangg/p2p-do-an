import { MD3LightTheme, configureFonts } from 'react-native-paper';

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
