// BNPL feature exports
export { bnplAPI } from './api/bnpl.api';
export { default as BNPLScreen } from './screens/BNPLScreen';
export type {
    BnplWalletInfo,
    BnplLoan,
    RepaymentScheduleItem,
    ConsolidatedScheduleItem,
    LoanPreview,
    CreateBnplLoanDto,
    LoansResponse,
    ConsolidatedScheduleResponse,
} from './api/bnpl.api';
