import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { StyleSheet, View, Dimensions, ViewStyle, StyleProp } from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView
} from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate,
    useAnimatedScrollHandler,
    withRepeat,
    withDelay,
    SharedValue
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import VentoUltimateLoading from './VentoSVGLoading';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const REFRESH_THRESHOLD = 110;
const HEADER_HEIGHT = 150; // More compact header

interface FloatingParticleProps {
    index: number;
    pullProgress: SharedValue<number>;
}

/**
 * FloatingParticle: Small drifting dot
 */
const FloatingParticle: React.FC<FloatingParticleProps & { color: string }> = ({ index, pullProgress, color }) => {
    const x = useSharedValue(Math.random() * 160 - 80);
    const y = useSharedValue(24); // Start lower (below logo)
    const scale = useSharedValue(Math.random() * 2 + 0.8);
    const sparkleValue = useSharedValue(1);

    useEffect(() => {
        y.value = withRepeat(
            withDelay(index * 150,
                withTiming(-140, { duration: 3200 + Math.random() * 1000 }) // Float up through logo
            ),
            -1,
            false
        );

        sparkleValue.value = withRepeat(
            withTiming(1.5, { duration: 400 + Math.random() * 400 }),
            -1,
            true
        );
    }, [index]);

    const style = useAnimatedStyle(() => {
        const p = pullProgress.value;
        return {
            transform: [
                { translateX: x.value },
                { translateY: y.value },
                { scale: scale.value * (p > 0.5 ? sparkleValue.value / 1.2 : 1) }
            ],
            opacity: interpolate(p, [0.3, 0.8], [0, 0.7], Extrapolate.CLAMP),
        };
    });

    return <Animated.View style={[styles.particle, style, { backgroundColor: color }]} pointerEvents="none" />;
};

interface FintechPullToRefreshProps {
    onRefresh: () => void;
    refreshing: boolean;
    children?: ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
    showsVerticalScrollIndicator?: boolean;
    topOffset?: number;
    style?: StyleProp<ViewStyle>;
    // New props for Flexibility
    renderScrollComponent?: (props: any) => ReactNode;
    scrollProps?: any;
    primaryColor?: string;
    glowColor?: string;
}

/**
 * FintechPullToRefresh: Advanced gesture wrapper
 */
