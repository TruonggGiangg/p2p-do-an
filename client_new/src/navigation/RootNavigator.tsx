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
import LoanContractListScreen from '../features/loan/screens/LoanContractListScreen';
import LoanContractDetailScreen from '../features/loan/screens/LoanContractDetailScreen';
import SigningSuccessScreen from '../features/loan/screens/SigningSuccessScreen';
import BNPLLoanListScreen from '../features/bnpl/screens/BNPLLoanListScreen';
import BNPLLoanDetailScreen from '../features/bnpl/screens/BNPLLoanDetailScreen';
import BNPLEarlyRepayScreen from '../features/bnpl/screens/BNPLEarlyRepayScreen';
import type { LoanProduct } from '../features/loan/services/loan.service';
import type { LoanProductConfig, LoanScheduleResult } from '../features/loan/services/loan.service';
import type { BnplLoan } from '../features/bnpl/api/bnpl.api';
import { KYCUpdate, FaceDetection, KYCIntro } from '../features/kyc';
import PinSetupScreen from '../features/auth/screens/PinSetupScreen';
import PinChangeScreen from '../features/auth/screens/PinChangeScreen';

export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    PinSetup: undefined;
    PinChange: undefined;
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
    LoanContractList: undefined;
    LoanContractDetail: { contractId?: string; loanId?: string };
    SigningSuccess: { contractId?: string; principalAmount?: number; tenure?: number };
    BNPLLoanList: { loans: BnplLoan[] };
    BNPLLoanDetail: { loan: BnplLoan };
    BNPLEarlyRepay: { loan: BnplLoan };
    KYCUpdate: undefined;
    KYCIntro: undefined;
    FaceDetection: {
        onVerify?: (result: { images: { uri: string }[] }) => Promise<any>;
        onComplete?: (result: any) => void;
        onSave?: () => void;
    };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const { isAuthenticated, user } = useAuth();

    // Sau khi đăng nhập, nếu chưa có PIN thì redirect sang PinSetup
    const needsPinSetup = isAuthenticated && user?.hasPin === false;

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="Auth" component={AuthNavigator} />
            ) : needsPinSetup ? (
                <Stack.Screen name="PinSetup" component={PinSetupScreen} />
            ) : (
                <>
                    <Stack.Screen name="Main" component={MainNavigator} />
                    <Stack.Screen name="PinChange" component={PinChangeScreen} />
                    <Stack.Screen name="Transfer" component={TransferScreen} />
                    <Stack.Screen name="Notifications" component={NotificationScreen} />
                    <Stack.Screen name="Wallets" component={WalletsScreen} />
                    <Stack.Screen name="LoanHistory" component={LoanHistoryScreen} />
                    <Stack.Screen name="LoanDetail" component={LoanDetailScreen} />
                    <Stack.Screen name="LoanProductDetail" component={LoanProductDetailScreen} />
                    <Stack.Screen name="LoanCreate" component={LoanCreateScreen} />
                    <Stack.Screen name="LoanConfirm" component={LoanConfirmScreen} />
                    <Stack.Screen name="LoanContractList" component={LoanContractListScreen} />
                    <Stack.Screen name="LoanContractDetail" component={LoanContractDetailScreen} />
                    <Stack.Screen name="SigningSuccess" component={SigningSuccessScreen} />
                    <Stack.Screen name="BNPLLoanList" component={BNPLLoanListScreen} />
                    <Stack.Screen name="BNPLLoanDetail" component={BNPLLoanDetailScreen} />
                    <Stack.Screen name="BNPLEarlyRepay" component={BNPLEarlyRepayScreen} />
                    <Stack.Screen name="KYCUpdate" component={KYCUpdate} />
                    <Stack.Screen name="KYCIntro" component={KYCIntro} />
                    <Stack.Screen name="FaceDetection" component={FaceDetection} />
                </>
            )}
        </Stack.Navigator>
    );
}

