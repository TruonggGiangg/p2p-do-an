import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { TransferScreen, WalletsScreen } from '../features/wallet';
import { NotificationScreen } from '../features/notifications';
import LoanProductDetailScreen from '../features/loan/screens/LoanProductDetailScreen';
import type { LoanProduct } from '../features/loan/services/loan.service';

export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    Transfer: undefined;
    Notifications: undefined;
    Wallets: undefined;
    LoanProductDetail: { product: LoanProduct };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const { isAuthenticated } = useAuth();

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="Auth" component={AuthNavigator} />
            ) : (
                <>
                    <Stack.Screen name="Main" component={MainNavigator} />
                    <Stack.Screen name="Transfer" component={TransferScreen} />
                    <Stack.Screen name="Notifications" component={NotificationScreen} />
                    <Stack.Screen name="Wallets" component={WalletsScreen} />
                    <Stack.Screen name="LoanProductDetail" component={LoanProductDetailScreen} />
                </>
            )}
        </Stack.Navigator>
    );
}

