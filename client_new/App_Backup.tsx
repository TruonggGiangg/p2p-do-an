import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
// import LoginScreen from './src/screens/LoginScreen';
// import RegisterScreen from './src/screens/RegisterScreen';
// import HomeScreen from './src/screens/HomeScreen';
import { ActivityIndicator, View, StyleSheet, TouchableOpacity, Text } from 'react-native';
// import MainTabNavigator from './src/navigation/MainTabNavigator';

const LoginScreen = () => <View><Text>Login</Text></View>;
const RegisterScreen = () => <View><Text>Register</Text></View>;
const HomeScreen = () => <View><Text>Home</Text></View>;
const MainTabNavigator = () => <View><Text>Tabs</Text></View>;

const Stack = createNativeStackNavigator();

function MinimalScreen() {
  const { logout } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0e27' }}>
      <Text style={{ color: '#fff', fontSize: 24, marginBottom: 20 }}>🚀 System Ready (Minimal)</Text>
      <TouchableOpacity
        onPress={() => logout()}
        style={{ padding: 16, backgroundColor: '#dc2626', borderRadius: 10 }}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>🚪 Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

function Navigation() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007AFF',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {user ? (
          // Authenticated stack
          <Stack.Screen
            name="MainTabs"
            component={MinimalScreen}
            options={{ title: 'Root' }}
          />
        ) : (
          // Auth stack
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{
                title: 'Đăng ký',
                headerBackTitle: 'Quay lại'
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
