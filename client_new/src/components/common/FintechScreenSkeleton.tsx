import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    withSequence,
    interpolate,
    Extrapolate,
    SharedValue,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SHIMMER_WIDTH = SCREEN_WIDTH * 0.7;

type SkeletonVariant = 'home' | 'bnpl' | 'loan' | 'profile';

interface FintechScreenSkeletonProps {
    variant: SkeletonVariant;
    style?: StyleProp<ViewStyle>;
}

interface SkeletonBoxProps {
    width?: any;
    height: number;
    radius?: number;
    shimmerProgress: SharedValue<number>;
    pulseProgress: SharedValue<number>;
    baseColor: string;
    shimmerColors: [string, string, string];
    style?: StyleProp<ViewStyle>;
    staggerIndex?: number;
}

/**
 * Premium SkeletonBox with gradient shimmer + pulse
 */
const SkeletonBox: React.FC<SkeletonBoxProps> = ({
    width = '100%',
    height,
    radius = 14,
    shimmerProgress,
    pulseProgress,
    baseColor,
    shimmerColors,
    style,
    staggerIndex = 0,
}) => {
    // Shimmer wave: gradient slides across with smooth easing
    const shimmerStyle = useAnimatedStyle(() => {
        const translateX = interpolate(
            shimmerProgress.value,
            [0, 1],
            [-SHIMMER_WIDTH, SCREEN_WIDTH + SHIMMER_WIDTH * 0.3],
            Extrapolate.CLAMP,
        );
        return {
            transform: [{ translateX }, { skewX: '-20deg' }],
        };
    });

    // Pulse: subtle opacity breathing per box, staggered
    const pulseStyle = useAnimatedStyle(() => {
        const staggerOffset = staggerIndex * 0.08;
        const opacity = interpolate(
            pulseProgress.value,
            [0, 0.5, 1],
            [0.45 + staggerOffset, 0.8, 0.45 + staggerOffset],
            Extrapolate.CLAMP,
        );
        return { opacity };
    });

    return (
        <Animated.View
            style={[
                styles.skeletonBox,
                {
                    width: width as any,
                    height,
                    borderRadius: radius,
                    backgroundColor: baseColor,
                },
                pulseStyle,
                style,
            ]}
        >
            <Animated.View style={[styles.shimmerWrap, shimmerStyle]}>
                <LinearGradient
                    colors={shimmerColors}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.shimmerGradient}
                />
            </Animated.View>
        </Animated.View>
    );
};

/**
 * Row of small skeleton boxes (for grid items, inline elements)
 */
const SkeletonRow: React.FC<{
    items: { w: number | string; h: number; r?: number }[];
    gap?: number;
    shimmerProgress: SharedValue<number>;
    pulseProgress: SharedValue<number>;
    baseColor: string;
    shimmerColors: [string, string, string];
    style?: StyleProp<ViewStyle>;
    startIndex?: number;
}> = ({ items, gap = 10, shimmerProgress, pulseProgress, baseColor, shimmerColors, style, startIndex = 0 }) => (
    <View style={[{ flexDirection: 'row', gap }, style]}>
        {items.map((item, i) => (
            <SkeletonBox
                key={i}
                width={item.w}
                height={item.h}
                radius={item.r ?? 10}
                shimmerProgress={shimmerProgress}
                pulseProgress={pulseProgress}
                baseColor={baseColor}
                shimmerColors={shimmerColors}
                staggerIndex={startIndex + i}
            />
        ))}
    </View>
);

