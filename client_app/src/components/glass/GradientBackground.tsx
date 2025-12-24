import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, StatusBar, ViewStyle, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

// MÀU SẮC MỚI: Sáng hơn, Rực rỡ hơn (Neon tones)
const GalaxyColors = {
    bgDeep: '#020b1a', // Đen xanh thẫm thay vì đen tuyền (tạo chiều sâu)

    // Cyan/Blue cực sáng (Electric Blue)
    nebulaPrimary: '#00C6FF',

    // Purple/Pink rực rỡ (Magenta)
    nebulaSecondary: '#9D50BB',

    // Điểm nhấn vàng/cam nhẹ (Stardust)
    nebulaAccent: '#F4D03F',

    transparent: 'transparent',
};

const { width, height } = Dimensions.get('window');
const CLOUD_SIZE = Math.max(width, height) * 1.5;

interface GradientBackgroundProps {
    children: React.ReactNode;
    useSafeArea?: boolean;
    style?: ViewStyle;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
    children,
    useSafeArea = true,
    style,
}) => {
    const Container = useSafeArea ? SafeAreaView : View;

    // 1. Animation "Thở" (Sáng/Tối)
    const breathAnim = useRef(new Animated.Value(0)).current;

    // 2. Animation "Xoay" (Rotation) - Tạo hiệu ứng trôi
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const rotateAnim2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Hiệu ứng Thở: Chạy liên tục
        Animated.loop(
            Animated.sequence([
                Animated.timing(breathAnim, {
                    toValue: 1,
                    duration: 6000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(breathAnim, {
                    toValue: 0,
                    duration: 6000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                })
            ])
        ).start();

        // Hiệu ứng Xoay 1: Xoay tròn rất chậm (30s 1 vòng)
        Animated.loop(
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: 30000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        // Hiệu ứng Xoay 2: Xoay ngược chiều và chậm hơn (40s 1 vòng)
        Animated.loop(
            Animated.timing(rotateAnim2, {
                toValue: 1,
                duration: 40000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();
    }, []);

    // Nội suy giá trị animation
    const opacityInterp = breathAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.5, 0.75] // Tăng độ sáng tối thiểu lên 0.5 (Sáng hơn cũ)
    });

    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const spinReverse = rotateAnim2.interpolate({
        inputRange: [0, 1],
        outputRange: ['360deg', '0deg']
    });

    const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

    return (
        <View style={styles.wrapper}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* --- LAYER 1: BASE (Deep Blue Black) --- */}
            <LinearGradient
                colors={[GalaxyColors.bgDeep, '#000000']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            {/* --- LAYER 2: PRIMARY NEBULA (Xoay xuôi chiều) --- */}
            <AnimatedGradient
                // Dùng màu đậm dần về trong suốt
                colors={[GalaxyColors.nebulaPrimary, 'rgba(0, 198, 255, 0.1)', GalaxyColors.transparent]}
                style={[
                    styles.nebulaCloud,
                    styles.cloudPrimary,
                    {
                        opacity: opacityInterp,
                        transform: [{ rotate: spin }, { scale: 1.2 }]
                    }
                ]}
                start={{ x: 0.2, y: 0.2 }} // Gradient chéo
                end={{ x: 0.8, y: 0.8 }}
            />

            {/* --- LAYER 3: SECONDARY NEBULA (Xoay ngược chiều) --- */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaSecondary, 'rgba(157, 80, 187, 0.1)', GalaxyColors.transparent]}
                style={[
                    styles.nebulaCloud,
                    styles.cloudSecondary,
                    {
                        // Opacity cố định thấp hơn một chút để làm nền
                        opacity: 0.6,
                        transform: [{ rotate: spinReverse }, { scale: 1.4 }]
                    }
                ]}
                start={{ x: 0.8, y: 0.2 }}
                end={{ x: 0.2, y: 0.8 }}
            />

            {/* --- LAYER 4: CORE GLOW (Điểm sáng trung tâm) --- */}
            {/* Giúp màn hình không bị tối ở giữa, tạo tiêu điểm */}
            <AnimatedGradient
                colors={[GalaxyColors.nebulaAccent, GalaxyColors.transparent]}
                style={[
                    styles.nebulaCloud,
                    styles.cloudCenter,
                    { opacity: 0.2 } // Chỉ sáng nhẹ
                ]}
            />

            {/* --- LAYER 5: VIGNETTE (Làm tối viền để tập trung nội dung) --- */}
            {/* Chỉnh lại: Nhạt hơn bản cũ để tổng thể sáng hơn */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
                locations={[0, 0.7, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            {/* --- CONTENT --- */}
            <Container style={[styles.container, style]} edges={['top', 'left', 'right']}>
                {children}
            </Container>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: GalaxyColors.bgDeep,
        overflow: 'hidden',
    },
    container: {
        flex: 1,
        zIndex: 20,
    },
    nebulaCloud: {
        position: 'absolute',
        width: CLOUD_SIZE,
        height: CLOUD_SIZE,
        borderRadius: CLOUD_SIZE / 2,
    },
    cloudPrimary: {
        top: -CLOUD_SIZE * 0.3,
        left: -CLOUD_SIZE * 0.3,
    },
    cloudSecondary: {
        bottom: -CLOUD_SIZE * 0.3,
        right: -CLOUD_SIZE * 0.3,
    },
    cloudCenter: {
        top: height / 2 - CLOUD_SIZE / 2,
        left: width / 2 - CLOUD_SIZE / 2,
        width: CLOUD_SIZE,
        height: CLOUD_SIZE,
    }
});