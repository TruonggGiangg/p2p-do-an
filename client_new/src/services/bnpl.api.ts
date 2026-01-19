import api from './api';

export interface BnplWalletInfo {
    id: string;
    creditLimit: number;
    usedCredit: number;
    availableCredit: number;
    balance: number;
    status: string;
    activeLoansCount: number;
}

export interface BnplLoan {
    id: string;
    fineractLoanId: string;
    principal: number;
    totalInterest: number;
    totalRepayment: number;
    paidAmount: number;
    outstandingBalance: number;
    numberOfRepayments: number;
    status: string;
    description?: string;
    disbursedAt?: string;
    repaymentSchedule?: any[];
}

export interface ConsolidatedScheduleItem {
    dueDate: string;
    month: string;
    totalDue: number;
    principal: number;
    interest: number;
    loans: Array<{ loanId: string; amount: number }>;
}

export interface CreateBnplLoanDto {
    amount: number;
    description?: string;
    numberOfRepayments?: number;
}

export const bnplAPI = {
    // ==================== WALLET ====================

    /** Get BNPL wallet info */
    getWallet: async (): Promise<BnplWalletInfo> => {
        const response = await api.get('/api/bnpl/wallet');
        return response.data.data;
    },

    /** Get wallet balance */
    getBalance: async () => {
        const response = await api.get('/api/bnpl/wallet/balance');
        return response.data.data;
    },

    // ==================== LOANS ====================

    /** Preview BNPL loan (public - no auth required) */
    previewLoan: async (data: { amount: number; numberOfRepayments?: number }): Promise<{
        amount: number;
        numberOfRepayments: number;
        monthlyRate: number;
        annualRate: number;
        monthlyPayment: number;
        totalRepayment: number;
        totalInterest: number;
        interestType: string;
        schedulePreview: Array<{
            period: number;
            principal: number;
            interest: number;
            total: number;
            dueDate: string;
        }>;
    }> => {
        const response = await api.post('/api/bnpl/preview', data);
        return response.data.data;
    },

    /** Create new BNPL loan (auto-disburse) */
    createLoan: async (data: CreateBnplLoanDto): Promise<BnplLoan> => {
        const response = await api.post('/api/bnpl/loans', data);
        return response.data.data;
    },

    /** Get all loans */
    getLoans: async (status?: string): Promise<{ loans: BnplLoan[]; count: number }> => {
        const params = status ? { status } : {};
        const response = await api.get('/api/bnpl/loans', { params });
        return response.data.data;
    },

    /** Get loan details with repayment schedule */
    getLoanDetails: async (loanId: string): Promise<BnplLoan> => {
        const response = await api.get(`/api/bnpl/loans/${loanId}`);
        return response.data.data;
    },

    /** Sync loan status from Fineract */
    syncLoanStatus: async (loanId: string): Promise<BnplLoan> => {
        const response = await api.post(`/api/bnpl/loans/${loanId}/sync`);
        return response.data.data;
    },

    // ==================== SCHEDULE ====================

    /** Get consolidated repayment schedule */
    getConsolidatedSchedule: async (): Promise<{
        schedule: ConsolidatedScheduleItem[];
        summary: { totalMonths: number; totalDue: number };
    }> => {
        const response = await api.get('/api/bnpl/schedule');
        return response.data.data;
    },
};
