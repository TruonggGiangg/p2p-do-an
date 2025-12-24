/**
 * GlassButton - Reusable iOS Fintech Premium Button
 * Features: Gradient, animations, loading state, disabled state
 */

import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { UnifiedColors, UnifiedGradients, UnifiedRadius, UnifiedSpacing } from '../../theme';

interface GlassButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'success' | 'error' | 'secondary';
    loading?: boolean;
    disabled?: boolean;
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    icon,
    style,
    textStyle,
}) => {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const gradientColors = React.useMemo(() => {
        switch (variant) {
            case 'primary':
                return [...UnifiedGradients.primary];
            case 'success':
                return [...UnifiedGradients.success];
            case 'error':
                return [...UnifiedGradients.error];
            case 'secondary':
                return [UnifiedColors.surfaceLight, UnifiedColors.surface];
            default:
                return [...UnifiedGradients.primary];
        }
    }, [variant]);

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.96,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 3,
            tension: 40,
            useNativeDriver: true,
        }).start();
    };

    const isDisabled = disabled || loading;

    return (
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={isDisabled}
                activeOpacity={0.9}
            >
                <LinearGradient
                    colors={gradientColors as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                        styles.button,
                        isDisabled && styles.buttonDisabled,
                    ]}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={UnifiedColors.white} />
                    ) : (
                        <>
                            {icon && (
                                <MaterialCommunityIcons
                                    name={icon}
                                    size={20}
                                    color={UnifiedColors.white}
                                    style={styles.icon}
                                />
                            )}
                            <Text style={[styles.text, textStyle]}>{title}</Text>
                        </>
                    )}
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: UnifiedSpacing.lg,
        borderRadius: UnifiedRadius.md,
        shadowColor: UnifiedColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
        color: UnifiedColors.white,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.3,
    },
    icon: {
        marginRight: UnifiedSpacing.xs,
    },
});
