import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { usePin } from '../contexts/PinContext';
import { PinVerifyModal } from '../components';
import HomeScreen from '../features/home/screens/HomeScreen';
import LoanScreen from '../features/loan/screens/LoanScreen';
import BNPLScreen from '../features/bnpl/screens/BNPLScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';

/** HOC: bọc screen yêu cầu PIN 1 lần/phiên */
function withPinGate<P extends object>(WrappedComponent: React.ComponentType<P>) {
    return function PinGatedScreen(props: P) {
        const { pinVerified, markPinVerified } = usePin();
        const navigation = useNavigation();
        const isFocused = useIsFocused();

        if (!pinVerified) {
            return (
                <PinVerifyModal
                    visible={isFocused}
                    dismissable={true}
                    onSuccess={markPinVerified}
                    onCancel={() => (navigation as any).navigate('Home')}
                    title="Xác thực mã PIN"
                    subtitle="Nhập mã PIN để truy cập tính năng này"
                />
            );
        }

        return <WrappedComponent {...props} />;
    };
}

const PinGatedLoanScreen = withPinGate(LoanScreen);
const PinGatedBNPLScreen = withPinGate(BNPLScreen);

export type MainTabParamList = {
    Home: undefined;
    Loan: undefined;
    BNPL: undefined;
    Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    const bottomTabHeight = Platform.OS === 'ios' ? 60 + insets.bottom : Math.max(70, 56 + insets.bottom);

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap = 'home';

                    if (route.name === 'Home') {
                        iconName = focused ? 'home' : 'home-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    } else if (route.name === 'Loan') {
                        iconName = focused ? 'wallet' : 'wallet-outline';
                    } else if (route.name === 'BNPL') {
                        iconName = focused ? 'card' : 'card-outline';
                    }

                    return (
                        <View style={styles.iconContainer}>
                            <Ionicons name={iconName} size={focused ? 24 : 22} color={color} />
                        </View>
                    );
                },
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.mode === 'dark' ? '#848E9C' : '#474D57', // Darker gray for light mode
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontFamily: 'Poppins_600SemiBold',
                    marginTop: -4,
                    marginBottom: Platform.OS === 'ios' ? 0 : 8,
                },
                tabBarStyle: {
                    backgroundColor: theme.colors.backgroundSecondary,
                    borderTopWidth: 0,
                    height: bottomTabHeight,
                    paddingBottom: Platform.OS === 'ios' ? insets.bottom : Math.max(12, insets.bottom),
                    paddingTop: 12,
                    elevation: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: theme.mode === 'dark' ? 0.3 : 0.1,
                    shadowRadius: 10,
                },
                headerShown: false,
            })}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{ tabBarLabel: 'Trang chủ' }}
            />
            <Tab.Screen
                name="Loan"
                component={PinGatedLoanScreen}
                options={{ tabBarLabel: 'Vay vốn' }}
            />
            <Tab.Screen
                name="BNPL"
                component={PinGatedBNPLScreen}
                options={{ tabBarLabel: 'Trả góp' }}
            />
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
});
