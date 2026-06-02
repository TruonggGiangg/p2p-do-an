import React from 'react';
import {
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
    View,
    TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface CommonButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    icon?: string;
    style?: ViewStyle;
    textStyle?: TextStyle;
    fullWidth?: boolean;
}

export const CommonButton: React.FC<CommonButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon,
    style,
    textStyle,
    fullWidth = true,
}) => {
    const { theme } = useTheme();

    const getVariantStyles = () => {
        switch (variant) {
            case 'primary':
                return {
                    container: { backgroundColor: theme.colors.primary },
                    text: { color: '#fff', fontWeight: '700' as const },
                };
            case 'secondary':
                return {
                    container: { backgroundColor: theme.colors.surfaceLight },
                    text: { color: theme.colors.textPrimary },
                };
            case 'outline':
                return {
                    container: {
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                    },
                    text: { color: theme.colors.textPrimary },
                };
            case 'ghost':
                return {
                    container: { backgroundColor: 'transparent' },
                    text: { color: theme.colors.textSecondary },
                };
            case 'danger':
                return {
                    container: { backgroundColor: theme.colors.errorGlass },
                    text: { color: theme.colors.error, fontWeight: 'bold' as const },
                };
            case 'success':
                return {
                    container: { backgroundColor: theme.colors.successGlass },
                    text: { color: theme.colors.success, fontWeight: 'bold' as const },
                };
            default:
                return {
                    container: { backgroundColor: theme.colors.primary },
                    text: { color: '#fff' },
                };
        }
    };

    const getSizeStyles = () => {
        switch (size) {
            case 'sm':
                return { paddingVertical: 6, paddingHorizontal: 12, height: 32 };
            case 'md':
                return { paddingVertical: 10, paddingHorizontal: 20, height: 48 };
            case 'lg':
                return { paddingVertical: 14, paddingHorizontal: 28, height: 56 };
            default:
                return { paddingVertical: 10, paddingHorizontal: 20, height: 48 };
        }
    };

    const vStyles = getVariantStyles();
    const sStyles = getSizeStyles();

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.7}
            style={[
                styles.container,
                sStyles,
                vStyles.container,
                fullWidth && styles.fullWidth,
                disabled && { opacity: 0.5 },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={vStyles.text.color} size="small" />
            ) : (
                <View style={styles.content}>
                    {icon && (
                        <MaterialCommunityIcons
                            name={icon as any}
                            size={size === 'sm' ? 16 : 20}
                            color={vStyles.text.color}
                            style={styles.icon}
                        />
                    )}
                    <Text
                        style={[
                            styles.text,
                            { fontSize: size === 'sm' ? 12 : 14 },
                            vStyles.text,
                            textStyle,
                        ]}
                    >
                        {title}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullWidth: {
        width: '100%',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        marginRight: 8,
    },
    text: {
        fontFamily: 'Poppins_600SemiBold',
    },
});
