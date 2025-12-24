import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ViewStyle,
    TextStyle,
    TextInputProps
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DarkColors, DarkStyling } from '../../theme';

interface GlassInputProps extends TextInputProps {
    label?: string;
    rightText?: string;
    error?: string;
    icon?: string; // Ionicons name
    containerStyle?: ViewStyle;
    rightIcon?: string;
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
    ...props
}) => {
    const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);
    const [isFocused, setIsFocused] = useState(false);

    // Handle password toggle
    const isPasswordType = secureTextEntry !== undefined;
    const currentSecureEntry = isPasswordType ? !isPasswordVisible : false;

    return (
        <View style={[styles.container, containerStyle]}>
            {label && <Text style={styles.label}>{label}</Text>}

            <View style={[
                styles.inputWrapper,
                isFocused && styles.inputWrapperFocused,
                !!error && styles.inputWrapperError
            ]}>
                {icon && (
                    <Ionicons
                        name={icon as any}
                        size={20}
                        color={isFocused ? DarkColors.text : DarkColors.textSecondary}
                        style={styles.leftIcon}
                    />
                )}

                <TextInput
                    style={[styles.input, style]}
                    placeholderTextColor={DarkColors.textMuted}
                    secureTextEntry={currentSecureEntry}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    selectionColor={DarkColors.primary}
                    {...props}
                />

                {isPasswordType ? (
                    <TouchableOpacity
                        onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                        style={styles.rightButton}
                    >
                        <Ionicons
                            name={isPasswordVisible ? 'eye-off' : 'eye'}
                            size={22}
                            color={DarkColors.textSecondary}
                        />
                    </TouchableOpacity>
                ) : rightIcon ? (
                    <TouchableOpacity
                        onPress={onRightIconPress}
                        disabled={!onRightIconPress}
                        style={styles.rightButton}
                    >
                        <Ionicons
                            name={rightIcon as any}
                            size={22}
                            color={DarkColors.textSecondary}
                        />
                    </TouchableOpacity>
                ) : null}
            </View>

            {error ? (
                <View style={styles.errorContainer}>
                    <Ionicons name="warning" size={12} color={DarkColors.error} />
                    <Text style={styles.errorText}>{error}</Text>
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
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
        marginBottom: 8,
    },
    inputContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 0,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 0,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
        height: 52,
    },
    inputWrapperFocused: {
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    inputWrapperError: {
        borderColor: DarkColors.error,
        backgroundColor: 'rgba(255, 0, 64, 0.05)',
    },
    leftIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        color: DarkColors.text,
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
        marginTop: 6,
        gap: 4,
    },
    errorText: {
        color: DarkColors.error,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
});
