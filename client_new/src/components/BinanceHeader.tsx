import React, { useRef, useState, useLayoutEffect } from 'react';
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
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface BinanceHeaderProps {
    mode?: 'dashboard' | 'standard';
    title?: string;
    showBack?: boolean;
    onAvatarPress?: () => void;
    onSearchPress?: () => void;
    rightComponents?: React.ReactNode;
    showThemeToggle?: boolean;
}

// ─────────────────────────────────────────────
// Animated Header Button Component
// ─────────────────────────────────────────────
const AnimatedBtn = ({ icon, onPress, badge, colors, size = 22 }: any) => {
    const scale = useSharedValue(1);
    const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(scale.value) }] }));

    return (
        <Animated.View style={animStyle}>
            <TouchableOpacity 
                style={styles.iconBtn} 
                onPressIn={() => scale.value = 0.9}
                onPressOut={() => scale.value = 1}
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress?.();
                }}
            >
                <MaterialCommunityIcons name={icon} size={size} color={colors.textPrimary} />
                {badge && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
        </Animated.View>
    );
};

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

    const FALLBACK_TOP = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24);
    const cachedTopInset = useRef<number>(FALLBACK_TOP);
    const [ready, setReady] = useState(false);

    useLayoutEffect(() => {
        if (insets.top > 0 && !ready) {
            cachedTopInset.current = insets.top;
            setReady(true);
        }
    }, [insets.top, ready]);

    const stableTop = cachedTopInset.current;

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

    const ThemeToggleButton = () => {
        const scale = useSharedValue(1);
        const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(scale.value) }] }));

        return (
            <Animated.View style={animStyle}>
                <TouchableOpacity 
                    style={styles.iconBtn} 
                    onPressIn={() => scale.value = 0.9}
                    onPressOut={() => scale.value = 1}
                    onPress={(e) => handleThemePress(e)}
                >
                    <MaterialCommunityIcons
                        name={themeMode === 'dark' ? 'weather-sunny' : 'weather-night'}
                        size={22}
                        color={theme.colors.textPrimary}
                    />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const topPadding = Platform.OS === 'ios' ? stableTop : Math.max(stableTop, (StatusBar.currentHeight || 24));

    if (mode === 'dashboard') {
        const avatarScale = useSharedValue(1);
        const avatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(avatarScale.value) }] }));
        
        const searchScale = useSharedValue(1);
        const searchStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(searchScale.value) }] }));

        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: topPadding }]}>
                <View style={styles.dashboardContent}>
                    {/* Left: Avatar */}
                    <Animated.View style={avatarStyle}>
                        <TouchableOpacity
                            style={[styles.avatarContainer, { backgroundColor: theme.colors.surfaceLight }]}
                            onPressIn={() => avatarScale.value = 0.9}
                            onPressOut={() => avatarScale.value = 1}
                            onPress={onAvatarPress}
                        >
                            <MaterialCommunityIcons name="account" size={20} color={theme.colors.textPrimary} />
                            <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.primary }]}>
                                <MaterialCommunityIcons name="check" size={8} color="#000" />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Center: Search Bar style */}
                    <Animated.View style={[{flex: 1}, searchStyle]}>
                        <TouchableOpacity
                            style={[styles.searchBar, { backgroundColor: theme.colors.surfaceLight }]}
                            onPressIn={() => searchScale.value = 0.98}
                            onPressOut={() => searchScale.value = 1}
                            onPress={onSearchPress}
                            activeOpacity={0.9}
                        >
                            <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textDim} />
                            <Text style={[styles.searchText, { color: theme.colors.textDim }]}>Search coins/features</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Right: Icons */}
                    <View style={styles.rightIcons}>
                        <AnimatedBtn icon="bell-outline" badge colors={theme.colors} onPress={() => (navigation as any).navigate('Notifications')} />
                        {showThemeToggle && <ThemeToggleButton />}
                        <AnimatedBtn icon="headphones" colors={theme.colors} onPress={() => {}} />
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
                        <TouchableOpacity 
                            onPress={() => navigation.goBack()} 
                            style={styles.backButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                    )}
                    {title && (
                        <Text style={[styles.standardTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
                    )}
                </View>
                <View style={styles.rightActions}>
                    {showThemeToggle && <ThemeToggleButton />}
                    {rightComponents || (
                        <TouchableOpacity
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
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
        paddingHorizontal: 20,
        gap: 12,
    },
    standardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        height: 48,
    },
    leftRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 34,
        height: 34,
        borderRadius: 17,
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
        height: 34,
        borderRadius: 17,
        paddingHorizontal: 12,
        gap: 8,
    },
    searchText: {
        fontSize: 12,
    },
    rightIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    iconBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dot: {
        position: 'absolute',
        top: 8,
        right: 8,
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
        fontWeight: '600',
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
});

export default BinanceHeader;
