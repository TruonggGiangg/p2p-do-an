import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, DimensionValue, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface SkeletonLoaderProps {
    width?: DimensionValue;
    height?: DimensionValue;
    borderRadius?: number;
    style?: ViewStyle;
}

/**
 * Premium iOS-style Shimmer Skeleton Loader
 * - Smooth horizontal shimmer effect
 * - Subtle gradient animation
 * - Dark mode optimized
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
    width = '100%',
    height = 20,
    borderRadius = 8,
    style,
}) => {
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: 1500, // Slightly slower for elegance
                easing: Easing.bezier(0.4, 0, 0.2, 1),
                useNativeDriver: true,
            })
        ).start();
    }, [shimmerAnim]);

    // Translate shimmer across the skeleton
    // We assume width is 200 if not provided as number for shimmer range
    const range = typeof width === 'number' ? width : 300;
    const translateX = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-range, range],
    });

    return (
        <View
            style={[
                styles.container,
                { width, height, borderRadius },
                style,
            ]}
        >
            {/* Shimmer overlay */}
            <Animated.View
                style={[
                    styles.shimmerContainer,
                    {
                        width: '100%',
                        transform: [{ translateX }]
                    },
                ]}
            >
                <LinearGradient
                    colors={[
                        'transparent',
                        'rgba(255,255,255,0.03)',
                        'rgba(255,255,255,0.08)',
                        'rgba(255,255,255,0.03)',
                        'transparent',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.shimmerGradient}
                />
            </Animated.View>
        </View>
    );
};

// --- Wallet Card Skeleton ---
export const WalletCardSkeleton: React.FC = () => (
    <View style={styles.walletSkeleton}>
        <View style={styles.cardHeader}>
            <SkeletonLoader width={40} height={40} borderRadius={20} />
            <SkeletonLoader width={80} height={20} borderRadius={8} />
        </View>
        <View style={{ marginTop: 20 }}>
            <SkeletonLoader width={150} height={16} borderRadius={4} style={{ marginBottom: 10 }} />
            <SkeletonLoader width={220} height={42} borderRadius={8} />
        </View>
        <View style={[styles.cardHeader, { marginTop: 20 }]}>
            <SkeletonLoader width={120} height={20} borderRadius={6} />
            <SkeletonLoader width={44} height={44} borderRadius={8} />
        </View>
    </View>
);

// --- Loan Card Skeleton ---
export const LoanCardSkeleton: React.FC = () => (
    <View style={styles.cardSkeleton}>
        {/* Header: Status Badge + Date */}
        <View style={styles.cardHeader}>
            <SkeletonLoader width={80} height={20} borderRadius={10} />
            <SkeletonLoader width={50} height={14} borderRadius={6} />
        </View>

        {/* Main: Title + Amount */}
        <View style={styles.cardMain}>
            <SkeletonLoader width={120} height={14} borderRadius={6} style={{ marginBottom: 8 }} />
            <SkeletonLoader width={180} height={28} borderRadius={8} />
        </View>

        {/* Specs Grid */}
        <View style={styles.specsGrid}>
            <SkeletonLoader width={60} height={32} borderRadius={8} />
            <SkeletonLoader width={60} height={32} borderRadius={8} />
            <SkeletonLoader width={80} height={32} borderRadius={8} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSkeleton}>
            <SkeletonLoader width="100%" height={6} borderRadius={3} />
        </View>
    </View>
);

// --- List Skeleton Wrapper ---
export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
    <View style={{ gap: 12 }}>
        {Array.from({ length: count }).map((_, i) => (
            <LoanCardSkeleton key={i} />
        ))}
    </View>
);

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    shimmerContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    shimmerGradient: {
        flex: 1,
    },

    // --- Wallet Skeleton ---
    walletSkeleton: {
        height: 200,
        borderRadius: 24,
        padding: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'space-between',
        marginBottom: 20,
    },

    // --- Card Skeleton Styles ---
    cardSkeleton: {
        padding: 14,
        marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    cardMain: {
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    specsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        padding: 10,
        marginBottom: 12,
    },
    progressSkeleton: {
        paddingHorizontal: 4,
    },
});
