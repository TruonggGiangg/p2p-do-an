import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DarkColors } from '../../theme';

interface InfoRowProps {
    label: string;
    value: string | number;
    icon?: string;
    isLast?: boolean;
    valueColor?: string;
    style?: ViewStyle;
}

export const InfoRow: React.FC<InfoRowProps> = ({
    label,
    value,
    icon,
    isLast = false,
    valueColor = DarkColors.text,
    style
}) => {
    return (
        <View style={[styles.container, !isLast && styles.borderBottom, style]}>
            <View style={styles.leftContent}>
                {icon && (
                    <View style={styles.iconContainer}>
                        <MaterialCommunityIcons name={icon as any} size={16} color={DarkColors.textSecondary} />
                    </View>
                )}
                <Text style={styles.label}>{label}</Text>
            </View>
            <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    borderBottom: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    leftContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        marginRight: 8,
        width: 24,
        alignItems: 'center',
    },
    label: {
        fontSize: 14,
        color: DarkColors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    value: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins_500Medium',
        maxWidth: '60%',
        textAlign: 'right',
    },
});
