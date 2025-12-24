import React from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ViewStyle,
    RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DarkColors } from '../../theme';

interface ScreenContainerProps {
    children: React.ReactNode;
    scrollable?: boolean;
    paddingTop?: number;
    refreshing?: boolean;
    onRefresh?: () => void;
    style?: ViewStyle;
    contentContainerStyle?: ViewStyle;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
    children,
    scrollable = true,
    paddingTop = 0,
    refreshing = false,
    onRefresh,
    style,
    contentContainerStyle
}) => {
    const ContentWrapper = scrollable ? ScrollView : View;

    // Props specific to ScrollView
    const scrollProps = scrollable ? {
        contentContainerStyle: [styles.scrollContent, { paddingTop }, contentContainerStyle],
        showsVerticalScrollIndicator: false,
        refreshControl: onRefresh ? (
            <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={DarkColors.primary}
                colors={[DarkColors.primary]}
            />
        ) : undefined,
        keyboardShouldPersistTaps: 'handled' as const
    } : {
        style: [styles.fixedContent, { paddingTop }, contentContainerStyle]
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* Background Gradient */}
            <LinearGradient
                colors={['#0a0e27', '#1a1230', '#0a0e27']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <SafeAreaView style={[styles.safeArea, style]}>
                    <ContentWrapper {...scrollProps}>
                        {children}
                    </ContentWrapper>
                </SafeAreaView>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 40,
    },
    fixedContent: {
        flex: 1,
    }
});
