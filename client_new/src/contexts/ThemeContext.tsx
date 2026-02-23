import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, Theme, themes } from '../theme/themes';

const THEME_STORAGE_KEY = '@app/theme_mode';

export interface ThemePressEvent {
    clientX?: number;
    clientY?: number;
    pageX?: number;
    pageY?: number;
    nativeEvent?: { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
}

interface ThemeContextData {
    theme: Theme;
    themeMode: ThemeMode;
    toggleTheme: () => void;
    /** Toggle with View Transition API (circular reveal) on web - pass press event for click position */
    toggleThemeWithTransition: (event?: ThemePressEvent) => void;
    /** Toggle with circular reveal overlay on native (Android/iOS) - pass tap position. Tạm dùng toggle đơn giản để tránh mất content */
    toggleThemeWithOverlay: (x: number, y: number) => void;
    setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

interface ThemeProviderProps {
    children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
    const [isInitialized, setIsInitialized] = useState(false);

    // Load saved theme preference on mount
    useEffect(() => {
        loadThemePreference();
    }, []);

    const loadThemePreference = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme === 'light' || savedTheme === 'dark') {
                setThemeModeState(savedTheme);
            } else {
                // Use system preference if no saved preference
                setThemeModeState(systemColorScheme === 'light' ? 'light' : 'dark');
            }
        } catch (error) {
            console.error('Failed to load theme preference:', error);
            setThemeModeState(systemColorScheme === 'light' ? 'light' : 'dark');
        } finally {
            setIsInitialized(true);
        }
    };

    const setThemeMode = async (mode: ThemeMode) => {
        try {
            setThemeModeState(mode);
            await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
        } catch (error) {
            console.error('Failed to save theme preference:', error);
        }
    };

    const toggleTheme = () => {
        const newMode = themeMode === 'dark' ? 'light' : 'dark';
        setThemeMode(newMode);
    };

    const toggleThemeWithTransition = (event?: ThemePressEvent) => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') {
            toggleTheme();
            return;
        }

        const doc = document as Document & { startViewTransition?: (cb: () => void) => Promise<void> };
        if (!doc.startViewTransition) {
            toggleTheme();
            return;
        }

        const x = event?.clientX ?? event?.nativeEvent?.clientX ?? event?.nativeEvent?.pageX ?? window.innerWidth / 2;
        const y = event?.clientY ?? event?.nativeEvent?.clientY ?? event?.nativeEvent?.pageY ?? window.innerHeight / 2;

        doc.documentElement.style.setProperty('--reveal-x', `${x}px`);
        doc.documentElement.style.setProperty('--reveal-y', `${y}px`);

        doc.startViewTransition(() => {
            toggleTheme();
            // Wait for React to flush state update and re-render before capturing new snapshot
            return new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                });
            });
        });
    };

    const toggleThemeWithOverlay = (_x?: number, _y?: number) => {
        toggleTheme();
    };

    const theme = themes[themeMode];

    // Don't render children until theme is initialized to avoid flash
    if (!isInitialized) {
        return null;
    }

    return (
        <ThemeContext.Provider
            value={{
                theme,
                themeMode,
                toggleTheme,
                toggleThemeWithTransition,
                toggleThemeWithOverlay,
                setThemeMode,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = (): ThemeContextData => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};