const FintechScreenSkeleton: React.FC<FintechScreenSkeletonProps> = ({ variant, style }) => {
    const { theme } = useTheme();
    const isDark = theme.mode === 'dark';

    const shimmerProgress = useSharedValue(0);
    const pulseProgress = useSharedValue(0);

    useEffect(() => {
        // Shimmer: smooth wave slide
        shimmerProgress.value = withRepeat(
            withDelay(200,
                withTiming(1, { duration: 1400, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
            ),
            -1,
            false,
        );
        // Pulse: gentle breathing
        pulseProgress.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            ),
            -1,
            false,
        );
    }, []);

    const baseColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const shimmerColors: [string, string, string] = isDark
        ? ['transparent', 'rgba(255,255,255,0.08)', 'transparent']
        : ['transparent', 'rgba(255,255,255,0.7)', 'transparent'];

    const boxProps = { shimmerProgress, pulseProgress, baseColor, shimmerColors };

    // ── VARIANT LAYOUTS ──

    const renderHome = () => (
        <>
            {/* Wallet card */}
            <SkeletonBox height={190} radius={22} {...boxProps} staggerIndex={0} />
            {/* Action grid */}
            <View style={styles.gridContainer}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <View key={i} style={styles.gridItem}>
                        <SkeletonBox width={48} height={48} radius={14} {...boxProps} staggerIndex={i + 1} />
                        <SkeletonBox width={36} height={8} radius={4} {...boxProps} staggerIndex={i + 1} style={{ marginTop: 8 }} />
                    </View>
                ))}
            </View>
            {/* Recent section */}
            <SkeletonRow items={[{ w: 120, h: 14, r: 6 }, { w: 60, h: 14, r: 6 }]} gap={0} {...boxProps} startIndex={9} style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 12 }} />
            <SkeletonBox height={70} radius={16} {...boxProps} staggerIndex={11} />
            <SkeletonBox height={70} radius={16} {...boxProps} staggerIndex={12} style={{ marginTop: 10 }} />
        </>
    );

    const renderLoan = () => (
        <>
            {/* Header */}
            <SkeletonRow items={[{ w: 160, h: 20, r: 8 }]} {...boxProps} startIndex={0} style={{ marginBottom: 6 }} />
            <SkeletonBox width="70%" height={12} radius={6} {...boxProps} staggerIndex={1} style={{ marginBottom: 18 }} />
            {/* Product cards */}
            <SkeletonBox height={140} radius={20} {...boxProps} staggerIndex={2} />
            <SkeletonBox height={140} radius={20} {...boxProps} staggerIndex={3} style={{ marginTop: 14 }} />
            {/* Recent section */}
            <SkeletonRow items={[{ w: 130, h: 14, r: 6 }, { w: 70, h: 14, r: 6 }]} gap={0} {...boxProps} startIndex={4} style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 12 }} />
            <SkeletonBox height={60} radius={16} {...boxProps} staggerIndex={6} />
            <SkeletonBox height={60} radius={16} {...boxProps} staggerIndex={7} style={{ marginTop: 8 }} />
        </>
    );

    const renderBnpl = () => (
        <>
            <SkeletonBox height={160} radius={20} {...boxProps} staggerIndex={0} />
            <SkeletonBox height={200} radius={20} {...boxProps} staggerIndex={1} style={{ marginTop: 14 }} />
            <SkeletonBox height={140} radius={20} {...boxProps} staggerIndex={2} style={{ marginTop: 14 }} />
        </>
    );

    const renderProfile = () => (
        <>
            {/* Avatar area */}
            <View style={styles.profileHeader}>
                <SkeletonBox width={80} height={80} radius={40} {...boxProps} staggerIndex={0} />
                <SkeletonBox width={140} height={16} radius={8} {...boxProps} staggerIndex={1} style={{ marginTop: 14 }} />
                <SkeletonBox width={100} height={11} radius={6} {...boxProps} staggerIndex={2} style={{ marginTop: 8 }} />
            </View>
            {/* Credit score */}
            <SkeletonBox height={100} radius={18} {...boxProps} staggerIndex={3} style={{ marginTop: 20 }} />
            {/* Settings */}
            <SkeletonBox height={54} radius={14} {...boxProps} staggerIndex={4} style={{ marginTop: 14 }} />
            <SkeletonBox height={54} radius={14} {...boxProps} staggerIndex={5} style={{ marginTop: 10 }} />
            <SkeletonBox height={54} radius={14} {...boxProps} staggerIndex={6} style={{ marginTop: 10 }} />
            <SkeletonBox height={54} radius={14} {...boxProps} staggerIndex={7} style={{ marginTop: 10 }} />
        </>
    );

    return (
        <View style={[styles.container, style]}>
            {variant === 'home' && renderHome()}
            {variant === 'bnpl' && renderBnpl()}
            {variant === 'loan' && renderLoan()}
            {variant === 'profile' && renderProfile()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    skeletonBox: {
        overflow: 'hidden',
    },
    shimmerWrap: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: SHIMMER_WIDTH,
    },
    shimmerGradient: {
        flex: 1,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: 18,
        paddingHorizontal: 4,
    },
    gridItem: {
        width: '23%',
        alignItems: 'center',
        marginBottom: 16,
    },
    profileHeader: {
        alignItems: 'center',
        paddingTop: 10,
    },
});

export default FintechScreenSkeleton;
