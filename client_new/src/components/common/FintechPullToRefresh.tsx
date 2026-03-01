import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform, Vibration } from 'react-native';
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
import * as Haptics from 'expo-haptics';
import VentoUltimateLoading from './VentoSVGLoading';
import { useTheme } from '../../contexts/ThemeContext';

const REFRESH_THRESHOLD = 55;
const HEADER_HEIGHT = 150;
const REFRESH_SHOW_HEIGHT = 100;

// Vùng cho phép kéo: scrollY <= này mới nhận pull. Đủ lớn để lần kéo thứ 2+ vẫn hoạt động
const PULL_ZONE_THRESHOLD = 80;
const EASING_OUT = Easing.bezier(0.33, 1, 0.68, 1);

// Dây rút: 12 nấc haptic từ 0 → 1 (cảm giác kéo từng nấc)
const DRAWSTRING_NOTCHES = 12;
const DRAWSTRING_STEPS = Array.from({ length: DRAWSTRING_NOTCHES }, (_, i) => (i + 1) / DRAWSTRING_NOTCHES);

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
    const x = useSharedValue(Math.random() * 140 - 70);
    const y = useSharedValue(24);
    const scale = useSharedValue(Math.random() * 0.9 + 0.5);
    const sparkleValue = useSharedValue(1);

    useEffect(() => {
        y.value = withRepeat(
            withDelay(index * 100,
                withTiming(-220, { duration: 2600 + Math.random() * 600 })
            ),
            -1,
            false
        );

        sparkleValue.value = withRepeat(
            withTiming(1.4, { duration: 400 + Math.random() * 250 }),
            -1,
            true
        );
    }, [index]);

    const style = useAnimatedStyle(() => {
        const p = pullProgress.value;
        const sparkle = p > 0.5 ? sparkleValue.value : 1;
        const scaleMult = p > 0.85 ? 1.2 : (p > 0.5 ? sparkle / 1.1 : 1);
        return {
            transform: [
                { translateX: x.value },
                { translateY: y.value },
                { scale: scale.value * scaleMult },
            ],
            opacity: interpolate(p, [0.25, 0.6, 0.9], [0, 0.45, 0.8], Extrapolate.CLAMP),
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

    const MIN_DISPLAY_MS = 350; // Giảm để kéo lại ngay sau refresh, không phải đợi lâu

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
            translationY.value = withSpring(REFRESH_SHOW_HEIGHT, {
                damping: 18,
                stiffness: 130,
                mass: 0.7,
            });
            pullProgress.value = withTiming(1, { duration: 220 });
        } else {
            const minDisplayDuration = MIN_DISPLAY_MS;
            const elapsed = showStartRef.current ? Date.now() - showStartRef.current : minDisplayDuration;
            const delay = Math.max(0, minDisplayDuration - elapsed);

            const doHide = () => {
                pendingHideRef.current = null;
                isRefreshingValue.value = false;
                setIsRefreshingUI(false);
                setShowParticles(false);
                scrollY.value = 0; // Reset để lần kéo sau nhận diện đúng
                translationY.value = withTiming(0, { duration: 220, easing: EASING_OUT });
                pullProgress.value = withTiming(0, { duration: 200, easing: EASING_OUT });
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
                // Rung thỏa mãn khi thả - như kéo dây rút xong
                Vibration.vibrate([0, 25, 30, 35, 50, 40, 30]);
            }
            onRefresh();
        }
    }, [onRefresh]);

    // Dây rút: mỗi nấc kéo = 1 tick haptic nhẹ
    const triggerDrawstringTick = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (Platform.OS === 'android') {
            Vibration.vibrate([0, 8, 6]); // Tick ngắn - cảm giác nấc răng
        }
    }, []);

    const triggerPullStartHaptic = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (Platform.OS === 'android') {
            Vibration.vibrate([0, 10, 8]);
        }
    }, []);

    // Đạt ngưỡng - "cạch" mạnh như dây rút chốt vào
    const triggerThresholdReachedHaptic = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        if (Platform.OS === 'android') {
            Vibration.vibrate([0, 20, 15, 35, 25, 20]); // Rung mạnh ấn tượng
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
                // Đàn hồi dây rút: kháng lực tăng dần, cảm giác kéo có "nấc"
                const resistance = 0.55;
                const dampened = 220 * (1 - Math.exp(-input * resistance / 320));

                const newProgress = interpolate(dampened, [15, REFRESH_THRESHOLD], [0, 1], Extrapolate.CLAMP);

                // Haptic: Bắt đầu kéo
                if (!hasTriggeredPullStart.value && newProgress > 0.04) {
                    hasTriggeredPullStart.value = true;
                    runOnJS(triggerPullStartHaptic)();
                }

                // Dây rút: mỗi nấc = 1 tick haptic
                for (let i = DRAWSTRING_STEPS.length - 1; i >= 0; i--) {
                    const step = DRAWSTRING_STEPS[i];
                    if (newProgress >= step && lastHapticStep.value < step) {
                        lastHapticStep.value = step;
                        runOnJS(triggerDrawstringTick)();
                        break;
                    }
                }

                // Đạt ngưỡng - "cạch" mạnh
                if (dampened >= REFRESH_THRESHOLD && lastHapticStep.value < 1.5) {
                    lastHapticStep.value = 1.5;
                    runOnJS(triggerThresholdReachedHaptic)();
                }

                translationY.value = dampened;
                pullProgress.value = newProgress;
            } else if (translationY.value > 0) {
                translationY.value = withSpring(0, { damping: 20, stiffness: 260 });
                pullProgress.value = withTiming(0, { duration: 220, easing: EASING_OUT });
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
                    damping: 16,
                    stiffness: 140,
                    mass: 0.8,
                });
                runOnJS(debugLog)('>>> onPullTrigger - gọi onRefresh');
                runOnJS(onPullTrigger)();
            } else {
                // Snap back đàn hồi như dây rút bật lại
                translationY.value = withSpring(0, {
                    damping: 22,
                    stiffness: 280,
                    mass: 0.6,
                });
                pullProgress.value = withTiming(0, { duration: 200, easing: EASING_OUT });
            }
        })
        .activeOffsetY(2)
        .failOffsetY(-15)
        .minDistance(0)
        .shouldCancelWhenOutside(false);

    const nativeGesture = Gesture.Native();
    const composedGesture = Gesture.Simultaneous(panGesture, nativeGesture);

    const animatedHeaderStyle = useAnimatedStyle(() => {
        const t = translationY.value;
        const p = pullProgress.value;
        const scale = interpolate(t, [0, REFRESH_THRESHOLD], [0.65, 1.15], Extrapolate.CLAMP);
        const transY = interpolate(t, [0, REFRESH_THRESHOLD], [-55, 0], Extrapolate.CLAMP);
        const baseOffset = Platform.OS === 'ios' ? safeTop : 0;
        // Góc xoay nhẹ khi kéo - cảm giác "nghiêng" theo lực
        const rotateZ = interpolate(t, [0, REFRESH_THRESHOLD * 0.5, REFRESH_THRESHOLD], [0, 1.5, 0], Extrapolate.CLAMP);
        // Glow pulse khi gần đạt ngưỡng
        const glowScale = interpolate(p, [0.85, 1], [1, 1.08], Extrapolate.CLAMP);

        return {
            transform: [
                { translateY: t - HEADER_HEIGHT + transY + topOffset + baseOffset },
                { scale: scale * glowScale },
                { rotateZ: `${rotateZ}deg` },
            ],
            opacity: interpolate(t, [0, 28], [0, 1], Extrapolate.CLAMP),
            shadowOpacity: interpolate(p, [0.7, 1], [0, 0.3], Extrapolate.CLAMP),
            shadowRadius: interpolate(p, [0.7, 1], [0, 24], Extrapolate.CLAMP),
            shadowOffset: { width: 0, height: 4 },
        };
    });

    const animatedContentStyle = useAnimatedStyle(() => {
        const t = translationY.value;
        // Đàn hồi cao su: giãn mạnh hơn khi kéo, cảm giác "dây rút" căng
        const scaleY = interpolate(t, [0, REFRESH_THRESHOLD * 0.5, REFRESH_THRESHOLD], [1, 1.015, 1.035], Extrapolate.CLAMP);
        return {
            transform: [
                { translateY: t },
                { scaleY },
            ],
        };
    });

    const renderParticles = () => {
        if (!showParticles) return null;
        return Array.from({ length: 14 }).map((_, i) => (
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

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.header,
                    { shadowColor: activePrimary },
                    animatedHeaderStyle,
                ]}
            >
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
        width: 2.5,
        height: 2.5,
        borderRadius: 1.25,
        zIndex: 11,
    },
    content: { flex: 1, zIndex: 1 },
});

export default FintechPullToRefresh;
