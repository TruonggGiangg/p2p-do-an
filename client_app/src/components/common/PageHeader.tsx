import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { DarkColors, DarkStyling } from '../../theme';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    rightAction?: React.ReactNode;
    style?: ViewStyle;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    showBack = true,
    onBack,
    rightAction,
    style
}) => {
    const navigation = useNavigation();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigation.goBack();
        }
    };

    return (
        <View style={[styles.header, style]}>
            <View style={styles.leftContainer}>
                {showBack && (
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        activeOpacity={0.7}
                    >
                        <MaterialCommunityIcons name="arrow-left" size={24} color={DarkColors.text} />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.titleContainer}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>

            <View style={styles.rightContainer}>
                {rightAction}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        zIndex: 10,
    },
    leftContainer: {
        width: 48,
        alignItems: 'flex-start',
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    rightContainer: {
        width: 48,
        alignItems: 'flex-end',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: DarkColors.text,
        textAlign: 'center',
        fontFamily: 'Poppins_700Bold',
    },
    subtitle: {
        fontSize: 12,
        color: DarkColors.textSecondary,
        textAlign: 'center',
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
});
