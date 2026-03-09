import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withRepeat,
    withTiming,
    withSequence,
    withDelay,
    Easing,
    useAnimatedStyle,
    interpolate,
    Extrapolate,
    SharedValue,
    cancelAnimation
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

// Theme-aware default colors (Binance Gold)


const AnimatedPath = Animated.createAnimatedComponent(Path);

interface PathData {
    d: string;
    length: number;
    fillRule?: "evenodd" | "nonzero";
}

// --- VENTO: Cải thiện tỷ lệ & đường cong
const VENTO_PATHS: PathData[] = [
    { d: 'M22 30 L47 82 L72 30', length: 140 }, // V: cân đối
    { d: 'M82 30 L112 30 M82 30 L82 82 L112 82 M82 56 L108 56', length: 155 }, // E
    { d: 'M127 82 L127 30 L167 82 L167 30', length: 180 }, // N
    { d: 'M182 30 L232 30 M207 30 L207 82', length: 110 }, // T
    { d: 'M252 30 L282 30 L297 56 L282 82 L252 82 L237 56 Z', length: 175 }, // O: oval hài hòa
];

const DECO_PATHS: PathData[] = [
    { d: 'M20 105 L170 105 L185 90 L200 115 L215 95 L230 105 L295 105', length: 310 },
    { d: 'M305 40 L315 50 L305 60 L295 50 Z', length: 30 },
];

const ALL_PATHS = [...VENTO_PATHS, ...DECO_PATHS];

interface DoubleLayerPathProps {
    d: string;
    pathLength: number;
    strokeWidth: number;
    bgColor: string;
    progress: SharedValue<number>;
    index: number;
    totalPaths: number;
    staggerScale: number;
    fillRule?: "evenodd" | "nonzero";
    primaryColor?: string;
}

/**
 * DoubleLayerPath: Reanimated version
 */
const DoubleLayerPath: React.FC<DoubleLayerPathProps> = ({
    d,
    pathLength,
    strokeWidth,
    progress,
    index,
    totalPaths,
    staggerScale,
    fillRule,
    primaryColor,
}) => {
    const animatedProps = useAnimatedProps(() => {
        const pathSpan = 1 / (totalPaths * (1 - staggerScale) + staggerScale);
        const startDraw = index * pathSpan * (1 - staggerScale);
        const endDraw = startDraw + pathSpan;

        // REVERSE ERASURE: Logo disappears from Right to Left (O -> T -> N -> E -> V)
        const reverseIndex = totalPaths - 1 - index;
        const startErase = 1 + reverseIndex * pathSpan * (1 - staggerScale);
        const endErase = startErase + pathSpan;

        const pathProgress = interpolate(
            progress.value,
            [0, startDraw, endDraw, 1, startErase, endErase, 2],
            [0, 0, 1, 1, 1, 0, 0], // Use 1 -> 0 to shrink back R->L
            Extrapolate.CLAMP
        );

        // Standard strokeDashoffset logic: pathLength (hidden) -> 0 (visible)
        const offset = interpolate(
            pathProgress,
            [0, 1],
            [pathLength, 0],
            Extrapolate.CLAMP
        );
        const strokeDashoffset = Math.max(0, offset);

        // iOS: Luôn trả về giá trị xác định (tránh undefined khiến animation không chạy)
        return {
            strokeDashoffset,
        };
    });

    const headProps = useAnimatedProps(() => {
        const pathSpan = 1 / (totalPaths * (1 - staggerScale) + staggerScale);
        const startDraw = index * pathSpan * (1 - staggerScale);
        const endDraw = startDraw + pathSpan;

        const headLength = pathLength * 0.4;
        const dashArraySecond = pathLength * 2;

        // During drawing phase
        const drawHeadPos = interpolate(
            progress.value,
            [startDraw, endDraw],
            [pathLength, -headLength],
            Extrapolate.CLAMP
        );

        // iOS: strokeDasharray dùng array [number, number] - format chuẩn cho native
        const headOpacity = interpolate(progress.value, [startDraw, endDraw, endDraw + 0.1], [0, 1, 0], Extrapolate.CLAMP);

        return {
            strokeDashoffset: drawHeadPos,
            strokeDasharray: [headLength, dashArraySecond],
            opacity: headOpacity,
        };
    });

    return (
        <G>
            <AnimatedPath
                d={d}
                fill="none"
                stroke={primaryColor}
                strokeWidth={strokeWidth * 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.06}
                animatedProps={animatedProps}
                fillRule={fillRule}
            />
            <AnimatedPath
                d={d}
                fill="none"
                stroke="url(#fireGradient)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={[pathLength, pathLength]}
                animatedProps={animatedProps}
                fillRule={fillRule}
            />
            <AnimatedPath
                d={d}
                fill="none"
                stroke="#FFFBF0"
                strokeWidth={strokeWidth * 1.05}
                strokeLinecap="round"
                strokeLinejoin="round"
                animatedProps={headProps}
                fillRule={fillRule}
            />
        </G>
    );
};

