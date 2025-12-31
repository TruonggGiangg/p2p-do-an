import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, StatusBar, ViewStyle, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

// RESTORED: Galaxy Colors (Vibrant & Deep)
const GalaxyColors = {
    bgDeep: '#020b1a', 
    nebulaPrimary: '#00C6FF', // Cyan
    nebulaSecondary: '#9D50BB', // Purple
    nebulaAccent: '#F4D03F', // Gold
    transparent: 'transparent',
};

const { width, height } = Dimensions.get('window');
const ORB_SIZE = Math.max(width, height) * 1.4;

interface GradientBackgroundProps {
    children: React.ReactNode;
    useSafeArea?: boolean;
    style?: ViewStyle;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
    children,
    useSafeArea = true,
    style,
}) => {
    const Container = useSafeArea ? SafeAreaView : View;

    // --- ANIMATION VALUES ---
    // 1. Rotation (Base drift)
    const rotateAnim = useRef(new Animated.Value(0)).current;
    
    // 2. Wobble (Organic floating movement)
    const wobbleAnim = useRef(new Animated.Value(0)).current;

    // 3. Pulse (Breathing scale)
    const pulseAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // A. Endless Rotation: background drift
        Animated.loop(
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: 3000, // Faster: 30s
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        // B. Organic Wobble: Sine-wave movement
        Animated.loop(
            Animated.sequence([
                Animated.timing(wobbleAnim, {
                    toValue: 1,
                    duration: 8000, // Faster
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(wobbleAnim, {
                    toValue: -1,
                    duration: 16000, // Faster
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(wobbleAnim, {
                    toValue: 0,
                    duration: 8000, // Faster
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();

        // C. Deep Breathing: Scale & Opacity pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 5000, // Faster: 5s
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0,
                    duration: 5000, // Faster: 5s
                    easing: Easing.in(Easing.quad),
                    useNativeDriver: true,
                })
            ])
        ).start();
    }, []);

    // --- INTERPOLATIONS ---

    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const spinReverse = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['360deg', '0deg']
    });

    // Wobble Translations
    const transX = wobbleAnim.interpolate({
        inputRange: [-1, 1],
        outputRange: [-50, 50] // Drift 50px left/right
    });

    const transY = wobbleAnim.interpolate({
        inputRange: [-1, 1],
        outputRange: [-30, 30] // Drift 30px up/down
    });

    // Breathing Scale
    const scaleOrb1 = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1.1, 1.3]
    });

    const scaleOrb2 = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1.3, 1.1] // Counter-pulse
    });

    const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

    return (
        <View style={styles.wrapper}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* LAYER 1: Deep Space Background */}
            <LinearGradient
                colors={[GalaxyColors.bgDeep, '#000000']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            {/* LAYER 2: Primary Nebula (Cyan) - Drifts & Rotates */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaPrimary, 'rgba(0, 198, 255, 0.1)', GalaxyColors.transparent]}
                style={[
                    styles.orb,
                    styles.orbPrimary,
                    {
                        opacity: 0.6,
                        transform: [
                            { rotate: spin }, 
                            { scale: scaleOrb1 },
                            { translateX: transX },
                            { translateY: transY }
                        ]
                    }
                ]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
            />

            {/* LAYER 3: Secondary Nebula (Purple) - Counter-Rotates & Counter-Pulses */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaSecondary, 'rgba(157, 80, 187, 0.1)', GalaxyColors.transparent]}
                style={[
                    styles.orb,
                    styles.orbSecondary,
                    {
                        opacity: 0.5,
                        transform: [
                            { rotate: spinReverse },
                            { scale: scaleOrb2 },
                            { translateX: Animated.multiply(transX, -1) }, // Move opposite
                        ]
                    }
                ]}
                start={{ x: 0.8, y: 0.2 }}
                end={{ x: 0.2, y: 0.8 }}
            />

            {/* LAYER 4: Stardust Accent (Gold) - Subtle center glow */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaAccent, GalaxyColors.transparent]}
                style={[
                    styles.orb,
                    styles.orbCenter,
                    { 
                        opacity: 0.15,
                        transform: [{ scale: 1.5 }] 
                    }
                ]}
            />

            {/* LAYER 5: Vignette - Focus attention */}
            <LinearGradient
                colors={['transparent', 'rgba(2, 11, 26, 0.5)', 'rgba(2, 11, 26, 0.9)']}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            {/* Content Container */}
            <Container style={[styles.container, style]} edges={['top', 'left', 'right']}>
                {children}
            </Container>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: GalaxyColors.bgDeep,
        overflow: 'hidden',
    },
    container: {
        flex: 1,
        zIndex: 20,
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
    }
});
