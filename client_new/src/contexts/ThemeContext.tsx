import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, Theme, themes } from '../theme/themes';

const THEME_STORAGE_KEY = '@app/theme_mode';

interface ThemeContextData {
    theme: Theme;
    themeMode: ThemeMode;
    toggleTheme: () => void;
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
