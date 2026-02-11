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

// --- FINTECH STYLE PATH ---
const VENTO_PATHS: PathData[] = [
    { d: 'M20 30 L45 85 L70 30', length: 140 },
    { d: 'M110 30 L80 30 L80 85 L110 85 M80 57 L105 57', length: 150 },
    { d: 'M125 85 L125 30 L165 85 L165 30', length: 180 },
    { d: 'M180 30 L230 30 M205 30 L205 85', length: 110 },
    { d: 'M250 30 L280 30 L295 57 L280 85 L250 85 L235 57 Z', length: 175 },
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
        const startErase = 1 + startDraw;
        const endErase = 1 + endDraw;

        const pathProgress = interpolate(
            progress.value,
            [0, startDraw, endDraw, 1, startErase, endErase, 2],
            [0, 0, 1, 1, 1, 2, 2],
            Extrapolate.CLAMP
        );

        const strokeDashoffset = interpolate(
            pathProgress,
            [0, 1, 2],
            [pathLength, 0, -pathLength],
            Extrapolate.CLAMP
        );

        return {
            strokeDashoffset,
        };
    });

    const headProps = useAnimatedProps(() => {
        const pathSpan = 1 / (totalPaths * (1 - staggerScale) + staggerScale);
        const startDraw = index * pathSpan * (1 - staggerScale);
        const endDraw = startDraw + pathSpan;

        const headProgress = interpolate(
            progress.value,
            [startDraw, endDraw],
            [0, 1],
            Extrapolate.CLAMP
        );

        const headLength = pathLength * 0.4;
        const offset = pathLength - (headProgress * (pathLength + headLength));

        return {
            strokeDashoffset: offset,
            strokeDasharray: `${headLength}, ${pathLength * 2}`,
            opacity: interpolate(progress.value, [startDraw, endDraw, endDraw + 0.1], [0, 1, 0], Extrapolate.CLAMP),
        };
    });

    return (
        <G>
            <AnimatedPath
                d={d}
                fill="none"
                stroke={primaryColor}
                strokeWidth={strokeWidth * 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.08}
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
                strokeDasharray={`${pathLength}, ${pathLength}`}
                animatedProps={animatedProps}
                fillRule={fillRule}
            />
            <AnimatedPath
                d={d}
                fill="none"
                stroke="#FFF8DC"
                strokeWidth={strokeWidth * 1.2}
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
    progress?: SharedValue<number> | null;
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
        labelOpacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 800 }),
                withTiming(0.5, { duration: 800 })
            ),
            -1,
            true
        );

        if (manualProgress !== undefined && manualProgress !== null) return;

        internalMasterAnim.value = withRepeat(
            withSequence(
                withTiming(1, { duration, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
                withDelay(300, withTiming(2, { duration: duration * 0.9, easing: Easing.bezier(0.4, 0, 0.2, 1) })),
                withDelay(500, withTiming(0, { duration: 0 }))
            ),
            -1
        );
    }, [manualProgress, duration]);

    const master = (manualProgress !== undefined && manualProgress !== null) ? manualProgress : internalMasterAnim;

    const viewBoxWidth = 320;
    const viewBoxHeight = 120;
    const aspectRatio = viewBoxWidth / viewBoxHeight;
    const width = size;
    const height = size / aspectRatio;

    const labelStyle = useAnimatedStyle(() => ({
        opacity: labelOpacity.value,
        color: activePrimary,
        transform: [{ translateY: interpolate(master.value, [0, 1], [0, 5], Extrapolate.CLAMP) }]
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
        <View style={[styles.container, customStyle]}>
            <Animated.View style={animatedContainerStyle}>
                <Svg width={width} height={height} viewBox={`0 15 ${viewBoxWidth} ${viewBoxHeight}`}>
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
                    {(manualProgress !== undefined && manualProgress !== null) ? 'PULL TO REFRESH' : 'INITIALIZING...'}
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
