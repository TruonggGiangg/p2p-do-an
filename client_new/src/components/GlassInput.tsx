import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ViewStyle,
    TextInputProps,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface GlassInputProps extends TextInputProps {
    label?: string;
    error?: string;
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    containerStyle?: ViewStyle;
    rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
    onRightIconPress?: () => void;
}

export const GlassInput: React.FC<GlassInputProps> = ({
    label,
    error,
    icon,
    containerStyle,
    rightIcon,
    onRightIconPress,
    style,
    secureTextEntry,
    onChangeText,
    ...props
}) => {
    const { theme } = useTheme();
    const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);
    const [isFocused, setIsFocused] = useState(false);

    const isPasswordType = secureTextEntry !== undefined;
    const currentSecureEntry = isPasswordType ? !isPasswordVisible : false;

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

    const inputWrapperStyle = useMemo(
        () => [
            styles.inputWrapper,
            {
                backgroundColor: theme.colors.glassLight,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
            },
            isFocused && {
                borderColor: theme.colors.primaryBorder,
                backgroundColor: theme.colors.primaryGlass,
            },
            !!error && {
                borderColor: theme.colors.errorBorder,
                backgroundColor: theme.colors.errorGlass,
            },
        ],
        [theme.colors.glassLight, theme.colors.border, theme.colors.primaryBorder, theme.colors.primaryGlass, theme.colors.errorBorder, theme.colors.errorGlass, theme.radius.md, isFocused, error]
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
        () => (isFocused ? theme.colors.textPrimary : theme.colors.textSecondary),
        [isFocused, theme.colors.textPrimary, theme.colors.textSecondary]
    );

    return (
        <View style={[styles.container, containerStyle]}>
            {label && <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>}

            <View style={inputWrapperStyle}>
                {icon && (
                    <MaterialCommunityIcons
                        name={icon}
                        size={20}
                        color={iconColor}
                        style={styles.leftIcon}
                    />
                )}

                <TextInput
                    style={inputStyle}
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry={currentSecureEntry}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChangeText={handleChangeText}
                    selectionColor={theme.colors.primary}
                    {...props}
                />

                {isPasswordType ? (
                    <TouchableOpacity
                        onPress={togglePasswordVisibility}
                        style={styles.rightButton}
                        activeOpacity={0.7}
                    >
                        <MaterialCommunityIcons
                            name={isPasswordVisible ? 'eye-off' : 'eye'}
                            size={22}
                            color={theme.colors.textSecondary}
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
                            color={theme.colors.textSecondary}
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
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        paddingHorizontal: 16,
        height: 52,
    },
    leftIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        height: '100%',
    },
    rightButton: {
        padding: 8,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    errorText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
});

export default GlassInput;