export interface VentoUltimateLoadingProps {
    size?: number;
    duration?: number;
    staggerScale?: number;
    strokeWidth?: number;
    showLabel?: boolean;
    progress?: SharedValue<number>;
    isRefreshing?: boolean;
    style?: ViewStyle;
    primaryColor?: string;
    glowColor?: string;
}

/**
 * MAIN COMPONENT
 */
const VentoUltimateLoading: React.FC<VentoUltimateLoadingProps> = ({
    size = 180,
    duration = 2000,
    staggerScale = 0.6,
    strokeWidth = 10,
    showLabel = true,
    progress: manualProgress,
    isRefreshing = false,
    style: customStyle,
    primaryColor,
    glowColor,
}) => {
    const { theme } = useTheme();
    const activePrimary = primaryColor || theme.colors.primary;
    const activeGlow = glowColor || theme.colors.primaryLight;

    const internalMasterAnim = useSharedValue(0);
    const labelOpacity = useSharedValue(0.5);

    useEffect(() => {
        if (showLabel) {
            labelOpacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 800 }),
                    withTiming(0.5, { duration: 800 })
                ),
                -1,
                true
            );
        }

        // Start animation if we are in auto-refresh mode OR if no manual progress is provided (loading screen mode)
        const shouldAnimate = isRefreshing || manualProgress === undefined;

        if (shouldAnimate) {
            internalMasterAnim.value = withRepeat(
                withSequence(
                    withTiming(1, { duration, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
                    withDelay(300, withTiming(2, { duration: duration * 0.9, easing: Easing.bezier(0.4, 0, 0.2, 1) })),
                    withDelay(500, withTiming(0, { duration: 0 }))
                ),
                -1
            );
        } else {
            cancelAnimation(internalMasterAnim);
            internalMasterAnim.value = 0;
        }

        return () => {
            cancelAnimation(internalMasterAnim);
            cancelAnimation(labelOpacity);
        };
    }, [isRefreshing, manualProgress === undefined, duration, showLabel]);

    const master = (isRefreshing || manualProgress === undefined) ? internalMasterAnim : manualProgress!;

    const viewBoxWidth = 320;
    const viewBoxHeight = 120;
    const aspectRatio = viewBoxWidth / viewBoxHeight;
    const width = size;
    const height = size / aspectRatio;

    const labelStyle = useAnimatedStyle(() => ({
        opacity: labelOpacity.value,
        color: activePrimary,
        transform: [
            { translateY: interpolate(master.value, [0, 1], [0, 5], Extrapolate.CLAMP) },
            { translateX: interpolate(labelOpacity.value, [0.5, 1], [-2, 2]) } // Subtle running effect
        ]
    }));

    const animatedContainerStyle = useAnimatedStyle(() => {
        const pullProgress = (manualProgress !== undefined && manualProgress !== null) ? master.value : 0;
        const stretchY = interpolate(pullProgress, [0, 1], [1, 1.15], Extrapolate.CLAMP);
        const stretchX = interpolate(pullProgress, [0, 1], [1, 0.98], Extrapolate.CLAMP);

        return {
            transform: [
                { scaleY: stretchY },
                { scaleX: stretchX },
            ],
        };
    });

    return (
        <View style={[styles.container, customStyle]} collapsable={false}>
            <Animated.View style={animatedContainerStyle}>
                <Svg width={width} height={height} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
                    <Defs>
                        <LinearGradient id="fireGradient" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor={activePrimary} stopOpacity="1" />
                            <Stop offset="0.5" stopColor={activeGlow} stopOpacity="1" />
                            <Stop offset="1" stopColor={activePrimary} stopOpacity="1" />
                        </LinearGradient>
                    </Defs>
                    <G>
                        {ALL_PATHS.map((path, index) => (
                            <DoubleLayerPath
                                key={index}
                                index={index}
                                totalPaths={ALL_PATHS.length}
                                staggerScale={staggerScale}
                                d={path.d}
                                pathLength={path.length}
                                strokeWidth={strokeWidth}
                                bgColor="#888888"
                                progress={master}
                                fillRule={path.fillRule}
                                primaryColor={activePrimary}
                            />
                        ))}
                    </G>
                </Svg>
            </Animated.View>

            {showLabel && (
                <Animated.Text style={[styles.label, labelStyle]}>
                    {isRefreshing ? 'REFRESHING...' : (manualProgress ? 'PULL TO REFRESH' : 'INITIALIZING...')}
                </Animated.Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
    label: {
        marginTop: 8,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
});

export default VentoUltimateLoading;
