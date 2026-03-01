import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { StyleSheet, View, Dimensions, ViewStyle, StyleProp, Platform, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
    ScrollView as GHScrollView,
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
    SharedValue,
    Easing,
    useAnimatedReaction
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import VentoUltimateLoading from './VentoSVGLoading';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const REFRESH_THRESHOLD = 50; // Match reference
const HEADER_HEIGHT = 150;
const REFRESH_SHOW_HEIGHT = 100;

// scrollY <= PULL_ZONE_THRESHOLD mới hiện chữ loading khi kéo. Tăng lên để ổn định hơn khi scroll nhanh
const PULL_ZONE_THRESHOLD = 25;

const EASING_OUT = Easing.bezier(0.33, 1, 0.68, 1);

// DEBUG: Bật true để xem log khi lướt xuống pull-to-refresh
const DEBUG_PULL_TO_REFRESH = false;
const debugLog = (...args: unknown[]) => {
    if (DEBUG_PULL_TO_REFRESH) {
        console.log('[FintechPullToRefresh]', ...args);
    }
};

// iOS: Dùng ScrollView từ gesture-handler để gesture Pan + Native scroll hoạt động đồng thời
const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);

// ... (FloatingParticle is fine as is)
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
    const insets = useSafeAreaInsets();
    const safeTop = Platform.OS === 'ios' ? insets.top : 0;
    const activePrimary = primaryColor || theme.colors.primary;
    const activeGlow = glowColor || theme.colors.primaryLight;

    const translationY = useSharedValue(0);
    const scrollY = useSharedValue(0);
    const isRefreshingValue = useSharedValue(false);
    const pullProgress = useSharedValue(0);
    const lastHapticStep = useSharedValue(-1);
    const hasTriggeredPullStart = useSharedValue(false);

    const [isRefreshingUI, setIsRefreshingUI] = useState(false);
    const [showParticles, setShowParticles] = useState(false);
    const showStartRef = React.useRef<number | null>(null);
    const pendingHideRef = React.useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (DEBUG_PULL_TO_REFRESH) {
            debugLog('Mount', { Platform: Platform.OS });
        }
    }, []);

    useAnimatedReaction(
        () => (pullProgress.value > 0.08 || isRefreshingValue.value),
        (shouldShow) => {
            runOnJS(setShowParticles)(shouldShow);
        }
    );

    const MIN_DISPLAY_MS = 700;

    useEffect(() => {
        if (refreshing) {
            if (pendingHideRef.current) {
                clearTimeout(pendingHideRef.current);
                pendingHideRef.current = null;
            }
            showStartRef.current = Date.now();
            isRefreshingValue.value = true;
            setIsRefreshingUI(true);
            setShowParticles(true);
            translationY.value = withSpring(REFRESH_SHOW_HEIGHT, { damping: 20, stiffness: 120 });
            pullProgress.value = withTiming(1, { duration: 250 });
        } else {
            const minDisplayDuration = MIN_DISPLAY_MS;
            const elapsed = showStartRef.current ? Date.now() - showStartRef.current : minDisplayDuration;
            const delay = Math.max(0, minDisplayDuration - elapsed);

            const doHide = () => {
                pendingHideRef.current = null;
                isRefreshingValue.value = false;
                setIsRefreshingUI(false);
                setShowParticles(false);
                translationY.value = withTiming(0, { duration: 320, easing: EASING_OUT });
                pullProgress.value = withTiming(0, { duration: 280, easing: EASING_OUT });
            };

            if (delay > 0) {
                pendingHideRef.current = setTimeout(doHide, delay);
            } else {
                doHide();
            }
            return () => {
                if (pendingHideRef.current) clearTimeout(pendingHideRef.current);
            };
        }
    }, [refreshing]);

    const onPullTrigger = useCallback(() => {
        debugLog('onPullTrigger - onRefresh được gọi');
        if (onRefresh) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (Platform.OS === 'android') {
                Vibration.vibrate([0, 40, 60, 40]); // Rung khi refresh thành công
            }
            onRefresh();
        }
    }, [onRefresh]);

    const triggerHapticStep = useCallback((step: number) => {
        if (step <= 0.33) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else if (step <= 0.66) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, []);

    const triggerPullStartHaptic = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    const triggerThresholdReachedHaptic = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        if (Platform.OS === 'android') {
            Vibration.vibrate([0, 30, 50, 30]); // Rung mạnh khi đạt ngưỡng - thả ra để refresh
        }
    }, []);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            const y = event.contentOffset.y;
            scrollY.value = y;
            // Log khi ở gần đầu list (vùng có thể pull)
            if (DEBUG_PULL_TO_REFRESH && y <= 15 && y >= -5) {
                runOnJS(debugLog)('onScroll (gần top)', { scrollY: y });
            }
        },
    });

    const panGesture = Gesture.Pan()
        .onStart(() => {
            runOnJS(debugLog)('Pan onStart', { scrollY: scrollY.value, isRefreshing: isRefreshingValue.value });
        })
        .onUpdate((event) => {
            if (isRefreshingValue.value) return;

            // Chỉ hiện loading khi ở gần đầu list (scrollY <= PULL_ZONE_THRESHOLD)
            if (scrollY.value <= PULL_ZONE_THRESHOLD && event.translationY > 0) {
                const input = event.translationY;
                const resistance = 0.5;
                const dampened = 200 * (1 - Math.exp(-input * resistance / 350));

                const newProgress = interpolate(dampened, [20, REFRESH_THRESHOLD], [0, 1], Extrapolate.CLAMP);

                // Haptic: Cảm giác tại đầu ngón tay khi bắt đầu kéo
                if (!hasTriggeredPullStart.value && newProgress > 0.05) {
                    hasTriggeredPullStart.value = true;
                    runOnJS(triggerPullStartHaptic)();
                }

                // Haptic: Rung tăng dần theo mức kéo (33%, 66%, 100%)
                const steps = [0.33, 0.66, 1];
                for (let i = steps.length - 1; i >= 0; i--) {
                    if (newProgress >= steps[i] && lastHapticStep.value < steps[i]) {
                        lastHapticStep.value = steps[i];
                        runOnJS(triggerHapticStep)(steps[i]);
                        break;
                    }
                }

                // Haptic + rung mạnh khi vượt ngưỡng (sẵn sàng thả)
                if (dampened >= REFRESH_THRESHOLD && lastHapticStep.value < 1.5) {
                    lastHapticStep.value = 1.5;
                    runOnJS(triggerThresholdReachedHaptic)();
                }

                translationY.value = dampened;
                pullProgress.value = newProgress;
            } else if (translationY.value > 0) {
                translationY.value = withTiming(0, { duration: 280, easing: EASING_OUT });
                pullProgress.value = withTiming(0, { duration: 240, easing: EASING_OUT });
            }
        })
        .onEnd(() => {
            lastHapticStep.value = -1;
            hasTriggeredPullStart.value = false;
            runOnJS(debugLog)('Pan onEnd', {
                translationY: translationY.value,
                scrollY: scrollY.value,
                threshold: REFRESH_THRESHOLD,
                willTrigger: translationY.value >= REFRESH_THRESHOLD,
            });
            if (isRefreshingValue.value) return;

            if (translationY.value >= REFRESH_THRESHOLD) {
                translationY.value = withSpring(REFRESH_SHOW_HEIGHT, {
                    damping: 18,
                    stiffness: 100
                });
                runOnJS(debugLog)('>>> onPullTrigger - gọi onRefresh');
                runOnJS(onPullTrigger)();
            } else {
                translationY.value = withTiming(0, { duration: 280, easing: EASING_OUT });
                pullProgress.value = withTiming(0, { duration: 240, easing: EASING_OUT });
            }
        })
        .activeOffsetY(5)
        .failOffsetY(-10)
        .shouldCancelWhenOutside(true);

    const nativeGesture = Gesture.Native();
    const composedGesture = Gesture.Simultaneous(panGesture, nativeGesture);

    const animatedHeaderStyle = useAnimatedStyle(() => {
        const scale = interpolate(translationY.value, [0, REFRESH_THRESHOLD], [0.7, 1.1], Extrapolate.CLAMP);
        const transY = interpolate(translationY.value, [0, REFRESH_THRESHOLD], [-50, 0], Extrapolate.CLAMP);
        const baseOffset = Platform.OS === 'ios' ? safeTop : 0;

        return {
            transform: [
                { translateY: translationY.value - HEADER_HEIGHT + transY + topOffset + baseOffset },
                { scale }
            ],
            opacity: interpolate(translationY.value, [0, 35], [0, 1], Extrapolate.CLAMP),
        };
    });

    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateY: translationY.value },
                // Cảm giác đàn hồi: nội dung hơi "giãn" khi kéo
                { scaleY: interpolate(translationY.value, [0, REFRESH_THRESHOLD], [1, 1.02], Extrapolate.CLAMP) },
            ],
        };
    });

    const renderParticles = () => {
        if (!showParticles) return null;
        return Array.from({ length: 12 }).map((_, i) => (
            <FloatingParticle key={i} index={i} pullProgress={pullProgress} color={activePrimary} />
        ));
    };

    return (
        <GestureHandlerRootView style={styles.container} collapsable={false}>
            <GestureDetector gesture={composedGesture}>
                <Animated.View style={[styles.content, animatedContentStyle, customStyle]}>
                    {renderScrollComponent ? (
                        renderScrollComponent({
                            onScroll: scrollHandler,
                            scrollEventThrottle: 1,
                            style: { flex: 1 },
                            bounces: true,
                            ...scrollProps
                        })
                    ) : (
                        <AnimatedGHScrollView
                            onScroll={scrollHandler}
                            scrollEventThrottle={1}
                            style={{ flex: 1 }}
                            bounces={true}
                            contentContainerStyle={contentContainerStyle}
                            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
                            {...scrollProps}
                        >
                            {children}
                        </AnimatedGHScrollView>
                    )}
                </Animated.View>
            </GestureDetector>

            <Animated.View pointerEvents="none" style={[styles.header, animatedHeaderStyle]}>
                <View style={styles.indicatorWrapper}>
                    <VentoUltimateLoading
                        size={100}
                        staggerScale={0.4}
                        strokeWidth={9}
                        showLabel={false}
                        progress={pullProgress}
                        isRefreshing={isRefreshingUI}
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
    container: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
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
