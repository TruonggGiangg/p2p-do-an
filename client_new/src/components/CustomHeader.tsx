import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface CustomHeaderProps {
    title?: string;
    showBack?: boolean;
    rightComponent?: React.ReactNode;
}

export const CustomHeader: React.FC<CustomHeaderProps> = ({
    title,
    showBack = false,
    rightComponent,
}) => {
    const navigation = useNavigation();
    const { theme, toggleTheme, themeMode } = useTheme();
    const isDark = themeMode === 'dark';
    const insets = useSafeAreaInsets();
    
    // Sử dụng safe area insets cho iOS, status bar height cho Android
    const topPadding = Platform.OS === 'ios' 
        ? insets.top 
        : (StatusBar.currentHeight || 0);

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderBottomColor: theme.colors.border,
                    paddingTop: topPadding,
                },
            ]}
        >
            <View style={styles.content}>
                {/* Left: Back Button */}
                <View style={styles.left}>
                    {showBack && navigation.canGoBack() ? (
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}
                            activeOpacity={0.7}
                        >
                            <MaterialCommunityIcons
                                name="arrow-left"
                                size={24}
                                color={theme.colors.textPrimary}
                            />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backButton} />
                    )}
                </View>

                {/* Center: Title */}
                <View style={styles.center}>
                    {title && (
                        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
                    )}
                </View>

                {/* Right: Theme Toggle or Custom Component */}
                <View style={styles.right}>
                    {rightComponent || (
                        <TouchableOpacity
                            onPress={toggleTheme}
                            style={styles.themeButton}
                            activeOpacity={0.7}
                        >
                            <MaterialCommunityIcons
                                name={isDark ? 'weather-night' : 'weather-sunny'}
                                size={24}
                                color={theme.colors.textPrimary}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderBottomWidth: 1,
        zIndex: 1000,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        paddingHorizontal: 16,
    },
    left: {
        width: 40,
        alignItems: 'flex-start',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    right: {
        width: 40,
        alignItems: 'flex-end',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    themeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        fontWeight: '600',
        flexShrink: 1,
    },
});

export default CustomHeader;
