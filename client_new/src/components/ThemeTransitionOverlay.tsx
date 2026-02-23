/**
 * Circular reveal overlay for theme toggle on native (Android/iOS).
 * Similar to Ant Design's View Transition effect.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ThemeTransitionOverlayProps {
    visible: boolean;
    x: number;
    y: number;
    backgroundColor: string;
    onComplete: () => void;
}

const DURATION = 500;
const EASING = Easing.bezier(0.4, 0, 0.2, 1);

export function ThemeTransitionOverlay({ visible, x, y, backgroundColor, onComplete }: ThemeTransitionOverlayProps) {
    const progress = useSharedValue(0);

    const maxRadius = Math.max(
        Math.hypot(x, y),
        Math.hypot(SCREEN_WIDTH - x, y),
        Math.hypot(x, SCREEN_HEIGHT - y),
        Math.hypot(SCREEN_WIDTH - x, SCREEN_HEIGHT - y)
    ) + 10;

    useEffect(() => {
        if (!visible) return;
        progress.value = 0;
        progress.value = withTiming(
            1,
            { duration: DURATION, easing: EASING },
            (finished) => {
                if (finished) runOnJS(onComplete)();
            }
        );
    }, [visible]);

    const animatedStyle = useAnimatedStyle(() => {
        const radius = progress.value * maxRadius;
        return {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            left: x - radius,
            top: y - radius,
        };
    });

    if (!visible) return null;

    return (
        <View style={[StyleSheet.absoluteFill, styles.container]} pointerEvents="none">
            <Animated.View
                style={[
                    styles.circle,
                    { backgroundColor },
                    animatedStyle,
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        zIndex: 9999,
        elevation: 9999,
        backgroundColor: 'transparent',
    },
    circle: {
        position: 'absolute',
    },
});
