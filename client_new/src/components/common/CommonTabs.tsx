import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface Tab {
    key: string;
    title: string;
}

interface CommonTabsProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (key: string) => void;
    variant?: 'segmented' | 'underline';
}

export const CommonTabs: React.FC<CommonTabsProps> = ({
    tabs,
    activeTab,
    onTabChange,
    variant = 'segmented',
}) => {
    const { theme } = useTheme();

    if (variant === 'underline') {
        return (
            <View style={styles.underlineContainer}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            onPress={() => onTabChange(tab.key)}
                            style={[
                                styles.underlineTab,
                                isActive && { borderBottomColor: theme.colors.primary },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.tabText,
                                    {
                                        color: isActive
                                            ? theme.colors.primary
                                            : theme.colors.textSecondary,
                                        fontFamily: isActive
                                            ? 'Poppins_700Bold'
                                            : 'Poppins_600SemiBold',
                                    },
                                ]}
                            >
                                {tab.title}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    }

    return (
        <View
            style={[
                styles.segmentedContainer,
                { backgroundColor: theme.colors.backgroundTertiary },
            ]}
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        onPress={() => onTabChange(tab.key)}
                        style={[
                            styles.segmentedTab,
                            isActive && {
                                backgroundColor: theme.colors.surfaceLight,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.1,
                                shadowRadius: 4,
                                elevation: 2,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.tabText,
                                {
                                    color: isActive
                                        ? theme.colors.primary
                                        : theme.colors.textSecondary,
                                    fontSize: 13,
                                },
                            ]}
                        >
                            {tab.title}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    underlineContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    underlineTab: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    segmentedContainer: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 8,
        marginHorizontal: 16,
        marginBottom: 16,
    },
    segmentedTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    tabText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
});
