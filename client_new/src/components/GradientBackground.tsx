import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, StatusBar, ViewStyle, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');
const ORB_SIZE = Math.max(width, height) * 1.4;

interface GradientBackgroundProps {
    children: React.ReactNode;
    useSafeArea?: boolean;
    style?: ViewStyle;
    seed?: any;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
    children,
    useSafeArea = false,
    style,
    seed,
}) => {
    const { theme } = useTheme();
    // Không dùng SafeAreaView ở đây vì CustomHeader sẽ tự xử lý safe area
    const Container = View;
    const shiftAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (seed !== undefined) {
            Animated.sequence([
                Animated.timing(shiftAnim, {
                    toValue: 1,
                    duration: 400,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(shiftAnim, {
                    toValue: 0,
                    duration: 800,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [seed]);

    const transX1 = shiftAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 20],
    });
    const transY1 = shiftAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -15],
    });
    const rotate1 = shiftAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '5deg'],
    });

    const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

    const isDark = theme.mode === 'dark';
    const backgroundGradient = theme.gradients.background;
    const vignetteColors = isDark
        ? ['transparent', 'rgba(10, 14, 39, 0.5)', 'rgba(10, 14, 39, 0.9)']
        : ['transparent', 'rgba(248, 250, 252, 0.5)', 'rgba(248, 250, 252, 0.9)'];

    return (
        <View style={[styles.wrapper, { backgroundColor: theme.colors.background }]}>
            <StatusBar
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
                translucent
            />

            {/* Background Gradient */}
            <LinearGradient
                colors={backgroundGradient as any}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            {/* Primary Nebula (Smooth Purple/Blue Gradient) */}
            <AnimatedGradient
                colors={['#8b5cf6', 'rgba(139, 92, 246, 0.15)', 'rgba(99, 102, 241, 0.1)', 'transparent']}
                style={[
                    styles.orb,
                    styles.orbPrimary,
                    {
                        opacity: isDark ? 0.65 : 0.35,
                        transform: [{ scale: 1.2 }, { translateX: transX1 }, { translateY: transY1 }, { rotate: rotate1 }],
                    },
                ]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
            />

            {/* Secondary Nebula (Smooth Blue/Purple Gradient) */}
            <AnimatedGradient
                colors={['#6366f1', 'rgba(99, 102, 241, 0.15)', 'rgba(139, 92, 246, 0.1)', 'transparent']}
                style={[
                    styles.orb,
                    styles.orbSecondary,
                    {
                        opacity: isDark ? 0.55 : 0.3,
                        transform: [{ scale: 1.2 }, { translateX: Animated.multiply(transX1, -0.8) }, { translateY: Animated.multiply(transY1, -0.5) }],
                    },
                ]}
                start={{ x: 0.8, y: 0.2 }}
                end={{ x: 0.2, y: 0.8 }}
            />

            {/* Accent (Pink for BNPL) */}
            <AnimatedGradient
                colors={['#ec4899', 'transparent']}
                style={[
                    styles.orb,
                    styles.orbCenter,
                    {
                        opacity: isDark ? 0.15 : 0.08,
                        transform: [{ scale: 1.5 }, { translateY: Animated.multiply(transY1, 0.3) }],
                    },
                ]}
            />

            {/* Vignette - Softer for light mode */}
            <LinearGradient
                colors={vignetteColors as any}
                locations={[0, 0.6, 1]}
                style={[StyleSheet.absoluteFill, { opacity: isDark ? 1 : 0.5 }]}
                pointerEvents="none"
            />

            <Container style={[styles.container, style]}>
                {children}
            </Container>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        overflow: 'hidden',
    },
    container: {
        flex: 1,
        zIndex: 20,
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
    },
    orb: {
        position: 'absolute',
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: ORB_SIZE / 2,
    },
    orbPrimary: {
        top: -ORB_SIZE * 0.35,
        left: -ORB_SIZE * 0.25,
    },
    orbSecondary: {
        bottom: -ORB_SIZE * 0.35,
        right: -ORB_SIZE * 0.25,
    },
    orbCenter: {
        top: height / 2 - ORB_SIZE / 2,
        left: width / 2 - ORB_SIZE / 2,
    },
});

export default GradientBackground;
