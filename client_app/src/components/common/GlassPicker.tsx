import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Picker } from '@react-native-picker/picker'; // You might need to check if this is installed, but user script implies it is
import { DarkColors } from '../../theme';

interface GlassPickerProps {
    label?: string;
    selectedValue: any;
    onValueChange: (itemValue: any, itemIndex: number) => void;
    items: Array<{ label: string; value: any }>;
    containerStyle?: ViewStyle;
    pickerStyle?: ViewStyle;
}

export const GlassPicker: React.FC<GlassPickerProps> = ({
    label,
    selectedValue,
    onValueChange,
    items,
    containerStyle,
    pickerStyle
}) => {
    return (
        <View style={[styles.container, containerStyle]}>
            {label && <Text style={styles.label}>{label}</Text>}
            <View style={styles.pickerWrapper}>
                <Picker
                    selectedValue={selectedValue}
                    onValueChange={onValueChange}
                    style={[styles.picker, pickerStyle]}
                    dropdownIconColor={DarkColors.textSecondary}
                    mode="dropdown"
                >
                    {items.map((item) => (
                        <Picker.Item
                            key={item.value}
                            label={item.label}
                            value={item.value}
                            color={DarkColors.text} // White text for dark mode visibility
                            style={{ fontSize: 14 }}
                        />
                    ))}
                </Picker>
            </View>
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
    pickerWrapper: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 0,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    picker: {
        color: DarkColors.text,
        backgroundColor: 'transparent',
    },
});
