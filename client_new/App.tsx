import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { usePushNotifications } from './src/shared/hooks/usePushNotifications';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { PinProvider } from './src/contexts/PinContext';
import { ThemeTransitionStyles } from './src/components/ThemeTransitionStyles';
import { ToastProvider, ConfirmModalProvider } from './src/components';
import RootNavigator from './src/navigation/RootNavigator';

function AppContent() {
  const { isLoading, user } = useAuth();
  const { theme } = useTheme();

  // Initialize push notifications
  usePushNotifications(user?._id);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <>
      <ReducedMotionConfig mode={ReduceMotion.Never} />
      <SafeAreaProvider>
        <ThemeTransitionStyles />
        <ThemeProvider>
          <AuthProvider>
            <PinProvider>
              <ToastProvider>
                <ConfirmModalProvider>
                  <AppContent />
                </ConfirmModalProvider>
              </ToastProvider>
            </PinProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
