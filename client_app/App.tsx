import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold
} from '@expo-google-fonts/poppins';
import { PremiumTheme } from './src/theme';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TokenTestScreen from './src/screens/TokenTestScreen';
import { LoanCreateScreen, LoanListScreen, LoanDetailScreen, RepaymentScreen } from './src/screens/loan';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Loan Stack Navigator
function LoanStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="LoanList"
        component={LoanListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LoanCreate"
        component={LoanCreateScreen}
        options={{
          title: 'Tạo Khoản Vay',
          headerStyle: { backgroundColor: PremiumTheme.colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: 'Poppins_600SemiBold' },
        }}
      />
      <Stack.Screen
        name="LoanDetail"
        component={LoanDetailScreen}
        options={{
          title: 'Chi Tiết',
          headerStyle: { backgroundColor: PremiumTheme.colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: 'Poppins_600SemiBold' },
        }}
      />
      <Stack.Screen
        name="Repayment"
        component={RepaymentScreen}
        options={{
          title: 'Thanh Toán',
          headerStyle: { backgroundColor: PremiumTheme.colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: 'Poppins_600SemiBold' },
        }}
      />
    </Stack.Navigator>
  );
}

// Main tabs for authenticated users
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'account';

          if (route.name === 'Profile') {
            iconName = focused ? 'account' : 'account-outline';
          } else if (route.name === 'Loans') {
            iconName = focused ? 'cash' : 'cash-multiple';
          } else if (route.name === 'TokenTest') {
            iconName = focused ? 'key' : 'key-outline';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: PremiumTheme.colors.primary,
        tabBarInactiveTintColor: 'gray',
        tabBarLabelStyle: { fontFamily: 'Poppins_500Medium', marginBottom: 5 },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Loans"
        component={LoanStack}
        options={{ title: 'Khoản Vay' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Hồ Sơ' }}
      />
      <Tab.Screen
        name="TokenTest"
        component={TokenTestScreen}
        options={{ title: 'Test Token' }}
      />
    </Tab.Navigator>
  );
}

// Auth stack for non-authenticated users
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// Root navigator
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PremiumTheme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2979FF" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={PremiumTheme}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
  },
});
