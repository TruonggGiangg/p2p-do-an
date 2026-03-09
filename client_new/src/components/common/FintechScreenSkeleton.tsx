import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    interpolate,
    SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import VentoSVGLoading from './VentoSVGLoading';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SkeletonVariant = 'home' | 'bnpl' | 'loan' | 'profile';

interface FintechScreenSkeletonProps {
    variant: SkeletonVariant;
    style?: StyleProp<ViewStyle>;
}

interface SkeletonBoxProps {
    width?: any;
    height: number;
    radius?: number;
    baseColor: string;
    shimmerColor: string;
    progress: SharedValue<number>;
    style?: StyleProp<ViewStyle>;
    delay?: number;
}

const SkeletonBox: React.FC<SkeletonBoxProps> = ({
    width = '100%',
    height,
    radius = 12,
    baseColor,
    shimmerColor,
    progress,
    style,
}) => {
    const animatedStyle = useAnimatedStyle(() => {
        const translateX = interpolate(
            progress.value,
            [0, 1],
            [-SCREEN_WIDTH * 0.5, SCREEN_WIDTH]
        );
        return {
            transform: [{ translateX }, { skewX: '-15deg' }],
        };
    });

    return (
        <View
            style={[
                styles.skeletonBox,
                {
                    width: width as any,
                    height,
                    borderRadius: radius,
                    backgroundColor: baseColor,
                },
                style,
            ]}
        >
            <Animated.View
                style={[
                    styles.shimmer,
                    {
                        backgroundColor: shimmerColor,
                    },
                    animatedStyle,
                ]}
            />
        </View>
    );
};

const FintechScreenSkeleton: React.FC<FintechScreenSkeletonProps> = ({ variant, style }) => {
    const { theme } = useTheme();
    const shimmerProgress = useSharedValue(0);

    useEffect(() => {
        shimmerProgress.value = withRepeat(
            withTiming(1, { duration: 1500 }),
            -1,
            false
        );
    }, []);

    const isDark = theme.mode === 'dark';
    const baseColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const shimmerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)';

    const renderHome = () => (
        <>
            <SkeletonBox
                height={180}
                radius={24}
                baseColor={baseColor}
                shimmerColor={shimmerColor}
                progress={shimmerProgress}
            />
            <View style={styles.gridContainer}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
                    <View key={item} style={styles.gridItem}>
                        <SkeletonBox
                            width={52}
                            height={52}
                            radius={15}
                            baseColor={baseColor}
                            shimmerColor={shimmerColor}
                            progress={shimmerProgress}
                        />
                        <SkeletonBox
                            width={40}
                            height={10}
                            radius={4}
                            baseColor={baseColor}
                            shimmerColor={shimmerColor}
                            progress={shimmerProgress}
                            style={{ marginTop: 8 }}
                        />
                    </View>
                ))}
            </View>
            <SkeletonBox
                height={160}
                radius={20}
                baseColor={baseColor}
                shimmerColor={shimmerColor}
                progress={shimmerProgress}
                style={styles.sectionGap}
            />
        </>
    );

    const renderBnpl = () => (
        <>
            <SkeletonBox height={160} radius={18} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} />
            <SkeletonBox height={200} radius={18} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
            <SkeletonBox height={140} radius={18} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
        </>
    );

    const renderLoan = () => (
        <>
            <SkeletonBox width="50%" height={16} radius={8} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} />
            <SkeletonBox height={140} radius={16} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
            <SkeletonBox height={140} radius={16} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
        </>
    );

    const renderProfile = () => (
        <>
            <SkeletonBox height={140} radius={20} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} />
            <SkeletonBox height={60} radius={12} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
            <SkeletonBox height={60} radius={12} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
            <SkeletonBox height={60} radius={12} baseColor={baseColor} shimmerColor={shimmerColor} progress={shimmerProgress} style={styles.sectionGap} />
        </>
    );

    return (
        <View style={[styles.container, style]}>
            <View style={styles.loadingHeader}>
                <VentoSVGLoading
                    size={110}
                    showLabel={false}
                    duration={1500}
                    staggerScale={0.4}
                    strokeWidth={9}
                />
            </View>

            <View style={styles.skeletonStack}>
                {variant === 'home' && renderHome()}
                {variant === 'bnpl' && renderBnpl()}
                {variant === 'loan' && renderLoan()}
                {variant === 'profile' && renderProfile()}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 16,
    },
    loadingHeader: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 120,
        marginBottom: 8,
    },
    skeletonStack: {},
    skeletonBox: {
        overflow: 'hidden',
    },
    shimmer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: SCREEN_WIDTH * 0.5,
        opacity: 0.8,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: 16,
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 20,
    },
    gridItem: {
        width: '23%',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionGap: {
        marginTop: 16,
    },
});

export default FintechScreenSkeleton;
