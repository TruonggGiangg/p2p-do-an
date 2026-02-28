import React, { useRef, useEffect } from 'react';
import {
    Animated,
    TouchableOpacity,
    Easing,
    ViewStyle,
    TouchableOpacityProps,
} from 'react-native';
import { CommonCard } from './CommonCard';

interface AnimatedCardProps extends TouchableOpacityProps {
    children: React.ReactNode;
    style?: ViewStyle;
    delay?: number;
    duration?: number;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
    children,
    style,
    delay = 0,
    duration = 800,
    onPress,
    ...props
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration,
                    easing: Easing.out(Easing.back(1.2)),
                    useNativeDriver: true,
                }),
            ]).start();
        }, delay);

        return () => clearTimeout(timer);
    }, [delay, duration, fadeAnim, slideAnim, scaleAnim]);

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.96,
            useNativeDriver: true,
            tension: 300,
            friction: 20,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 300,
            friction: 20,
        }).start();
    };

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
                {...props}
            >
                <Animated.View
                    style={[
                        {
                            opacity: fadeAnim,
                            transform: [
                                { translateY: slideAnim },
                                { scale: scaleAnim }
                            ],
                        },
                        style,
                    ]}
                >
                    <CommonCard style={style}>
                        {children}
                    </CommonCard>
                </Animated.View>
            </TouchableOpacity>
        );
    }

    return (
        <Animated.View
            style={[
                {
                    opacity: fadeAnim,
                    transform: [
                        { translateY: slideAnim },
                        { scale: scaleAnim }
                    ],
                },
                style,
            ]}
        >
            <CommonCard style={style}>
                {children}
            </CommonCard>
        </Animated.View>
    );
};

export default AnimatedCard;