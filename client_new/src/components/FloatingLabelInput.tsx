import React, { useState, useRef, useMemo, useCallback, memo, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ViewStyle,
    TextInputProps,
    Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface FloatingLabelInputProps extends TextInputProps {
    label: string;
    error?: string;
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    containerStyle?: ViewStyle;
    rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
    onRightIconPress?: () => void;
}

export const FloatingLabelInput: React.FC<FloatingLabelInputProps> = ({
    label,
    error,
    icon,
    containerStyle,
    rightIcon,
    onRightIconPress,
    style,
    secureTextEntry,
    value,
    onChangeText,
    ...props
}) => {
    const { theme } = useTheme();
    const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);
    const [isFocused, setIsFocused] = useState(false);
    const animatedIsFocused = useRef(new Animated.Value(value ? 1 : 0)).current;

    const isPasswordType = secureTextEntry !== undefined;
    const currentSecureEntry = isPasswordType ? !isPasswordVisible : false;
    const hasValue = Boolean(value && String(value).length > 0);

    useEffect(() => {
        const targetValue = isFocused || hasValue ? 1 : 0;
        Animated.timing(animatedIsFocused, {
            toValue: targetValue,
            duration: 150,
            useNativeDriver: false,
        }).start();
    }, [isFocused, hasValue, animatedIsFocused]);
    
    useEffect(() => {
        if (hasValue && !isFocused) {
            animatedIsFocused.setValue(1);
        } else if (!hasValue && !isFocused) {
            animatedIsFocused.setValue(0);
        }
    }, [hasValue, isFocused, animatedIsFocused]);
    const handleFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    const handleChangeText = useCallback(
        (text: string) => {
            onChangeText?.(text);
        },
        [onChangeText]
    );

    const togglePasswordVisibility = useCallback(() => {
        setIsPasswordVisible((prev) => !prev);
    }, []);

    // Memoize styles để tránh tạo lại object mỗi lần render
    const inputWrapperStyle = useMemo(
        () => [
            styles.inputWrapper,
            {
                backgroundColor: theme.mode === 'dark' 
                    ? 'rgba(255, 255, 255, 0.08)' 
                    : 'rgba(139, 92, 246, 0.05)',
                borderColor: error 
                    ? theme.colors.errorBorder 
                    : isFocused 
                        ? theme.colors.primaryBorder 
                        : theme.colors.border,
                borderRadius: theme.radius.md,
            },
            isFocused && !error && {
                borderWidth: 2,
                backgroundColor: theme.mode === 'dark'
                    ? 'rgba(139, 92, 246, 0.12)'
                    : 'rgba(139, 92, 246, 0.08)',
            },
        ],
        [theme.mode, theme.radius.md, theme.colors.errorBorder, theme.colors.primaryBorder, theme.colors.border, error, isFocused]
    );

    const labelTopInterpolation = useRef(
        animatedIsFocused.interpolate({
            inputRange: [0, 1],
            outputRange: [16, -8],
        })
    ).current;

    const labelFontSizeInterpolation = useRef(
        animatedIsFocused.interpolate({
            inputRange: [0, 1],
            outputRange: [15, 12],
        })
    ).current;

    const labelColorInterpolation = useMemo(
        () =>
            animatedIsFocused.interpolate({
                inputRange: [0, 1],
                outputRange: [theme.colors.textMuted, theme.colors.primary],
            }),
        [animatedIsFocused, theme.colors.textMuted, theme.colors.primary]
    );

    const labelStyle = useMemo(
        () => ({
            top: labelTopInterpolation,
            fontSize: labelFontSizeInterpolation,
            color: labelColorInterpolation,
        }),
        [labelTopInterpolation, labelFontSizeInterpolation, labelColorInterpolation]
    );

    const inputStyle = useMemo(
        () => [
            styles.input,
            {
                color: theme.colors.textPrimary,
            },
            style,
        ],
        [theme.colors.textPrimary, style]
    );

    const iconColor = useMemo(
        () => (isFocused ? theme.colors.primary : theme.colors.textMuted),
        [isFocused, theme.colors.primary, theme.colors.textMuted]
    );

    const labelBackgroundColor = useMemo(
        () => theme.colors.background,
        [theme.colors.background]
    );

    return (
        <View style={[styles.container, containerStyle]}>
            <View style={inputWrapperStyle}>
                {icon && (
                    <MaterialCommunityIcons
                        name={icon}
                        size={20}
                        color={iconColor}
                        style={styles.leftIcon}
                    />
                )}

                <View style={styles.inputContainer}>
                    <Animated.Text
                        style={[
                            styles.label,
                            labelStyle,
                            {
                                backgroundColor: labelBackgroundColor,
                                paddingHorizontal: 4,
                            },
                        ]}
                    >
                        {label}
                    </Animated.Text>
                    <TextInput
                        style={inputStyle}
                        placeholderTextColor={theme.colors.textDim}
                        secureTextEntry={currentSecureEntry}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onChangeText={handleChangeText}
                        selectionColor={theme.colors.primary}
                        value={value}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        {...props}
                    />
                </View>

                {isPasswordType ? (
                    <TouchableOpacity
                        onPress={togglePasswordVisibility}
                        style={styles.rightButton}
                        activeOpacity={0.7}
                    >
                        <MaterialCommunityIcons
                            name={isPasswordVisible ? 'eye-off' : 'eye'}
                            size={22}
                            color={theme.colors.textMuted}
                        />
                    </TouchableOpacity>
                ) : rightIcon ? (
                    <TouchableOpacity
                        onPress={onRightIconPress}
                        disabled={!onRightIconPress}
                        style={styles.rightButton}
                        activeOpacity={0.7}
                    >
                        <MaterialCommunityIcons
                            name={rightIcon}
                            size={22}
                            color={theme.colors.textMuted}
                        />
                    </TouchableOpacity>
                ) : null}
            </View>

            {error ? (
                <View style={styles.errorContainer}>
                    <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.error} />
                    <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
                </View>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 4,
        minHeight: 56,
    },
    leftIcon: {
        marginRight: 12,
    },
    inputContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 12,
    },
    label: {
        position: 'absolute',
        left: 0,
        fontFamily: 'Poppins_500Medium',
    },
    input: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        paddingTop: 8,
        paddingBottom: 0,
    },
    rightButton: {
        padding: 8,
        marginLeft: 8,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 6,
    },
    errorText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        flex: 1,
    },
});

export default memo(FloatingLabelInput);
