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
import { PremiumTheme, DarkTheme, DarkColors } from './src/theme';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TokenTestScreen from './src/screens/TokenTestScreen';
import { LoanCreateScreen, LoanListScreen, LoanDetailScreen, RepaymentScreen, LoanListAllScreen, CreditAssessmentScreen } from './src/screens/loan';
import { InvestListScreen, InvestDetailScreen, MyInvestmentsScreen, WalletScreen } from './src/screens/invest';
import TransactionHistoryScreen from './src/screens/shared/TransactionHistoryScreen';
import { TransferScreen } from './src/screens/shared/TransferScreen';
import KYCScreen from './src/screens/kyc/KYCScreen';
import FaceDetectionScreen from './src/screens/kyc/FaceDetectionScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Dark theme header options
const darkHeaderOptions = {
  headerStyle: {
    backgroundColor: DarkColors.surface,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: DarkColors.border,
  },
  headerTintColor: DarkColors.text,
  headerTitleStyle: {
    fontFamily: 'Poppins_600SemiBold',
    color: DarkColors.text,
  },
};

// Loan Stack Navigator
function LoanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        ...darkHeaderOptions,
      }}
    >
      <Stack.Screen
        name="LoanList"
        component={LoanListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LoanListAll"
        component={LoanListAllScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LoanCreate"
        component={LoanCreateScreen}
        options={{ title: 'Tạo Khoản Vay' }}
      />
      <Stack.Screen
        name="LoanDetail"
        component={LoanDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Repayment"
        component={RepaymentScreen}
        options={{ title: 'Thanh Toán' }}
      />
      <Stack.Screen
        name="Transfer"
        component={TransferScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreditAssessment"
        component={CreditAssessmentScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Invest Stack Navigator
function InvestStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        ...darkHeaderOptions,
      }}
    >
      <Stack.Screen
        name="InvestList"
        component={InvestListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="InvestDetail"
        component={InvestDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MyInvestments"
        component={MyInvestmentsScreen}
        options={{ title: 'Portfolio của tôi' }}
      />
      <Stack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Wallet stack for lenders - includes transaction history
function WalletStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        ...darkHeaderOptions,
      }}
    >
      <Stack.Screen
        name="WalletMain"
        component={WalletScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Profile Stack Navigator
function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        ...darkHeaderOptions,
      }}
    >
      <Stack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="KYC"
        component={KYCScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FaceDetection"
        component={FaceDetectionScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Main tabs for authenticated users - Dark Theme
function MainTabs() {
  const { user } = useAuth();

  // Check user roles from Keycloak
  const isLender = user?.roles?.includes('lender') ||
    user?.roles?.includes('LENDER') ||
    user?.roles?.includes('Lender');

  const isBorrower = user?.roles?.includes('borrower') ||
    user?.roles?.includes('BORROWER') ||
    user?.roles?.includes('Borrower');

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'account';

          if (route.name === 'Profile') {
            iconName = focused ? 'account' : 'account-outline';
          } else if (route.name === 'Loans') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'Invest') {
            iconName = focused ? 'chart-line' : 'chart-line-variant';
          } else if (route.name === 'Wallet') {
            iconName = focused ? 'credit-card' : 'credit-card-outline';
          } else if (route.name === 'TokenTest') {
            iconName = focused ? 'cog' : 'cog-outline';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        // Dark theme tab bar styling
        tabBarActiveTintColor: DarkColors.primary,
        tabBarInactiveTintColor: DarkColors.textMuted,
        tabBarStyle: {
          backgroundColor: DarkColors.surface,
          borderTopWidth: 1,
          borderTopColor: DarkColors.border,
          paddingTop: 8,
          paddingBottom: 25,
          height: 85,
        },
        tabBarLabelStyle: {
          fontFamily: 'Poppins_500Medium',
          fontSize: 11,
          marginTop: 2,
        },
        headerShown: false,
      })}
    >
      {/* Borrower sees Loans tab */}
      {isBorrower && (
        <Tab.Screen
          name="Loans"
          component={LoanStack}
          options={{ title: 'Khoản Vay' }}
        />
      )}

      {isLender && (
        <Tab.Screen
          name="Invest"
          component={InvestStack}
          options={{ title: 'Đầu Tư' }}
        />
      )}

      {/* Wallet tab - available for both Borrower and Lender */}
      <Tab.Screen
        name="Wallet"
        component={WalletStack}
        options={{ title: 'Ví' }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Hồ Sơ' }}
      />
      <Tab.Screen
        name="TokenTest"

        component={TokenTestScreen}
        options={{ title: 'Cài Đặt' }}
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

import ErrorBoundary from './src/components/ErrorBoundary';

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
        <ActivityIndicator size="large" color={DarkColors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DarkColors.background,
  },
});