const FintechPullToRefresh: React.FC<FintechPullToRefreshProps> = ({
    onRefresh,
    refreshing,
    children,
    contentContainerStyle,
    showsVerticalScrollIndicator = false,
    topOffset = 0,
    style: customStyle,
    renderScrollComponent,
    scrollProps = {},
    primaryColor,
    glowColor,
}) => {
    const { theme } = useTheme();
    const activePrimary = primaryColor || theme.colors.primary;
    const activeGlow = glowColor || theme.colors.primaryLight;

    const translationY = useSharedValue(0);
    const scrollY = useSharedValue(0);
    const isRefreshingValue = useSharedValue(false);
    const pullProgress = useSharedValue(0);

    const [isRefreshingUI, setIsRefreshingUI] = useState(false);

    useEffect(() => {
        isRefreshingValue.value = refreshing;
        setIsRefreshingUI(refreshing);
        if (refreshing) {
            // Ensure snap to resting position if refreshing is triggered externally
            translationY.value = withSpring(85, { damping: 18, stiffness: 50 });
            pullProgress.value = 1;
        } else {
            // Quick snap back after load
            translationY.value = withTiming(0, { duration: 300 });
            pullProgress.value = withTiming(0, { duration: 300 });
        }
    }, [refreshing]);

    const onPullTrigger = useCallback(() => {
        if (onRefresh) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onRefresh();
        }
    }, [onRefresh]);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (isRefreshingValue.value) return;

            // Only pull if we are at the top and pulling down
            if (scrollY.value <= 4 && event.translationY > 0) {
                // Progressive dampening for a "heavy" fintech feel
                const input = event.translationY;
                const resistance = 0.65; // High resistance
                const dampened = 180 * (1 - Math.exp(-input * resistance / 380));

                // Trigger subtle haptic "ticks" while pulling
                const newProgress = interpolate(dampened, [25, REFRESH_THRESHOLD], [0, 1], Extrapolate.CLAMP);
                if (Math.floor(newProgress * 10) > Math.floor(pullProgress.value * 10)) {
                    runOnJS(Haptics.selectionAsync)();
                }

                translationY.value = dampened;
                pullProgress.value = newProgress;
            } else if (translationY.value > 0) {
                // Smoothly return if we were pulling and then went past boundaries
                translationY.value = withSpring(0, { damping: 20, stiffness: 100 });
                pullProgress.value = withTiming(0, { duration: 400 });
            }
        })
        .onEnd(() => {
            if (isRefreshingValue.value) return;

            if (translationY.value >= REFRESH_THRESHOLD) {
                // Professional SNAP: Overshoot and settle (The "khựng" effect)
                translationY.value = withSpring(85, {
                    damping: 12, // Lower damping for a bit of bounce
                    stiffness: 90,
                    mass: 0.8,
                    velocity: 15
                });
                runOnJS(onPullTrigger)();
            } else {
                translationY.value = withSpring(0, { damping: 20, stiffness: 100 });
                pullProgress.value = withTiming(0, { duration: 400 });
            }
        })
        .activeOffsetY(20) // Only trigger on downward pull > 20
        .failOffsetY(-10) // Fail on upward swipe to allow normal scrolling
        .shouldCancelWhenOutside(true);

    const animatedHeaderStyle = useAnimatedStyle(() => {
        // Logo pops in and tilts a bit during pull for 3D depth
        const scale = interpolate(translationY.value, [0, REFRESH_THRESHOLD], [0.7, 1.1], Extrapolate.CLAMP);
        const rotateX = interpolate(translationY.value, [0, REFRESH_THRESHOLD], [20, 0], Extrapolate.CLAMP);
        const transY = interpolate(translationY.value, [0, REFRESH_THRESHOLD], [-60, 0], Extrapolate.CLAMP);

        return {
            transform: [
                { translateY: translationY.value - HEADER_HEIGHT + transY + topOffset + 50 },
                { scale: scale },
                { rotateX: `${rotateX}deg` }
            ],
            opacity: interpolate(translationY.value, [0, 40], [0, 1], Extrapolate.CLAMP),
        };
    });

    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: translationY.value }],
        };
    });

    const renderParticles = () => {
        return Array.from({ length: 18 }).map((_, i) => ( // More particles
            <FloatingParticle key={i} index={i} pullProgress={pullProgress} color={activePrimary} />
        ));
    };

    return (
        <GestureHandlerRootView style={styles.container}>
            {/* Gesture-captured Content Layer */}
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.content, animatedContentStyle, customStyle]}>
                    {renderScrollComponent ? (
                        renderScrollComponent({
                            onScroll: scrollHandler,
                            scrollEventThrottle: 1,
                            style: { flex: 1 },
                            ...scrollProps
                        })
                    ) : (
                        <Animated.ScrollView
                            onScroll={scrollHandler}
                            scrollEventThrottle={1}
                            style={{ flex: 1 }}
                            contentContainerStyle={contentContainerStyle}
                            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
                            {...scrollProps}
                        >
                            {children}
                        </Animated.ScrollView>
                    )}
                </Animated.View>
            </GestureDetector>

            {/* Refresh Indicator Layer - Moved to front (after content) or higher zIndex */}
            <Animated.View pointerEvents="none" style={[styles.header, animatedHeaderStyle]}>
                <View style={styles.indicatorWrapper}>
                    <VentoUltimateLoading
                        size={120}
                        staggerScale={0.4}
                        strokeWidth={9}
                        showLabel={false}
                        progress={isRefreshingUI ? null : pullProgress}
                        primaryColor={activePrimary}
                        glowColor={activeGlow}
                    />
                    {renderParticles()}
                </View>
            </Animated.View>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent', overflow: 'visible' },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10, // Higher Z
        overflow: 'visible',
    },
    indicatorWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        width: '100%',
    },
    particle: {
        position: 'absolute',
        width: 3.5,
        height: 3.5,
        borderRadius: 2,
        zIndex: 11,
    },
    content: { flex: 1, zIndex: 1 },
});

export default FintechPullToRefresh;
