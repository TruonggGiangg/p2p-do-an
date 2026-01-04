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
    seed?: any; // Value that triggers a background shift when changed
}

/**
 * GradientBackground - Reactive version for high performance
 * ✅ NO continuous loops = zero background CPU usage when idle
 * ✅ Subtle shift on state change (typing) = visual feedback
 */
export const GradientBackground: React.FC<GradientBackgroundProps> = ({
    children,
    useSafeArea = true,
    style,
    seed,
}) => {
    const Container = useSafeArea ? SafeAreaView : View;

    // Animation values
    const shiftAnim = useRef(new Animated.Value(0)).current;

    // Track previous seed count or hash
    useEffect(() => {
        if (seed !== undefined) {
            // Trigger a single gentle shift when seed changes
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
                })
            ]).start();
        }
    }, [seed]);

    // Interpolations for subtle movement
    const transX1 = shiftAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 20]
    });
    const transY1 = shiftAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -15]
    });
    const rotate1 = shiftAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '5deg']
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

            {/* LAYER 2: Primary Nebula (Cyan) */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaPrimary, 'rgba(0, 198, 255, 0.1)', GalaxyColors.transparent]}
                style={[
                    styles.orb,
                    styles.orbPrimary,
                    {
                        opacity: 0.6,
                        transform: [
                            { scale: 1.2 },
                            { translateX: transX1 },
                            { translateY: transY1 },
                            { rotate: rotate1 }
                        ]
                    }
                ]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
            />

            {/* LAYER 3: Secondary Nebula (Purple) */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaSecondary, 'rgba(157, 80, 187, 0.1)', GalaxyColors.transparent]}
                style={[
                    styles.orb,
                    styles.orbSecondary,
                    {
                        opacity: 0.5,
                        transform: [
                            { scale: 1.2 },
                            { translateX: Animated.multiply(transX1, -0.8) },
                            { translateY: Animated.multiply(transY1, -0.5) }
                        ]
                    }
                ]}
                start={{ x: 0.8, y: 0.2 }}
                end={{ x: 0.2, y: 0.8 }}
            />

            {/* LAYER 4: Stardust Accent (Gold) */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaAccent, GalaxyColors.transparent]}
                style={[
                    styles.orb,
                    styles.orbCenter,
                    {
                        opacity: 0.15,
                        transform: [
                            { scale: 1.5 },
                            { translateY: Animated.multiply(transY1, 0.3) }
                        ]
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
