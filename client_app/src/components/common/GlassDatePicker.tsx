import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ViewStyle
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DarkColors } from '../../theme';

interface GlassDatePickerProps {
    label?: string;
    value: Date | string;
    onPress?: () => void;
    onValueChange?: (date: Date) => void;
    containerStyle?: ViewStyle;
    placeholder?: string;
}

export const GlassDatePicker: React.FC<GlassDatePickerProps> = ({
    label,
    value,
    onPress,
    onValueChange,
    containerStyle,
    placeholder = 'Chọn ngày'
}) => {
    // Format date if it's a Date object
    const displayValue = value instanceof Date
        ? value.toLocaleDateString('vi-VN')
        : value || placeholder;

    return (
        <View style={[styles.container, containerStyle]}>
            {label && <Text style={styles.label}>{label}</Text>}
            <TouchableOpacity
                style={styles.button}
                onPress={onPress}
                activeOpacity={0.7}
            >
                <MaterialCommunityIcons
                    name="calendar-month-outline"
                    size={20}
                    color={DarkColors.textSecondary}
                    style={styles.icon}
                />
                <Text style={styles.valueText}>{displayValue}</Text>
                <MaterialCommunityIcons
                    name="chevron-down"
                    size={20}
                    color={DarkColors.textSecondary}
                />
            </TouchableOpacity>
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
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 0,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
        height: 52,
    },
    icon: {
        marginRight: 10,
    },
    valueText: {
        flex: 1,
        color: DarkColors.text,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
    },
});
