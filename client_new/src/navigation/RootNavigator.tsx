import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { TransferScreen, WalletsScreen } from '../features/wallet';
import { NotificationScreen } from '../features/notifications';
import LoanProductDetailScreen from '../features/loan/screens/LoanProductDetailScreen';
import LoanCreateScreen from '../features/loan/screens/LoanCreateScreen';
import LoanConfirmScreen from '../features/loan/screens/LoanConfirmScreen';
import LoanHistoryScreen from '../features/loan/screens/LoanHistoryScreen';
import LoanDetailScreen from '../features/loan/screens/LoanDetailScreen';
import type { LoanProduct } from '../features/loan/services/loan.service';
import type { LoanProductConfig, LoanScheduleResult } from '../features/loan/services/loan.service';

export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    Transfer: undefined;
    Notifications: undefined;
    Wallets: undefined;
    LoanHistory: undefined;
    LoanDetail: { loan: any; autoOpenRepay?: boolean };
    LoanProductDetail: { product: LoanProduct };
    LoanCreate: { product: LoanProduct; willing?: string };
    LoanConfirm: {
        product: LoanProduct;
        config: LoanProductConfig;
        capital: number;
        periodMonth: number;
        willing?: string;
        monthlyRatePercent?: number;
        schedule: LoanScheduleResult;
    };
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
                    <Stack.Screen name="LoanHistory" component={LoanHistoryScreen} />
                    <Stack.Screen name="LoanDetail" component={LoanDetailScreen} />
                    <Stack.Screen name="LoanProductDetail" component={LoanProductDetailScreen} />
                    <Stack.Screen name="LoanCreate" component={LoanCreateScreen} />
                    <Stack.Screen name="LoanConfirm" component={LoanConfirmScreen} />
                </>
            )}
        </Stack.Navigator>
    );
}

