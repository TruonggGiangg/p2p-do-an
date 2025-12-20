/**
 * Loan API Service - API calls for loan module
 */

import { httpClient } from '../http/httpClient';
import {
    CheckRateRequest,
    CreateLoanRequest,
    RateCheckResponse,
    CreateLoanResponse,
    LoanContract,
    LoanStatistics,
    LoanPurpose,
    FineractLoanDetails,
    RepaymentSchedule,
    LoanTransaction,
    OutstandingBalance,
    PrepayAmount,
    MakeRepaymentRequest,
    PrepayLoanRequest,
    RepaymentResponse,
} from '../../types';

/**
 * API Response wrapper (compatible with api.types.ts)
 */
interface LoanApiResponse<T> {
    statusCode?: number;
    message?: string;
    data?: T;
}

/**
 * Loan API endpoints
 */
const ENDPOINTS = {
    checkRate: '/loan/rate',
    createLoan: '/loan/create-auto',
    myLoans: '/loan/me',
    loanDetail: (id: string) => `/loan/${id}`,
    loanStatistics: (id: string) => `/loan/${id}/statistics`,
    waitingLoans: '/loan/current/waiting',
    // New Fineract endpoints
    purposes: '/loan/purposes',
    fineractDetails: (id: string) => `/loan/${id}/fineract-details`,
    repaymentSchedule: (id: string) => `/loan/${id}/repayment-schedule`,
    transactions: (id: string) => `/loan/${id}/transactions`,
    outstanding: (id: string) => `/loan/${id}/outstanding`,
    prepayAmount: (id: string) => `/loan/${id}/prepay-amount`,
    repay: '/loan/repay',
    prepay: '/loan/prepay',
    blockchainStatus: '/loan/blockchain/status',
    // Debug
    debugFineractUser: '/loan/debug/fineract-user',
};

/**
 * Loan API Service
 */
