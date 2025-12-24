/**
 * ScreenContainer - Unified Theme Version
 * Clean, reusable container with SafeAreaView and optional scroll
 */

import React from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ViewStyle,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { UnifiedColors, UnifiedGradients } from '../../theme';

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
    contentContainerStyle,
}) => {
    const ContentWrapper = scrollable ? ScrollView : View;

    // Props specific to ScrollView
    const scrollProps = scrollable
        ? {
            contentContainerStyle: [
                styles.scrollContent,
                { paddingTop },
                contentContainerStyle,
            ],
            showsVerticalScrollIndicator: false,
            refreshControl: onRefresh ? (
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={UnifiedColors.primary}
                    colors={[UnifiedColors.primary]}
                />
            ) : undefined,
            keyboardShouldPersistTaps: 'handled' as const,
        }
        : {
            style: [styles.fixedContent, { paddingTop }, contentContainerStyle],
        };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* Background Gradient - Unified Theme */}
            <LinearGradient
                colors={[...UnifiedGradients.background]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardView}
            >
                {/* Disable bottom edge to avoid gap above navigation */}
                <SafeAreaView style={[styles.safeArea, style]} edges={['top', 'left', 'right']}>
                    <ContentWrapper {...scrollProps}>{children}</ContentWrapper>
                </SafeAreaView>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: UnifiedColors.background,
    },
    keyboardView: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 0, // Controlled by individual screens
    },
    fixedContent: {
        flex: 1,
    },
});
