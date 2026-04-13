import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, G, Circle } from 'react-native-svg';
import { useTheme } from '../../../contexts/ThemeContext';

interface CreditScoreGaugeProps {
    score: number;
    minScore?: number;
    maxScore?: number;
    size?: number;
    strokeWidth?: number;
    label?: string;
    loading?: boolean;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function CreditScoreGauge({
    score,
    minScore = 150,
    maxScore = 750,
    size = 240,
    strokeWidth = 16,
    label = 'Rủi ro thấp',
    loading = false,
}: CreditScoreGaugeProps) {
    const { theme } = useTheme();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';

    const [displayScore, setDisplayScore] = useState(minScore);
    const animatedValue = useRef(new Animated.Value(0)).current;
    const scoreTextValue = useRef(new Animated.Value(minScore)).current;

    const radius = (size - strokeWidth) / 2;
    const centerX = size / 2;
    const centerY = size / 2;

    useEffect(() => {
        const listenerId = scoreTextValue.addListener(({ value }) => {
            setDisplayScore(Math.round(value));
        });
        return () => scoreTextValue.removeListener(listenerId);
    }, []);

    // Rotate 90 degrees clockwise: 
    // Old: -210 to 30 (total 240, centered around -90/Left? Wait, if they want it top-centered, it was -120 to 120)
    // If we add 90 to a top-centered arc (-120 to 120), we get -30 to 210.
    const startAngle = -120; // Starting from bottom-left for a "top" arc
    const endAngle = 120;   // Ending at bottom-right for a "top" arc
    // Wait, the user said ROTATE it 90 degrees clockwise from the CURRENT state.
    // Current start: -210, Current end: 30.
    // New start: -120, New end: 120.
    const totalAngle = endAngle - startAngle;

    const polarToCartesian = (x: number, y: number, r: number, angleInDegrees: number) => {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: x + r * Math.cos(angleInRadians),
            y: y + r * Math.sin(angleInRadians),
        };
    };

    const describeArc = (x: number, y: number, r: number, start: number, end: number) => {
        const startPoint = polarToCartesian(x, y, r, start);
        const endPoint = polarToCartesian(x, y, r, end);
        const largeArcFlag = end - start <= 180 ? '0' : '1';
        return [`M`, startPoint.x, startPoint.y, `A`, r, r, 0, largeArcFlag, 1, endPoint.x, endPoint.y].join(' ');
    };

    const backgroundPath = describeArc(centerX, centerY, radius, startAngle, endAngle);

    useEffect(() => {
        const ratio = Math.max(0, Math.min(1, (score - minScore) / (maxScore - minScore)));

        Animated.parallel([
            Animated.timing(animatedValue, {
                toValue: ratio,
                duration: 1500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            }),
            Animated.timing(scoreTextValue, {
                toValue: score,
                duration: 1500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            })
        ]).start();
    }, [score, minScore, maxScore]);

    // Path details
    const strokeDasharray = Math.PI * 2 * radius;
    const arcLength = (totalAngle / 360) * strokeDasharray;

    // Choose color based on score directly (vivid colors)
    const getProgressColor = () => {
        if (score >= 680) return '#18A058'; // Binance Green
        if (score >= 570) return '#84CC16'; // Lime
        if (score >= 431) return '#F2C94C'; // Yellow
        if (score >= 322) return '#F2994A'; // Orange
        return '#EB5757'; // Red
    };

    const progressColor = getProgressColor();

    return (
        <View style={[styles.container, { width: size, height: size * 1 }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background Track */}
                <Path
                    d={backgroundPath}
                    stroke={isDark ? '#2B3139' : '#F0F2F5'}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Progress Track */}
                <AnimatedPath
                    d={backgroundPath}
                    stroke={progressColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={[arcLength, arcLength]}
                    strokeDashoffset={animatedValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [arcLength, 0],
                    })}
                />
            </Svg>

            {/* Score Content Overlay */}
            <View style={styles.contentOverlay}>
                <Text style={[styles.label, { color: c.textMuted }]}>{label.toUpperCase()}</Text>
                <Text style={[styles.score, { color: c.textPrimary }]}>
                    {displayScore}
                </Text>
            </View>

            {/* Min/Max Labels */}
            <View style={styles.footerLabels}>
                <Text style={[styles.scaleText, { color: c.textMuted }]}>{minScore}</Text>
                <Text style={[styles.scaleText, { color: c.textMuted }]}>{maxScore}</Text>
            </View>
        </View>
    );
}

function AnimatedNumber({ value, style }: { value: Animated.Value; style: any }) {
    const [displayValue, setDisplayValue] = React.useState(0);

    useEffect(() => {
        const listener = value.addListener(({ value: v }) => {
            setDisplayValue(Math.floor(v));
        });
        return () => value.removeListener(listener);
    }, [value]);

    return <Text style={style}>{displayValue}</Text>;
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        overflow: 'hidden',
    },
    contentOverlay: {
        position: 'absolute',
        top: '32%',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    score: {
        fontSize: 48,
        fontFamily: 'Poppins_700Bold',
        lineHeight: 56,
        marginVertical: 4,
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 99,
        marginTop: 4,
    },
    badgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    footerLabels: {
        position: 'absolute',
        bottom: 15,
        width: '80%',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    scaleText: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
    },
});