export const loanApi = {
    /**
     * Check blockchain connection status
     */
    checkBlockchainStatus: async (): Promise<{ enabled: boolean; connected: boolean }> => {
        const response = await httpClient.get<LoanApiResponse<{ enabled: boolean; connected: boolean }>>(
            ENDPOINTS.blockchainStatus,
        );
        return response.data.data ?? { enabled: false, connected: false };
    },

    /**
     * Check/preview loan rate (public - no auth required)
     */
    checkRate: async (data: CheckRateRequest): Promise<RateCheckResponse> => {
        const response = await httpClient.post<LoanApiResponse<RateCheckResponse>>(
            ENDPOINTS.checkRate,
            data,
        );
        if (!response.data.data) {
            throw new Error('Invalid response from server');
        }
        return response.data.data;
    },

    /**
     * Create new loan (Borrower only)
     */
    createLoan: async (data: CreateLoanRequest): Promise<CreateLoanResponse> => {
        const response = await httpClient.post<LoanApiResponse<CreateLoanResponse>>(
            ENDPOINTS.createLoan,
            data,
        );
        if (!response.data.data) {
            throw new Error('Invalid response from server');
        }
        return response.data.data;
    },

    /**
     * Get current user's loans (Borrower only)
     */
    getMyLoans: async (): Promise<LoanContract[]> => {
        const response = await httpClient.get<LoanApiResponse<LoanContract[]>>(
            ENDPOINTS.myLoans,
        );
        return response.data.data ?? [];
    },

    /**
     * Get loan detail by ID
     */
    getLoanDetail: async (loanId: string): Promise<LoanContract> => {
        const response = await httpClient.get<LoanApiResponse<LoanContract>>(
            ENDPOINTS.loanDetail(loanId),
        );
        if (!response.data.data) {
            throw new Error('Loan not found');
        }
        return response.data.data;
    },

    /**
     * Get loan statistics
     */
    getLoanStatistics: async (loanId: string): Promise<LoanStatistics> => {
        const response = await httpClient.get<LoanApiResponse<LoanStatistics>>(
            ENDPOINTS.loanStatistics(loanId),
        );
        if (!response.data.data) {
            throw new Error('Statistics not found');
        }
        return response.data.data;
    },

    /**
     * Get waiting loans for investment (Lender only)
     */
    getWaitingLoans: async (): Promise<LoanContract[]> => {
        const response = await httpClient.get<LoanApiResponse<LoanContract[]>>(
            ENDPOINTS.waitingLoans,
        );
        return response.data.data ?? [];
    },

    // ==================== FINERACT DETAIL METHODS ====================

    /**
     * Get loan purposes from Fineract
     */
    getLoanPurposes: async (): Promise<LoanPurpose[]> => {
        const response = await httpClient.get<LoanApiResponse<{ purposes: LoanPurpose[] }>>(
            ENDPOINTS.purposes,
        );
        return response.data.data?.purposes ?? [];
    },

    /**
     * Get full loan details from Fineract (including schedule and transactions)
     */
    getFineractDetails: async (loanId: string): Promise<FineractLoanDetails> => {
        const response = await httpClient.get<LoanApiResponse<FineractLoanDetails>>(
            ENDPOINTS.fineractDetails(loanId),
        );
        if (!response.data.data) {
            throw new Error('Fineract details not found');
        }
        return response.data.data;
    },

    /**
     * Get repayment schedule for a loan
     */
    getRepaymentSchedule: async (loanId: string): Promise<RepaymentSchedule> => {
        const response = await httpClient.get<LoanApiResponse<RepaymentSchedule>>(
            ENDPOINTS.repaymentSchedule(loanId),
        );
        if (!response.data.data) {
            throw new Error('Repayment schedule not found');
        }
        return response.data.data;
    },

    /**
     * Get transaction history for a loan
     */
    getTransactions: async (loanId: string): Promise<LoanTransaction[]> => {
        const response = await httpClient.get<LoanApiResponse<LoanTransaction[]>>(
            ENDPOINTS.transactions(loanId),
        );
        return response.data.data ?? [];
    },

    /**
     * Get outstanding balance for a loan
     */
    getOutstandingBalance: async (loanId: string): Promise<OutstandingBalance> => {
        const response = await httpClient.get<LoanApiResponse<OutstandingBalance>>(
            ENDPOINTS.outstanding(loanId),
        );
        if (!response.data.data) {
            throw new Error('Outstanding balance not found');
        }
        return response.data.data;
    },

    /**
     * Get prepayment amount for early loan closure
     */
    getPrepayAmount: async (loanId: string): Promise<PrepayAmount> => {
        const response = await httpClient.get<LoanApiResponse<PrepayAmount>>(
            ENDPOINTS.prepayAmount(loanId),
        );
        if (!response.data.data) {
            throw new Error('Prepay amount not found');
        }
        return response.data.data;
    },

    // ==================== REPAYMENT METHODS ====================

    /**
     * Make a repayment on a loan
     */
    makeRepayment: async (data: MakeRepaymentRequest): Promise<RepaymentResponse> => {
        const response = await httpClient.post<LoanApiResponse<RepaymentResponse>>(
            ENDPOINTS.repay,
            data,
        );
        if (!response.data.data) {
            throw new Error('Repayment failed');
        }
        return response.data.data;
    },

    /**
     * Early repayment / prepay loan
     */
    prepayLoan: async (data: PrepayLoanRequest): Promise<RepaymentResponse> => {
        const response = await httpClient.post<LoanApiResponse<RepaymentResponse>>(
            ENDPOINTS.prepay,
            data,
        );
        if (!response.data.data) {
            throw new Error('Prepay failed');
        }
        return response.data.data;
    },

    /**
     * [DEBUG] Test Fineract user lookup
     */
    testFineractUser: async (): Promise<any> => {
        const response = await httpClient.get<any>(ENDPOINTS.debugFineractUser);
        return response.data;
    },
};

export default loanApi;

