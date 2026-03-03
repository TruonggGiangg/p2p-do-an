import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';

const { width: screenWidth } = Dimensions.get('window');

interface Step {
    label: string;
    icon: string;
}

interface KYCStepIndicatorProps {
    steps: Step[];
    currentStep: number;
}

export const KYCStepIndicator: React.FC<KYCStepIndicatorProps> = ({ steps, currentStep }) => {
    const { theme, themeMode } = useTheme();
    const c = theme.colors;
    const isDark = themeMode === 'dark';

    return (
        <View style={styles.container}>
            <View style={styles.stepsRow}>
                {steps.map((step, index) => {
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;

                    return (
                        <React.Fragment key={index}>
                            <View style={styles.stepItem}>
                                <Animated.View
                                    entering={FadeIn.delay(index * 100)}
                                    style={[
                                        styles.iconCircle,
                                        {
                                            backgroundColor: isActive ? c.primary : isCompleted ? c.successGlass : c.surfaceLight,
                                            borderColor: isActive ? c.primary : isCompleted ? c.success : c.border,
                                            borderWidth: isActive || isCompleted ? 0 : 1.5,
                                        }
                                    ]}
                                >
                                    {isCompleted ? (
                                        <Ionicons name="checkmark-sharp" size={18} color={c.success} />
                                    ) : (
                                        <Ionicons
                                            name={step.icon as any}
                                            size={18}
                                            color={isActive ? '#000' : c.textMuted}
                                        />
                                    )}
                                </Animated.View>
                                <Text style={[
                                    styles.label,
                                    {
                                        color: isActive ? c.textPrimary : c.textMuted,
                                        fontWeight: isActive ? '700' : '500'
                                    }
                                ]}>
                                    {step.label}
                                </Text>
                                {isActive && (
                                    <Animated.View
                                        layout={FadeIn}
                                        style={[styles.activeDot, { backgroundColor: c.primary }]}
                                    />
                                )}
                            </View>

                            {index < steps.length - 1 && (
                                <View style={[styles.connector, { backgroundColor: c.border }]}>
                                    <View style={[
                                        styles.connectorFill,
                                        {
                                            backgroundColor: isCompleted ? c.success : c.border,
                                            width: isCompleted ? '100%' : '0%'
                                        }
                                    ]} />
                                </View>
                            )}
                        </React.Fragment>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingVertical: 16,
        paddingHorizontal: 12,
    },
    stepsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    stepItem: {
        alignItems: 'center',
        zIndex: 2,
    },
    iconCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    label: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    activeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 4,
    },
    connector: {
        flex: 1,
        height: 2,
        marginHorizontal: -15,
        marginBottom: 20,
        zIndex: 1,
    },
    connectorFill: {
        height: '100%',
    },
});
