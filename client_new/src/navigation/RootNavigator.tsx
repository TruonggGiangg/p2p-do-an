import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { TransferScreen, TransferConfirmScreen, WalletsScreen } from '../features/wallet';
import { NotificationScreen } from '../features/notifications';
import LoanProductDetailScreen from '../features/loan/screens/LoanProductDetailScreen';
import LoanCreateScreen from '../features/loan/screens/LoanCreateScreen';
import LoanConfirmScreen from '../features/loan/screens/LoanConfirmScreen';
import LoanApplySuccessScreen from '../features/loan/screens/LoanApplySuccessScreen';
import LoanHistoryScreen from '../features/loan/screens/LoanHistoryScreen';
import LoanDetailScreen from '../features/loan/screens/LoanDetailScreen';
import LoanContractListScreen from '../features/loan/screens/LoanContractListScreen';
import LoanContractDetailScreen from '../features/loan/screens/LoanContractDetailScreen';
import SigningSuccessScreen from '../features/loan/screens/SigningSuccessScreen';
import RepaymentSuccessScreen from '../features/loan/screens/RepaymentSuccessScreen';
import PrepaymentSuccessScreen from '../features/loan/screens/PrepaymentSuccessScreen';
import RepaymentConfirmScreen from '../features/loan/screens/RepaymentConfirmScreen';
import PrepaymentConfirmScreen from '../features/loan/screens/PrepaymentConfirmScreen';
import LoanBlockedScreen from '../features/loan/screens/LoanBlockedScreen';
import LoanRejectedScreen from '../features/loan/screens/LoanRejectedScreen';
import BNPLLoanListScreen from '../features/bnpl/screens/BNPLLoanListScreen';
import BNPLLoanDetailScreen from '../features/bnpl/screens/BNPLLoanDetailScreen';
import BNPLEarlyRepayScreen from '../features/bnpl/screens/BNPLEarlyRepayScreen';
import type { LoanProduct } from '../features/loan/services/loan.service';
import type { LoanProductConfig, LoanScheduleResult } from '../features/loan/services/loan.service';
import type { BnplLoan } from '../features/bnpl/api/bnpl.api';
import { KYCUpdate, FaceDetection, KYCIntro } from '../features/kyc';
import PinSetupScreen from '../features/auth/screens/PinSetupScreen';
import PinChangeScreen from '../features/auth/screens/PinChangeScreen';
import CreditScoreDetailScreen from '../features/profile/screens/CreditScoreDetailScreen';
import InvestmentOrderCreateScreen from '../features/invest/screens/InvestmentOrderCreateScreen';
import InvestmentOrderDetailScreen from '../features/invest/screens/InvestmentOrderDetailScreen';
import AvailableLoansScreen from '../features/invest/screens/AvailableLoansScreen';
import InvestmentContractListScreen from '../features/invest/screens/InvestmentContractListScreen';
import InvestmentContractDetailScreen from '../features/invest/screens/InvestmentContractDetailScreen';
import InvestmentStatsScreen from '../features/invest/screens/InvestmentStatsScreen';
import SchedulePreviewScreen from '../features/invest/screens/SchedulePreviewScreen';
import InvestmentFlowScreen from '../features/invest/screens/InvestmentFlowScreen';
import { HomeScreen } from '../features';

