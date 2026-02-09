import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import HomeScreen from '../features/home/screens/HomeScreen';
import BNPLScreen from '../features/bnpl/screens/BNPLScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';

export type MainTabParamList = {
    Home: undefined;
    BNPL: undefined;
    Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
    const { theme } = useTheme();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap = 'home';

                    if (route.name === 'Home') {
                        iconName = focused ? 'home' : 'home-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    } else if (route.name === 'BNPL') {
                        iconName = focused ? 'card' : 'card-outline';
                    }

                    return <Ionicons name={iconName} size={22} color={color} />;
                },
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.textSecondary,
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontFamily: 'Poppins_500Medium',
                    marginBottom: 4,
                },
                tabBarStyle: {
                    backgroundColor: theme.colors.backgroundSecondary,
                    borderTopColor: 'rgba(255,255,255,0.05)',
                    height: Platform.OS === 'ios' ? 88 : 64,
                    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
                    paddingTop: 10,
                },
                headerShown: false,
            })}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{ tabBarLabel: 'Home' }}
            />
            <Tab.Screen
                name="BNPL"
                component={BNPLScreen}
                options={{ tabBarLabel: 'BNPL' }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ tabBarLabel: 'Profile' }}
            />
        </Tab.Navigator>
    );
}
