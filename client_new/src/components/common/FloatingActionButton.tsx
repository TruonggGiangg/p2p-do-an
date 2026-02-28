import React, { useRef, useEffect } from 'react';
import {
    Animated,
    TouchableOpacity,
    StyleSheet,
    Easing,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface FloatingActionButtonProps {
    onPress: () => void;
    icon?: string;
    size?: number;
    backgroundColor?: string;
    iconColor?: string;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
    onPress,
    icon = 'plus',
    size = 56,
    backgroundColor = '#FF6B35',
    iconColor = '#fff',
}) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.delay(1200),
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 8,
                }),
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 800,
                    easing: Easing.out(Easing.back(2)),
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, [scaleAnim, rotateAnim]);

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.9,
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

    const rotate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['180deg', '0deg'],
    });

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    transform: [{ scale: scaleAnim }, { rotate }],
                },
            ]}
        >
            <TouchableOpacity
                style={[
                    styles.button,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor,
                        ...Platform.select({
                            ios: {
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.3,
                                shadowRadius: 8,
                            },
                            android: {
                                elevation: 8,
                            },
                        }),
                    },
                ]}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
            >
                <MaterialCommunityIcons name={icon as any} size={size * 0.4} color={iconColor} />
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 100,
        right: 20,
        zIndex: 1000,
    },
    button: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default FloatingActionButton;
