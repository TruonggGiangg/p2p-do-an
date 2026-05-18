import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform, Vibration, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
    ScrollView as GHScrollView,
    State,
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
const HEADER_HEIGHT = 160;
const REFRESH_TRIGGER = 100;
const VERTICAL_OFFSET = 36; // Lower the whole indicator down

// Vùng cho phép kéo: scrollY <= này mới nhận pull. Đủ lớn để lần kéo thứ 2+ vẫn hoạt động
const PULL_ZONE_THRESHOLD = 80;
const EASING_OUT = Easing.bezier(0.33, 1, 0.68, 1);

// Dây rút: 12 nấc haptic từ 0 → 1 (cảm giác kéo từng nấc)
const DRAWSTRING_NOTCHES = 12;
const DRAWSTRING_STEPS = Array.from({ length: DRAWSTRING_NOTCHES }, (_, i) => (i + 1) / DRAWSTRING_NOTCHES);

// DEBUG: Bật true để trace scroll + gesture
const DEBUG_PULL_TO_REFRESH = false;
const debugLog = (...args: unknown[]) => {
    if (DEBUG_PULL_TO_REFRESH) {
        console.log('[FintechPullToRefresh]', ...args);
    }
};

// Android: GHScrollView (RNGH) - tích hợp gesture system, touch được pass khi Pan fail
// iOS: ScrollView RN - reference p2p dùng cách này
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
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
    const [isPulling, setIsPulling] = useState(false);
    const showStartRef = React.useRef<number | null>(null);
    const pendingHideRef = React.useRef<NodeJS.Timeout | null>(null);
    const isPullTriggered = React.useRef(false); // true = user physically pulled

    // Android specific refs cho RefreshControl
    const lastRefreshTime = React.useRef(0);
    const lastNotAtTopTimeRef = React.useRef(Date.now());
    const REFRESH_COOLDOWN_MS = 1000;
    const SCROLL_SETTLE_MS = 500;

    useEffect(() => {
        if (DEBUG_PULL_TO_REFRESH) {
            debugLog('Mount Android - DEBUG ON. Vuốt màn hình, xem log: onScroll, Pan onBegin/onStart/onFinalize');
        }
    }, []);

    useAnimatedReaction(
        () => (pullProgress.value > 0.08 || isRefreshingValue.value),
        (shouldShow) => {
            runOnJS(setShowParticles)(shouldShow);
        }
    );

    useAnimatedReaction(
        () => (pullProgress.value > 0.3),
        (shouldPull) => {
            runOnJS(setIsPulling)(shouldPull);
        }
    );

    const MIN_DISPLAY_MS = 1700; // Đã đồng bộ với Home (1.7s)
    // Giảm để kéo lại ngay sau refresh, không phải đợi lâu

    useEffect(() => {
        if (refreshing) {
            if (pendingHideRef.current) {
                clearTimeout(pendingHideRef.current);
                pendingHideRef.current = null;
            }
            showStartRef.current = Date.now();
            isRefreshingValue.value = true;

            // Only show Vento header when user physically pulled (not initial load)
            if (isPullTriggered.current) {
                setIsRefreshingUI(true);
                setShowParticles(true);
                translationY.value = withSpring(REFRESH_TRIGGER, {
                    damping: 18,
                    stiffness: 130,
                    mass: 0.7,
                });
                pullProgress.value = withTiming(1, { duration: 220 });
            }
        } else {
            const wasPull = isPullTriggered.current;
            const minDisplayDuration = MIN_DISPLAY_MS;
            const elapsed = showStartRef.current ? Date.now() - showStartRef.current : minDisplayDuration;
            const delay = wasPull ? Math.max(0, minDisplayDuration - elapsed) : 0;

            const doHide = () => {
                pendingHideRef.current = null;
                isRefreshingValue.value = false;
                isPullTriggered.current = false;
                if (wasPull) {
                    setIsRefreshingUI(false);
                    setShowParticles(false);
                    translationY.value = withTiming(0, { duration: 220, easing: EASING_OUT });
                    pullProgress.value = withTiming(0, { duration: 200, easing: EASING_OUT });
                }
                scrollY.value = 0;
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
            isPullTriggered.current = true; // Mark this as user-initiated pull
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (Platform.OS === 'android') {
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

    const lastScrollLogY = useSharedValue(-999);
    const updateNotAtTopTime = () => {
        lastNotAtTopTimeRef.current = Date.now();
    };

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            const y = event.contentOffset.y;
            scrollY.value = y;
            if (Platform.OS === 'android' && y > 5) {
                runOnJS(updateNotAtTopTime)();
            }
            // DEBUG: log scroll. Nếu không thấy onScroll khi vuốt = ScrollView không nhận touch
            if (DEBUG_PULL_TO_REFRESH && (Math.abs(y - lastScrollLogY.value) > 15 || y <= 20)) {
                lastScrollLogY.value = y;
                runOnJS(debugLog)('onScroll', { contentOffsetY: y });
            }
        },
    });

    const handleRefreshAndroid = useCallback(() => {
        const now = Date.now();
        if (now - lastRefreshTime.current < REFRESH_COOLDOWN_MS) {
            return;
        }

        const timeSinceLastScroll = now - lastNotAtTopTimeRef.current;
        if (timeSinceLastScroll < SCROLL_SETTLE_MS) {
            return;
        }

        lastRefreshTime.current = now;
        isPullTriggered.current = true;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (Platform.OS === 'android') {
            Vibration.vibrate([0, 25, 30, 35, 50, 40, 30]);
        }
        if (onRefresh) onRefresh();
    }, [onRefresh]);

    const panGesture = Gesture.Pan()
        .enabled(!isRefreshingUI)
        .onBegin(() => {
            runOnJS(debugLog)('Pan onBegin', { scrollY: scrollY.value });
        })
        .onStart(() => {
            runOnJS(debugLog)('Pan onStart ACTIVATED', { scrollY: scrollY.value });
        })
        .onUpdate((event) => {
            if (isRefreshingValue.value) return;

            // Android: scrollY <= 10 (reference p2p); iOS: PULL_ZONE_THRESHOLD để lần kéo thứ 2+ vẫn hoạt động
            const pullZone = Platform.OS === 'android' ? 10 : PULL_ZONE_THRESHOLD;
            if (scrollY.value <= pullZone && event.translationY > 0) {
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
                translationY.value = withSpring(REFRESH_TRIGGER, {
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
        .onFinalize((e) => {
            const s = e.state;
            const stateStr = s === State.END ? 'END' : s === State.FAILED ? 'FAILED' : s === State.CANCELLED ? 'CANCELLED' : String(s);
            runOnJS(debugLog)('Pan onFinalize', { state: stateStr, scrollY: scrollY.value });
        })
        // activeOffsetX/failOffsetX: vuốt ngang (ScrollView horizontal) → Pan fail ngay → horizontal scroll nhận touch
        .activeOffsetX([-999, 999])
        .failOffsetX([-15, 15])
        // Android: activeOffsetY cao = phải kéo xuống rõ ràng mới pull; failOffsetY âm = vuốt lên (scroll) thì fail ngay
        // iOS: giữ nhạy như reference
        .activeOffsetY(Platform.OS === 'android' ? 10 : 12)
        .failOffsetY(Platform.OS === 'android' ? -8 : -10)
        .minDistance(5)
        .shouldCancelWhenOutside(Platform.OS === 'android' ? false : true);

    const nativeGesture = Gesture.Native();
    const composedGesture = Gesture.Simultaneous(panGesture, nativeGesture);

    const animatedHeaderStyle = useAnimatedStyle(() => {
        const t = translationY.value;
        const p = pullProgress.value;

        return {
            height: t,
            marginTop: topOffset,
            shadowOpacity: interpolate(p, [0.7, 1], [0, 0.3], Extrapolate.CLAMP),
            shadowRadius: interpolate(p, [0.7, 1], [0, 24], Extrapolate.CLAMP),
            shadowOffset: { width: 0, height: 4 },
        };
    });

    // Icon wrapper: scale + rotate + opacity tách riêng khỏi header container
    const animatedIconStyle = useAnimatedStyle(() => {
        const t = translationY.value;
        const p = pullProgress.value;
        const scale = interpolate(t, [0, REFRESH_THRESHOLD], [0.65, 1.15], Extrapolate.CLAMP);
        const rotateZ = interpolate(t, [0, REFRESH_THRESHOLD * 0.5, REFRESH_THRESHOLD], [0, 1.5, 0], Extrapolate.CLAMP);
        const glowScale = interpolate(p, [0.85, 1], [1, 1.08], Extrapolate.CLAMP);
        return {
            opacity: interpolate(t, [0, 28], [0, 1], Extrapolate.CLAMP),
            transform: [
                { scale: scale * glowScale },
                { rotateZ: `${rotateZ}deg` },
            ],
        };
    });

    const animatedContentStyle = useAnimatedStyle(() => {
        const t = translationY.value;
        // Đàn hồi cao su: giãn mạnh hơn khi kéo, cảm giác "dây rút" căng
        const scaleY = interpolate(t, [0, REFRESH_THRESHOLD * 0.5, REFRESH_THRESHOLD], [1, 1.015, 1.035], Extrapolate.CLAMP);
        return {
            transform: [
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

    const nativeRefreshControl = Platform.OS === 'android' ? (
        <RefreshControl
            refreshing={false} // QUAN TRONG: Luôn false để nó biến mất ngay khi nhả tay
            onRefresh={handleRefreshAndroid}
            colors={[activePrimary as string]}
            progressBackgroundColor={'#FFFFFF'}
            tintColor="transparent"
            progressViewOffset={0}
        />
    ) : undefined;

    // Icon slot bên trong ScrollView — cuộn theo content, không sticky
    const headerSlot = (
        <Animated.View
            pointerEvents="none"
            style={[{
                overflow: 'hidden',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: activePrimary,
            }, animatedHeaderStyle]}
        >
            <Animated.View style={[styles.indicatorWrapper, animatedIconStyle]}>
                <VentoUltimateLoading
                    size={110}
                    staggerScale={0.4}
                    strokeWidth={9}
                    showLabel={false}
                    progress={pullProgress}
                    isRefreshing={isRefreshingUI}
                    isPulling={isPulling}
                    primaryColor={primaryColor}
                    glowColor={glowColor}
                />
                {renderParticles()}
            </Animated.View>
        </Animated.View>
    );

    const androidScrollContent = renderScrollComponent ? (
        renderScrollComponent({
            onScroll: scrollHandler,
            scrollEventThrottle: 16,
            style: [styles.content, animatedContentStyle, customStyle, scrollProps.style],
            overScrollMode: 'never',
            ...scrollProps
        })
    ) : (
        <AnimatedGHScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            style={[styles.content, { flex: 1 }, animatedContentStyle, customStyle]}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            overScrollMode="never"
            refreshControl={nativeRefreshControl}
            {...scrollProps}
        >
            {headerSlot}
            {children}
        </AnimatedGHScrollView>
    );

    const iosScrollContent = renderScrollComponent ? (
        renderScrollComponent({
            onScroll: scrollHandler,
            scrollEventThrottle: 16,
            bounces: false,
            style: [styles.content, animatedContentStyle, customStyle, scrollProps.style],
            ...scrollProps
        })
    ) : (
        <AnimatedScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            style={[styles.content, { flex: 1 }, animatedContentStyle, customStyle]}
            bounces={false}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            {...scrollProps}
        >
            {headerSlot}
            {children}
        </AnimatedScrollView>
    );

    return (
        <GestureHandlerRootView style={styles.container} collapsable={false}>
            <GestureDetector gesture={composedGesture}>
                {Platform.OS === 'android' ? androidScrollContent : iosScrollContent}
            </GestureDetector>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
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
