import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { DarkColors, DarkStyling } from '../../theme';

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'default';

interface GlowBadgeProps {
    label: string;
    status?: StatusType;
    icon?: string;
    style?: ViewStyle;
}

const getStatusColors = (status: StatusType): { color: string; bg: string } => {
    const colors = {
        success: { color: DarkColors.success, bg: `${DarkColors.success}20` },
        warning: { color: DarkColors.warning, bg: `${DarkColors.warning}20` },
        error: { color: DarkColors.error, bg: `${DarkColors.error}20` },
        info: { color: DarkColors.primary, bg: `${DarkColors.primary}20` },
        primary: { color: DarkColors.primary, bg: `${DarkColors.primary}20` },
        default: { color: DarkColors.textSecondary, bg: `${DarkColors.textSecondary}20` },
    };
    return colors[status] || colors.default;
};

export const GlowBadge: React.FC<GlowBadgeProps> = ({
    label,
    status = 'default',
    icon,
    style
}) => {
    const colors = getStatusColors(status);

    return (
        <View
            style={[
                styles.badge,
                { backgroundColor: colors.bg, borderColor: colors.color },
                style
            ]}
        >
            {icon && (
                <MaterialCommunityIcons
                    name={icon}
                    size={14}
                    color={colors.color}
                    style={styles.icon}
                />
            )}
            <Text style={[styles.label, { color: colors.color }]}>{label}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: DarkStyling.borderRadius.sm,
        borderWidth: 1,
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    icon: {
        marginRight: 4,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
});
