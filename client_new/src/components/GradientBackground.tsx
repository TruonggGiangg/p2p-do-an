import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, StatusBar, ViewStyle, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    useSafeArea = true,
    style,
    seed,
}) => {
    const Container = useSafeArea ? SafeAreaView : View;
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

    return (
        <View style={styles.wrapper}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* Deep Space Background */}
            <LinearGradient
                colors={['#0a0e27', '#000000']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            {/* Primary Nebula (Blue) */}
            <AnimatedGradient
                colors={['#3b82f6', 'rgba(59, 130, 246, 0.1)', 'transparent']}
                style={[
                    styles.orb,
                    styles.orbPrimary,
                    {
                        opacity: 0.6,
                        transform: [{ scale: 1.2 }, { translateX: transX1 }, { translateY: transY1 }, { rotate: rotate1 }],
                    },
                ]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
            />

            {/* Secondary Nebula (Purple) */}
            <AnimatedGradient
                colors={['#8b5cf6', 'rgba(139, 92, 246, 0.1)', 'transparent']}
                style={[
                    styles.orb,
                    styles.orbSecondary,
                    {
                        opacity: 0.5,
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
                        opacity: 0.15,
                        transform: [{ scale: 1.5 }, { translateY: Animated.multiply(transY1, 0.3) }],
                    },
                ]}
            />

            {/* Vignette */}
            <LinearGradient
                colors={['transparent', 'rgba(10, 14, 39, 0.5)', 'rgba(10, 14, 39, 0.9)']}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <Container style={[styles.container, style]} edges={['top', 'left', 'right']}>
                {children}
            </Container>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: '#0a0e27',
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
    },
});

export default GradientBackground;
