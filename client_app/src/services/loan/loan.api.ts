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
    preAssess: '/loan/pre-assess',  // Pre-loan credit assessment
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
    repay: '/repayment/repay',      // ✅ Fixed: Use RepaymentController
    prepay: '/repayment/prepay',    // ✅ Fixed: Use RepaymentController with lender distribution
    blockchainStatus: '/loan/blockchain/status',
    disburse: (id: string) => `/loan/${id}/disburse`,
    // Scorecard endpoints
    scorecardHistory: (id: string) => `/loan/${id}/scorecard`,
    assessCredit: (id: string) => `/loan/${id}/assess`,
    // Wallet endpoints
    walletBalance: '/loan/wallet/balance',
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
     * Get wallet balance from Fineract savings account
     */
    getWalletBalance: async (): Promise<{
        balance: number;
        availableBalance: number;
        accountId?: number;
        accountNo?: string;
    }> => {
        try {
            const response = await httpClient.get<LoanApiResponse<{
                balance: number;
                availableBalance: number;
                accountId?: number;
                accountNo?: string;
            }>>(ENDPOINTS.walletBalance);
            return response.data.data ?? { balance: 0, availableBalance: 0 };
        } catch (error) {
            console.warn('[loanApi.getWalletBalance] Failed:', error);
            return { balance: 0, availableBalance: 0 };
        }
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
        console.log('[LoanAPI] createLoan Payload:', JSON.stringify(data));
        const response = await httpClient.post<LoanApiResponse<CreateLoanResponse>>(
            ENDPOINTS.createLoan,
            data,
        );
        console.log('[LoanAPI] createLoan Status:', response.status);
        if (!response.data.data) {
            throw new Error('Invalid response from server');
        }
        return response.data.data;
    },

    /**
     * Pre-assess credit score before loan creation
     * HIGH_RISK → canProceed: false, MEDIUM/LOW → canProceed: true
     */
    preAssess: async (data: {
        capital: number;
        periodMonth: number;
        willing?: string;
        footprint: {
            battery_level: number;
            submission_hour: number;
            connection_type: 'wifi' | '4g' | 'unknown';
            location_match: 'true' | 'false';
            device_score?: number;
        };
    }): Promise<{
        score: number;
        grade: string;
        riskLevel: 'low' | 'medium' | 'high' | 'very_high';
        canProceed: boolean;
        isApproved: boolean;
        rejectionMessage?: string;
        recommendations: string[];
    }> => {
        console.log('[LoanAPI] preAssess Payload:', JSON.stringify(data));
        const response = await httpClient.post<LoanApiResponse<any>>(
            ENDPOINTS.preAssess,
            data,
        );
        console.log('[LoanAPI] preAssess Response:', response.data);
        if (!response.data.data) {
            throw new Error(response.data.message || 'Pre-assessment failed');
        }
        return response.data.data;
    },

    /**
     * Get current user's loans (Borrower only) with pagination
     */
    getMyLoans: async (page: number = 1, limit: number = 10, status?: string): Promise<{ data: LoanContract[]; total: number; page: number; limit: number; totalPages: number }> => {
        console.log('[LoanAPI] getMyLoans Request:', { page, limit, status });
        const response = await httpClient.get<LoanApiResponse<any>>(
            ENDPOINTS.myLoans,
            { params: { page, limit, status } }
        );
        console.log('[LoanAPI] getMyLoans Raw Response Status:', response.status);

        const apiData = response.data.data;

        // Handle both old (array) and new (paginated object) response formats
        let result: { data: LoanContract[]; total: number; page: number; limit: number; totalPages: number };

        if (Array.isArray(apiData)) {
            // Old format: server returns array directly (no pagination metadata)
            console.log('[LoanAPI] Detected OLD array format, normalizing...');
            result = {
                data: apiData,
                total: apiData.length,
                page: 1,
                limit: apiData.length,
                totalPages: 1
            };
        } else if (apiData && typeof apiData === 'object' && Array.isArray(apiData.data)) {
            // New format: server returns { data: [...], total, page, limit, totalPages }
            console.log('[LoanAPI] Detected NEW paginated format');
            result = apiData;
        } else {
            // Fallback for unexpected formats
            console.warn('[LoanAPI] Unexpected response format, using empty result');
            result = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
        }

        console.log('[LoanAPI] getMyLoans Normalized Result: count=', result.data.length, 'total=', result.total);
        return result;
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

    /**
     * Disburse loan
     */
    disburseLoan: async (loanId: string): Promise<any> => {
        const response = await httpClient.post<LoanApiResponse<any>>(
            ENDPOINTS.disburse(loanId),
            {},
        );
        return response.data.data;
    },

    /**
     * Get credit scorecard history for a loan
     */
    getScorecardHistory: async (loanId: string): Promise<{
        scorecards: any[];
        count: number;
        latest: any | null;
    }> => {
        const response = await httpClient.get<LoanApiResponse<{
            scorecards: any[];
            count: number;
            latest: any | null;
        }>>(ENDPOINTS.scorecardHistory(loanId));
        return response.data.data ?? { scorecards: [], count: 0, latest: null };
    },

    /**
     * Assess credit score using Digital Footprint
     */
    assessCredit: async (loanId: string, footprint: any): Promise<any> => {
        const response = await httpClient.post<LoanApiResponse<any>>(
            ENDPOINTS.assessCredit(loanId),
            footprint,
        );
        return response.data.data;
    },
};

export default loanApi;

