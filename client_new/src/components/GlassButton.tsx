import React, { useRef } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';

interface GlassButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'success' | 'error' | 'secondary' | 'outline';
    loading?: boolean;
    disabled?: boolean;
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    iconPosition?: 'left' | 'right';
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
    iconPosition = 'left',
    style,
    textStyle,
}) => {
    const { theme } = useTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const gradientColors = React.useMemo(() => {
        switch (variant) {
            case 'primary':
                return theme.gradients.primary;
            case 'success':
                return theme.gradients.success;
            case 'error':
                return theme.gradients.error;
            case 'secondary':
                return [theme.colors.surfaceLight, theme.colors.surface];
            default:
                return theme.gradients.primary;
        }
    }, [variant, theme]);

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

    if (variant === 'outline') {
        return (
            <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
                <TouchableOpacity
                    onPress={onPress}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    disabled={isDisabled}
                    activeOpacity={0.8}
                    style={[
                        styles.buttonOutline,
                        {
                            borderColor: theme.colors.primaryBorder,
                            backgroundColor: theme.colors.primaryGlass,
                            borderRadius: theme.radius.md,
                        },
                        isDisabled && styles.buttonDisabled,
                    ]}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                        <>
                            {icon && iconPosition === 'left' && (
                                <MaterialCommunityIcons
                                    name={icon}
                                    size={20}
                                    color={theme.colors.primary}
                                    style={styles.iconLeft}
                                />
                            )}
                            <Text style={[styles.buttonTextOutline, { color: theme.colors.primary }, textStyle]}>
                                {title}
                            </Text>
                            {icon && iconPosition === 'right' && (
                                <MaterialCommunityIcons
                                    name={icon}
                                    size={20}
                                    color={theme.colors.primary}
                                    style={styles.iconRight}
                                />
                            )}
                        </>
                    )}
                </TouchableOpacity>
            </Animated.View>
        );
    }

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
                        {
                            borderRadius: theme.radius.md,
                            shadowColor: theme.colors.primary,
                        },
                        isDisabled && styles.buttonDisabled,
                    ]}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={theme.colors.text} />
                    ) : (
                        <>
                            {icon && iconPosition === 'left' && (
                                <MaterialCommunityIcons
                                    name={icon}
                                    size={20}
                                    color={theme.colors.text}
                                    style={styles.iconLeft}
                                />
                            )}
                            <Text style={[styles.buttonText, { color: theme.colors.text }, textStyle]}>{title}</Text>
                            {icon && iconPosition === 'right' && (
                                <MaterialCommunityIcons
                                    name={icon}
                                    size={20}
                                    color={theme.colors.text}
                                    style={styles.iconRight}
                                />
                            )}
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
        paddingHorizontal: 24,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    buttonOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderWidth: 1,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.3,
    },
    buttonTextOutline: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.3,
    },
    iconLeft: {
        marginRight: 4,
    },
    iconRight: {
        marginLeft: 4,
    },
});

export default GlassButton;
