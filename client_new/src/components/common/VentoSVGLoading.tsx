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
    shimmer?: boolean;
    strokeScale?: number;
    showHead?: boolean;
}

// --- VENTO: viewBox=370×152
const VENTO_PATHS: PathData[] = [
    { d: 'M10 24 L44 90 L78 24', length: 150 }, // V
    { d: 'M93 24 L129 24', length: 36 }, // E - top
    { d: 'M93 24 L93 90 L129 90', length: 103 }, // E - left+bottom
    { d: 'M93 57 L123 57', length: 30 }, // E - middle
    { d: 'M144 90 L144 24 L184 90 L184 24', length: 210 }, // N
    { d: 'M199 24 L247 24 M223 24 L223 90', length: 114 }, // T
    { d: 'M319 57 C319 38.8 304.7 24 287 24 C269.3 24 255 38.8 255 57 C255 75.2 269.3 90 287 90 C304.7 90 319 75.2 319 57 Z', length: 204 }, // O
];

const WIND_PATHS: PathData[] = [
    { d: 'M5 100 L308 100 C318 100 318 110 308 110', length: 319, shimmer: true, strokeScale: 0.55, showHead: false },
    { d: 'M28 112 L256 112 C266 112 266 122 256 122', length: 244, shimmer: true, strokeScale: 0.47, showHead: false },
    { d: 'M62 124 L200 124 C210 124 210 134 200 134', length: 154, shimmer: true, strokeScale: 0.40, showHead: false },
    { d: 'M106 136 L164 136 C174 136 174 146 164 146', length: 74, shimmer: true, strokeScale: 0.33, showHead: false },
];

const ALL_PATHS = [...VENTO_PATHS, ...WIND_PATHS];

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
    shimmer?: boolean;
    strokeScale?: number;
    showHead?: boolean;
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
    shimmer,
    strokeScale,
    showHead = true,
}) => {
    const gradientId = shimmer ? 'shimmerGradient' : 'fireGradient';
    const actualStrokeWidth = strokeWidth * (strokeScale || (shimmer ? 0.75 : 1));
    const bodyLinecap = showHead ? 'round' : 'butt';

    const animatedProps = useAnimatedProps(() => {
        const pathSpan = 1 / (totalPaths * (1 - staggerScale) + staggerScale);
        const startDraw = index * pathSpan * (1 - staggerScale);
        const endDraw = startDraw + pathSpan;

        // REVERSE ERASURE: Logo disappears from Right to Left
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
                strokeWidth={actualStrokeWidth * 1.6}
                strokeLinecap={bodyLinecap as any}
                strokeLinejoin="round"
                strokeDasharray={[pathLength, pathLength]}
                opacity={0.06}
                animatedProps={animatedProps}
                fillRule={fillRule}
            />
            <AnimatedPath
                d={d}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={actualStrokeWidth}
                strokeLinecap={bodyLinecap as any}
                strokeLinejoin="round"
                strokeDasharray={[pathLength, pathLength]}
                animatedProps={animatedProps}
                fillRule={fillRule}
            />
            {showHead && (
                <AnimatedPath
                    d={d}
                    fill="none"
                    stroke="#FFFBF0"
                    strokeWidth={actualStrokeWidth * 1.05}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    animatedProps={headProps}
                    fillRule={fillRule}
                />
            )}
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
    isPulling?: boolean;
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
    isPulling = false,
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

        // Start animation if we are in auto-refresh mode, pulling mode, OR if no manual progress is provided (loading screen mode)
        const shouldAnimate = isRefreshing || isPulling || manualProgress === undefined;

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
    }, [isRefreshing, isPulling, manualProgress === undefined, duration, showLabel]);

    const master = (isRefreshing || isPulling || manualProgress === undefined) ? internalMasterAnim : manualProgress!;

    const viewBoxWidth = 370;
    const viewBoxHeight = 152;
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
                        <LinearGradient id="shimmerGradient" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
                            <Stop offset="0.5" stopColor={activeGlow} stopOpacity="1" />
                            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.7" />
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
                                shimmer={path.shimmer}
                                strokeScale={path.strokeScale}
                                showHead={path.showHead}
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
