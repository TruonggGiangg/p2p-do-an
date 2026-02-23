import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface BinanceHeaderProps {
    mode?: 'dashboard' | 'standard';
    title?: string;
    showBack?: boolean;
    onAvatarPress?: () => void;
    onSearchPress?: () => void;
    rightComponents?: React.ReactNode;
    /** Hiển thị nút chuyển theme (mặc định: true) */
    showThemeToggle?: boolean;
}

export const BinanceHeader: React.FC<BinanceHeaderProps> = ({
    mode = 'standard',
    title,
    showBack = true,
    onAvatarPress,
    onSearchPress,
    rightComponents,
    showThemeToggle = true,
}) => {
    const navigation = useNavigation();
    const { theme, themeMode, toggleThemeWithTransition, toggleThemeWithOverlay } = useTheme();
    const insets = useSafeAreaInsets();

    const handleThemePress = (e: any) => {
        if (Platform.OS === 'web' && e?.nativeEvent) {
            const ne = e.nativeEvent as { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
            toggleThemeWithTransition({
                clientX: ne.clientX ?? ne.pageX,
                clientY: ne.clientY ?? ne.pageY,
                nativeEvent: e.nativeEvent,
            });
        } else {
            const ne = e?.nativeEvent as { pageX?: number; pageY?: number };
            const { width, height } = Dimensions.get('window');
            const x = ne?.pageX ?? width / 2;
            const y = ne?.pageY ?? height / 2;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleThemeWithOverlay(x, y);
        }
    };

    const ThemeToggleButton = () => (
        <TouchableOpacity style={styles.iconBtn} onPress={(e) => handleThemePress(e)}>
            <MaterialCommunityIcons
                name={themeMode === 'dark' ? 'weather-sunny' : 'weather-night'}
                size={22}
                color={theme.colors.textPrimary}
            />
        </TouchableOpacity>
    );

    const topPadding = Platform.OS === 'ios' ? insets.top : (StatusBar.currentHeight || 0) + 10;

    if (mode === 'dashboard') {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: topPadding }]}>
                <View style={styles.dashboardContent}>
                    {/* Left: Avatar */}
                    <TouchableOpacity
                        style={[styles.avatarContainer, { backgroundColor: theme.colors.surfaceLight }]}
                        onPress={onAvatarPress}
                    >
                        <MaterialCommunityIcons name="account" size={20} color={theme.colors.textPrimary} />
                        <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.primary }]}>
                            <MaterialCommunityIcons name="check" size={8} color="#000" />
                        </View>
                    </TouchableOpacity>

                    {/* Center: Search Bar style */}
                    <TouchableOpacity
                        style={[styles.searchBar, { backgroundColor: theme.colors.surfaceLight }]}
                        onPress={onSearchPress}
                        activeOpacity={0.8}
                    >
                        <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textDim} />
                        <Text style={[styles.searchText, { color: theme.colors.textDim }]}>Search coins/features</Text>
                    </TouchableOpacity>

                    {/* Right: Icons */}
                    <View style={styles.rightIcons}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => (navigation as any).navigate('Notifications')}>
                            <MaterialCommunityIcons name="bell-outline" size={22} color={theme.colors.textPrimary} />
                            <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                        </TouchableOpacity>
                        {showThemeToggle && (
                            <TouchableOpacity style={styles.iconBtn} onPress={(e) => handleThemePress(e)}>
                                <MaterialCommunityIcons
                                    name={themeMode === 'dark' ? 'weather-sunny' : 'weather-night'}
                                    size={22}
                                    color={theme.colors.textPrimary}
                                />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.iconBtn}>
                            <MaterialCommunityIcons name="headphones" size={20} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: topPadding }]}>
            <View style={styles.standardContent}>
                <View style={styles.leftRow}>
                    {showBack && navigation.canGoBack() && (
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                    )}
                    {title && (
                        <Text style={[styles.standardTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
                    )}
                </View>
                <View style={styles.rightActions}>
                    {showThemeToggle && <ThemeToggleButton />}
                    {rightComponents || (
                        <TouchableOpacity>
                            <MaterialCommunityIcons name="dots-horizontal" size={24} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingBottom: 12,
        zIndex: 1000,
    },
    dashboardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
    },
    standardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        height: 48,
    },
    leftRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#111318',
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        borderRadius: 16,
        paddingHorizontal: 12,
        gap: 8,
    },
    searchText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    rightIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconBtn: {
        position: 'relative',
    },
    dot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    backButton: {
        padding: 4,
        marginRight: 8,
    },
    standardTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
});

export default BinanceHeader;