export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    Home: undefined;
    PinSetup: undefined;
    PinChange: { resetMode?: boolean } | undefined;
    CreditScoreDetail: undefined;
    Transfer: undefined;
    TransferConfirm: {
        sessionId: string;
        transactionData: {
            fromWalletName: string;
            fromWalletId: string;
            recipientAccountNo: string;
            amount: number;
            description?: string;
        };
    };
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
    LoanApplySuccess: {
        capital: number;
        periodMonth: number;
        entirelyPay: number;
    };
    LoanContractList: undefined;
    LoanContractDetail: { contractId?: string; loanId?: string };
    SigningSuccess: { contractId?: string; principalAmount?: number; tenure?: number };
    RepaymentConfirm: {
        loanId: string;
        loan: any;
        outstanding: any;
        nextPeriod: any;
        suggestedAmount: number;
    };
    PrepaymentConfirm: {
        loanId: string;
        loan: any;
        prepayAmount: any;
    };
    RepaymentSuccess: {
        amount: number;
        transactionId?: string | number;
        date: string;
        loanId?: string;
        periodNumber?: number;
        loanStatus?: string;
        capitalOriginal?: number;
        remainingBalance?: number;
    };
    PrepaymentSuccess: {
        totalAmount: number;
        transactionId?: string | number;
        date: string;
        capitalOriginal?: number;
        breakdown?: { principal: number; interest: number; fees?: number; penalty?: number };
        penaltyRate?: number;
        penaltyChargeName?: string;
    };
    BNPLLoanList: { loans: BnplLoan[] };
    BNPLLoanDetail: { loan: BnplLoan };
    BNPLEarlyRepay: { loan: BnplLoan };
    KYCUpdate: undefined;
    KYCIntro: undefined;
    MyQR: { wallet?: any };
    FaceDetection: {
        onVerify?: (result: { images: { uri: string }[] }) => Promise<any>;
        onComplete?: (result: any) => void;
        onSave?: () => void;
    };
    InvestmentOrderCreate: undefined;
    InvestmentOrderDetail: { orderId: string };
    AvailableLoans: undefined;
    InvestmentContractList: undefined;
    InvestmentContractDetail: { contractId: string; autoSign?: boolean };
    InvestmentStats: undefined;
    SchedulePreview: { loanApplicationId: string; numNotes: number; loanTitle?: string };
    InvestmentFlow: { loan: any };
    LoanBlocked: {
        debtGroup?: number;
        overdueDays?: number;
        overdueAmount?: number;
        fineractLoanId?: number;
        policy?: { blockNewLoan?: boolean; freezeAccount?: boolean; permanentBan?: boolean; applyPenalty?: boolean; legalEscalation?: boolean; collectionStage?: string };
        message?: string;
    };
    LoanRejected: {
        message?: string;
        evaluationScore?: number;
        grade?: string;
        subGrade?: string;
        riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
        modelDecision?: string;
        decisionExplanation?: string;
        riskFactors?: string[];
        positiveFactors?: string[];
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
            ) : (
                <>
                    {needsPinSetup && <Stack.Screen name="PinSetup" component={PinSetupScreen} />}
                    <Stack.Screen name="Main" component={MainNavigator} />
                    <Stack.Screen name="Home" component={HomeScreen} />
                    <Stack.Screen name="PinChange" component={PinChangeScreen} />
                    <Stack.Screen name="CreditScoreDetail" component={CreditScoreDetailScreen} />
                    <Stack.Screen name="Transfer" component={TransferScreen} />
                    <Stack.Screen name="TransferConfirm" component={TransferConfirmScreen} />
                    <Stack.Screen name="Notifications" component={NotificationScreen} />
                    <Stack.Screen name="Wallets" component={WalletsScreen} />
                    <Stack.Screen name="LoanHistory" component={LoanHistoryScreen} />
                    <Stack.Screen name="LoanDetail" component={LoanDetailScreen} />
                    <Stack.Screen name="LoanProductDetail" component={LoanProductDetailScreen} />
                    <Stack.Screen name="LoanCreate" component={LoanCreateScreen} />
                    <Stack.Screen name="LoanConfirm" component={LoanConfirmScreen} />
                    <Stack.Screen name="LoanApplySuccess" component={LoanApplySuccessScreen} />
                    <Stack.Screen name="LoanContractList" component={LoanContractListScreen} />
                    <Stack.Screen name="LoanContractDetail" component={LoanContractDetailScreen} />
                    <Stack.Screen name="SigningSuccess" component={SigningSuccessScreen} />
                    <Stack.Screen name="RepaymentConfirm" component={RepaymentConfirmScreen} />
                    <Stack.Screen name="LoanBlocked" component={LoanBlockedScreen} />
                    <Stack.Screen name="LoanRejected" component={LoanRejectedScreen} />
                    <Stack.Screen name="PrepaymentConfirm" component={PrepaymentConfirmScreen} />
                    <Stack.Screen name="RepaymentSuccess" component={RepaymentSuccessScreen} />
                    <Stack.Screen name="PrepaymentSuccess" component={PrepaymentSuccessScreen} />
                    <Stack.Screen name="BNPLLoanList" component={BNPLLoanListScreen} />
                    <Stack.Screen name="BNPLLoanDetail" component={BNPLLoanDetailScreen} />
                    <Stack.Screen name="BNPLEarlyRepay" component={BNPLEarlyRepayScreen} />
                    <Stack.Screen name="KYCUpdate" component={KYCUpdate} />
                    <Stack.Screen name="KYCIntro" component={KYCIntro} />
                    <Stack.Screen name="MyQR" component={require('../features/wallet/screens/MyQRScreen').default} />
                    <Stack.Screen name="FaceDetection" component={FaceDetection} />
                    <Stack.Screen name="InvestmentOrderCreate" component={InvestmentOrderCreateScreen} />
                    <Stack.Screen name="InvestmentOrderDetail" component={InvestmentOrderDetailScreen} />
                    <Stack.Screen name="AvailableLoans" component={AvailableLoansScreen} />
                    <Stack.Screen name="InvestmentContractList" component={InvestmentContractListScreen} />
                    <Stack.Screen name="InvestmentContractDetail" component={InvestmentContractDetailScreen} />
                    <Stack.Screen name="InvestmentStats" component={InvestmentStatsScreen} />
                    <Stack.Screen name="SchedulePreview" component={SchedulePreviewScreen} />
                    <Stack.Screen name="InvestmentFlow" component={InvestmentFlowScreen} />
                    {!needsPinSetup && <Stack.Screen name="PinSetup" component={PinSetupScreen} />}
                </>
            )}
        </Stack.Navigator>
    );
}

