import React, { useState } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    Text,
    TouchableOpacity,
    ViewStyle,
    TextStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface CommonInputProps {
    label?: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    icon?: string;
    secureTextEntry?: boolean;
    error?: string;
    keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    containerStyle?: ViewStyle;
    inputStyle?: TextStyle;
    editable?: boolean;
    multiline?: boolean;
    numberOfLines?: number;
    textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
}

export const CommonInput: React.FC<CommonInputProps> = ({
    label,
    value,
    onChangeText,
    placeholder,
    icon,
    secureTextEntry,
    error,
    keyboardType = 'default',
    autoCapitalize = 'none',
    containerStyle,
    inputStyle,
    editable = true,
    multiline = false,
    numberOfLines,
    textAlignVertical,
}) => {
    const { theme } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const borderColor = error
        ? theme.colors.error
        : isFocused
            ? '#CDEA2D'
            : theme.colors.border;

    const backgroundColor = isFocused
        ? theme.colors.surfaceLight
        : theme.colors.backgroundSecondary;

    return (
        <View style={[styles.wrapper, containerStyle]}>
            {label && (
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                    {label}
                </Text>
            )}
            <View
                style={[
                    styles.inputContainer,
                    {
                        borderColor,
                        backgroundColor,
                        borderWidth: isFocused ? 1 : 1,
                    },
                ]}
            >
                {icon && (
                    <MaterialCommunityIcons
                        name={icon as any}
                        size={20}
                        color={isFocused ? '#CDEA2D' : theme.colors.textMuted}
                        style={styles.icon}
                    />
                )}
                <TextInput
                    style={[
                        styles.input,
                        { color: theme.colors.textPrimary },
                        !editable && { opacity: 0.5 },
                        inputStyle,
                    ]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry={secureTextEntry && !showPassword}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    editable={editable}
                    multiline={multiline}
                    numberOfLines={numberOfLines}
                    textAlignVertical={textAlignVertical}
                />
                {secureTextEntry && (
                    <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeIcon}
                    >
                        <MaterialCommunityIcons
                            name={showPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color={theme.colors.textMuted}
                        />
                    </TouchableOpacity>
                )}
            </View>
            {error && (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                    {error}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 54,
        borderRadius: 14,
        paddingHorizontal: 16,
    },
    icon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: '100%',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    eyeIcon: {
        padding: 4,
    },
    errorText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
    },
});
