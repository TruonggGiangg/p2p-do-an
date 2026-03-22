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

/**
 * Input variant:
 * - "standard" (default): 14px, 12px padding — text inputs, currency, etc.
 * - "hero": 24px accent bold — large capital display
 * - "compact": 14px centered, 8px padding — range pickers (min/max)
 */
export type InputVariant = 'standard' | 'hero' | 'compact';

interface CommonInputProps {
    label?: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    icon?: string;
    /** Suffix text — "₫", "%", "T", etc. */
    suffix?: string;
    /** Input variant */
    variant?: InputVariant;
    secureTextEntry?: boolean;
    error?: string;
    keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    containerStyle?: ViewStyle;
    inputStyle?: TextStyle;
    editable?: boolean;
    multiline?: boolean;
    numberOfLines?: number;
    textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
    maxLength?: number;
    autoFocus?: boolean;
    selectTextOnFocus?: boolean;
    returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send' | 'default';
}

// Design tokens — Stitch Premium Input Showcase
const VARIANT_TOKENS = {
    standard: { height: 44, paddingH: 14, fontSize: 14, fontWeight: '600' as const },
    hero:     { height: 52, paddingH: 14, fontSize: 24, fontWeight: '800' as const },
    compact:  { height: 38, paddingH: 10, fontSize: 14, fontWeight: '700' as const },
};

export const CommonInput: React.FC<CommonInputProps> = ({
    label,
    value,
    onChangeText,
    placeholder,
    icon,
    suffix,
    variant = 'standard',
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
    maxLength,
    autoFocus,
    selectTextOnFocus,
    returnKeyType,
}) => {
    const { theme } = useTheme();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const t = VARIANT_TOKENS[variant];

    // Theme-aware surface & border
    const surfaceBg = isDark
        ? ((c as any).surfaceL2 || '#293831')
        : (c.surfaceLight || '#F8F8F4');

    const focusColor = isDark ? '#CDEA2D' : c.primary;

    const borderColor = error
        ? c.error
        : isFocused
            ? focusColor
            : isDark
                ? 'rgba(255,255,255,0.06)'
                : c.border;

    const textColor = variant === 'hero'
        ? (isDark ? '#CDEA2D' : c.primary)
        : (c as any).textPrimary || c.text;
    const isCompact = variant === 'compact';
    const placeholderColor = isDark ? 'rgba(255,255,255,0.25)' : (c.textMuted || '#9CA3AF');

    return (
        <View style={[styles.wrapper, containerStyle]}>
            {label && (
                <Text style={[styles.label, { color: c.textSecondary }]}>
                    {label}
                </Text>
            )}
            <View
                style={[
                    styles.inputContainer,
                    {
                        borderColor,
                        backgroundColor: surfaceBg,
                        height: multiline ? undefined : t.height,
                        paddingHorizontal: t.paddingH,
                        borderRadius: 12,
                    },
                ]}
            >
                {icon && (
                    <MaterialCommunityIcons
                        name={icon as any}
                        size={18}
                        color={isFocused ? focusColor : c.textMuted}
                        style={styles.icon}
                    />
                )}
                <TextInput
                    style={[
                        styles.input,
                        {
                            color: textColor,
                            fontSize: t.fontSize,
                            fontWeight: t.fontWeight,
                            textAlign: isCompact ? 'center' : 'left',
                        },
                        !editable && { opacity: 0.5 },
                        inputStyle,
                    ]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={placeholderColor}
                    secureTextEntry={secureTextEntry && !showPassword}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    editable={editable}
                    multiline={multiline}
                    numberOfLines={numberOfLines}
                    textAlignVertical={textAlignVertical}
                    maxLength={maxLength}
                    autoFocus={autoFocus}
                    selectTextOnFocus={selectTextOnFocus}
                    returnKeyType={returnKeyType}
                />
                {suffix && (
                    <Text
                        style={[
                            styles.suffix,
                            {
                                color: variant === 'hero'
                                    ? (isDark ? '#CDEA2D' : c.primary)
                                    : (isDark ? 'rgba(255,255,255,0.3)' : c.textMuted),
                                fontSize: variant === 'hero' ? 20 : 12,
                            },
                        ]}
                    >
                        {suffix}
                    </Text>
                )}
                {secureTextEntry && (
                    <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeIcon}
                    >
                        <MaterialCommunityIcons
                            name={showPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color={c.textMuted}
                        />
                    </TouchableOpacity>
                )}
            </View>
            {error && (
                <Text style={[styles.errorText, { color: c.error }]}>
                    {error}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
    },
    icon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        padding: 0,
        margin: 0,
    },
    suffix: {
        marginLeft: 4,
        fontWeight: '500',
    },
    eyeIcon: {
        padding: 4,
    },
    errorText: {
        fontSize: 11,
        marginTop: 4,
    },
});
