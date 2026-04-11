import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    forwardRef,
} from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Platform,
} from 'react-native';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export interface PinCodeInputRef {
    focus: () => void;
    blur: () => void;
    clear: () => void;
}

interface PinCodeInputProps {
    value: string;
    onChange: (value: string) => void;
    onComplete?: (value: string) => void;
    length?: number;
    editable?: boolean;
    autoFocus?: boolean;
    masked?: boolean;
    hasError?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    cellStyle?: StyleProp<ViewStyle>;
    inputStyle?: StyleProp<TextStyle>;
}

export const PinCodeInput = forwardRef<PinCodeInputRef, PinCodeInputProps>(
    (
        {
            value,
            onChange,
            onComplete,
            length = 6,
            editable = true,
            autoFocus = false,
            masked = true,
            hasError = false,
            containerStyle,
            cellStyle,
            inputStyle,
        },
        ref,
    ) => {
        const { theme } = useTheme();
        const c = theme.colors;
        const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
        const inputRefs = useRef<Array<TextInput | null>>([]);

        const digits = useMemo(
            () => Array.from({ length }, (_, i) => value[i] ?? ''),
            [length, value],
        );

        const focusIndex = useCallback(
            (index: number) => {
                if (!editable) return;
                const safeIndex = Math.max(0, Math.min(length - 1, index));
                inputRefs.current[safeIndex]?.focus();
                if (Platform.OS === 'android') {
                    setTimeout(() => inputRefs.current[safeIndex]?.focus(), 40);
                }
            },
            [editable, length],
        );

        const focusFirstEmpty = useCallback(() => {
            const idx = digits.findIndex((d) => d === '');
            focusIndex(idx === -1 ? length - 1 : idx);
        }, [digits, focusIndex, length]);

        useImperativeHandle(
            ref,
            () => ({
                focus: () => {
                    focusFirstEmpty();
                },
                blur: () => {
                    inputRefs.current.forEach((r) => r?.blur());
                },
                clear: () => {
                    onChange('');
                    setTimeout(() => focusIndex(0), 0);
                },
            }),
            [focusFirstEmpty, focusIndex, onChange],
        );

        useEffect(() => {
            if (!autoFocus || !editable) return;
            const t = setTimeout(() => focusFirstEmpty(), 120);
            return () => clearTimeout(t);
        }, [autoFocus, editable, focusFirstEmpty]);

        const emitNextValue = useCallback(
            (nextDigits: string[]) => {
                const nextValue = nextDigits.join('').slice(0, length);
                onChange(nextValue);
                if (nextDigits.every((d) => d !== '') && nextValue.length === length) {
                    onComplete?.(nextValue);
                }
            },
            [length, onChange, onComplete],
        );

        const handleChangeText = useCallback(
            (index: number, text: string) => {
                if (!editable) return;
                const numeric = text.replace(/\D/g, '');
                const nextDigits = [...digits];

                if (numeric.length === 0) {
                    nextDigits[index] = '';
                    emitNextValue(nextDigits);
                    return;
                }

                let cursor = index;
                for (const char of numeric) {
                    if (cursor >= length) break;
                    nextDigits[cursor] = char;
                    cursor += 1;
                }

                emitNextValue(nextDigits);

                if (cursor < length) {
                    focusIndex(cursor);
                } else {
                    inputRefs.current[length - 1]?.blur();
                }
            },
            [digits, editable, emitNextValue, focusIndex, length],
        );

        const handleKeyPress = useCallback(
            (index: number, key: string) => {
                if (key !== 'Backspace' || !editable) return;

                if (digits[index] !== '') {
                    const nextDigits = [...digits];
                    nextDigits[index] = '';
                    emitNextValue(nextDigits);
                    return;
                }

                if (index <= 0) return;

                const nextDigits = [...digits];
                nextDigits[index - 1] = '';
                emitNextValue(nextDigits);
                focusIndex(index - 1);
            },
            [digits, editable, emitNextValue, focusIndex],
        );

        return (
            <View style={[styles.row, containerStyle]}>
                {digits.map((digit, index) => {
                    const isFocused = focusedIndex === index;
                    const isFilled = digit !== '';
                    const visualValue = masked ? '' : digit;
                    const backgroundColor = hasError
                        ? c.errorGlass
                        : isFocused
                            ? c.primaryGlass
                            : isFilled
                                ? c.backgroundSecondary
                                : c.backgroundTertiary;
                    const borderColor = hasError
                        ? c.error
                        : isFocused || isFilled
                            ? c.primaryBorder
                            : 'transparent';
                    const inputTextColor = masked ? 'transparent' : c.textPrimary;

                    return (
                        <TouchableOpacity
                            key={`pin-cell-${index}`}
                            activeOpacity={0.9}
                            onPress={() => focusIndex(index)}
                            style={styles.cellTouch}
                        >
                            <View
                                style={[
                                    styles.cell,
                                    { backgroundColor, borderColor },
                                    cellStyle,
                                ]}
                            >
                                <TextInput
                                    ref={(r) => {
                                        inputRefs.current[index] = r;
                                    }}
                                    value={visualValue}
                                    onChangeText={(t) => handleChangeText(index, t)}
                                    onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                                    onFocus={() => setFocusedIndex(index)}
                                    onBlur={() => {
                                        setFocusedIndex((prev) => (prev === index ? null : prev));
                                    }}
                                    editable={editable}
                                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                                    textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : 'none'}
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                    importantForAutofill="no"
                                    showSoftInputOnFocus
                                    maxLength={1}
                                    secureTextEntry={false}
                                    selectTextOnFocus={false}
                                    caretHidden={masked}
                                    style={[
                                        styles.cellInput,
                                        {
                                            color: inputTextColor,
                                            opacity: masked ? 0 : 1,
                                        },
                                        inputStyle,
                                    ]}
                                    selectionColor={c.primary}
                                />
                                {masked && isFilled ? <View style={[styles.maskDot, { backgroundColor: c.textPrimary }]} /> : null}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    },
);

PinCodeInput.displayName = 'PinCodeInput';

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignSelf: 'center',
        gap: 8,
    },
    cellTouch: {
        borderRadius: 14,
    },
    cell: {
        width: 44,
        height: 52,
        borderRadius: 14,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cellInput: {
        width: '100%',
        height: '100%',
        textAlign: 'center',
        fontSize: 24,
        fontWeight: '700',
        paddingVertical: 0,
        paddingHorizontal: 0,
    },
    maskDot: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
    },
});

export default PinCodeInput;
