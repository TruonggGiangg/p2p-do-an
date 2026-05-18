import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, Dimensions, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { usePin } from '../contexts/PinContext';
import { useAuth } from '../contexts/AuthContext';
import { PinVerifyModal } from '../components';
import HomeScreen from '../features/home/screens/HomeScreen';
import LoanScreen from '../features/loan/screens/LoanScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';
import InvestmentOrderListScreen from '../features/invest/screens/InvestmentOrderListScreen';
import AvailableLoansScreen from '../features/invest/screens/AvailableLoansScreen';
import LockedFeatureOverlay from '../shared/components/LockedFeatureOverlay';

/** HOC: bọc screen yêu cầu PIN 1 lần/phiên */
function withPinGate<P extends object>(WrappedComponent: React.ComponentType<P>) {
    return function PinGatedScreen(props: P) {
        const { pinVerified, markPinVerified } = usePin();
        const { user } = useAuth();
        const navigation = useNavigation();
        const isFocused = useIsFocused();

        useEffect(() => {
            if (isFocused && user?.hasPin === false) {
                (navigation as any).getParent()?.navigate('PinSetup');
            }
        }, [isFocused, navigation, user?.hasPin]);

        if (user?.hasPin === false) {
            return <View style={{ flex: 1 }} />;
        }

        if (!pinVerified) {
            return (
                <PinVerifyModal
                    visible={isFocused}
                    dismissable={true}
                    onSuccess={markPinVerified}
                    onCancel={() => (navigation as any).navigate('Home')}
                    onForgotPin={() => (navigation as any).getParent()?.navigate('PinChange', { resetMode: true })}
                    title="Xác thực mã PIN"
                    subtitle="Nhập mã PIN để truy cập tính năng này"
                />
            );
        }

        return <WrappedComponent {...props} />;
    };
}

/** HOC: chặn truy cập nếu chưa VERIFIED KYC */
function withKycGate<P extends object>(WrappedComponent: React.ComponentType<P>) {
    return function KycGatedScreen(props: P) {
        const { user } = useAuth();

        if (user?.kycStatus !== 'VERIFIED') {
            return (
                <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    <LockedFeatureOverlay
                        kycStatus={user?.kycStatus}
                        rejectReason={user?.kycRejectReason}
                    />
                </View>
            );
        }

        return <WrappedComponent {...props} />;
    };
}

const PinGatedLoanScreen = withKycGate(withPinGate(LoanScreen));

const PinGatedOrderScreen = withKycGate(withPinGate(InvestmentOrderListScreen));
const PinGatedInvestScreen = withKycGate(withPinGate(AvailableLoansScreen));

export type MainTabParamList = {
    Home: undefined;
    Loan: undefined;
    Order: undefined;
    Invest: undefined;
    Profile: undefined;
};

// ─────────────────────────────────────────────
// Animated Tab Button — Sovereign Monolith style
// ─────────────────────────────────────────────
const TabButton = (props: any) => {
    const { children, onPress, onLongPress, style, ...rest } = props;
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: withSpring(scale.value, { damping: 12, stiffness: 150 }) }]
    }));

    return (
        <Animated.View style={[{ flex: 1 }, animatedStyle]}>
            <TouchableOpacity
                {...rest}
                onPress={(e) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress?.(e);
                }}
                onLongPress={onLongPress}
                onPressIn={() => { scale.value = 0.9; }}
                onPressOut={() => { scale.value = 1; }}
                activeOpacity={1}
                style={[style, { flex: 1 }]}
            >
                {children}
            </TouchableOpacity>
        </Animated.View>
    );
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
    const { theme } = useTheme();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    // Phân quyền: chỉ lender mới thấy tab Đầu tư
    // Ưu tiên userType top-level (server mới) → fallback metadata.userType (user cũ) → roles
    const isLender =
        user?.userType === 'lender' ||
        user?.metadata?.userType === 'lender' ||
        (user?.roles || []).some(r => r.toLowerCase() === 'lender');

    const bottomTabHeight = 70;

    return (
        <Tab.Navigator
            tabBar={(props) => (
                <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <BottomTabBar {...props} />
                </View>
            )}
            screenOptions={({ route }) => ({
                tabBarButton: (props) => <TabButton {...props} />,
                tabBarBackground: () => (
                    <View style={{ flex: 1, overflow: 'hidden', borderRadius: 35 }}>
                        <BlurView
                            intensity={Platform.OS === 'ios' ? 85 : 100}
                            tint={theme.mode === 'dark' ? 'dark' : 'light'}
                            style={StyleSheet.absoluteFill}
                        />
                    </View>
                ),
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap = 'home';

                    if (route.name === 'Home') {
                        iconName = focused ? 'home' : 'home-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    } else if (route.name === 'Loan') {
                        iconName = focused ? 'wallet' : 'wallet-outline';
                    } else if (route.name === 'Invest') {
                        iconName = focused ? 'trending-up' : 'trending-up-outline';
                    } else if (route.name === 'Order') {
                        iconName = focused ? 'list' : 'list-outline';
                    }

                    return (
                        <View style={styles.iconContainer}>
                            <Ionicons name={iconName} size={focused ? 25 : 23} color={color} />
                        </View>
                    );
                },
                tabBarActiveTintColor: theme.mode === 'dark' ? '#8ECFB9' : '#14342B',
                tabBarInactiveTintColor: theme.mode === 'dark' ? '#848E9C' : '#474D57',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '500',
                    marginBottom: 10,
                },
                tabBarStyle: {
                    backgroundColor: Platform.OS === 'ios' ? 'transparent' : (theme.mode === 'dark' ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)'),
                    height: bottomTabHeight,
                    paddingBottom: 10,
                    paddingTop: 10,
                    borderRadius: 35,

                    // Premium Sophisticated 3D Visuals
                    borderWidth: 1,
                    borderColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                    borderTopWidth: 1,
                    borderTopColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.85)', // Highlight cực mảnh
                    borderBottomWidth: 3,
                    borderBottomColor: theme.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.06)', // Cạnh đáy tinh tế

                    // Diffused Premium Shadow
                    elevation: 15,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: theme.mode === 'dark' ? 0.6 : 0.15, // Bóng tỏa mịn màng
                    shadowRadius: 15,

                    // Elegant Lift
                    transform: [{ translateY: -5 }],
                },
                headerShown: false,
            })}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{ tabBarLabel: 'Trang chủ' }}
            />
            {!isLender && (
                <Tab.Screen
                    name="Loan"
                    component={PinGatedLoanScreen}
                    options={{ tabBarLabel: 'Vay vốn' }}
                />
            )}

            {isLender && (
                <Tab.Screen
                    name="Order"
                    component={PinGatedOrderScreen}
                    options={{ tabBarLabel: 'Đặt lệnh' }}
                />
            )}
            {isLender && (
                <Tab.Screen
                    name="Invest"
                    component={PinGatedInvestScreen}
                    options={{ tabBarLabel: 'Đầu tư' }}
                />
            )}
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ tabBarLabel: 'Tài khoản' }}
            />
        </Tab.Navigator>
    );
}
const styles = StyleSheet.create({
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabBarWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: 'transparent',
    },
});
