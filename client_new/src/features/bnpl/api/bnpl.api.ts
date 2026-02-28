import { api } from "../../../core";

// ==================== TYPES ====================

export interface BnplWalletInfo {
  id: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  balance: number;
  status: string;
  activeLoansCount: number;
}

export interface RepaymentScheduleItem {
  period: number;
  principal: number;
  interest: number;
  total: number;
  dueDate: string;
  status?: string;
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
  repaymentSchedule?: RepaymentScheduleItem[];
}

export interface ConsolidatedScheduleItem {
  dueDate: string;
  month: string;
  totalDue: number;
  principal: number;
  interest: number;
  loans: Array<{ loanId: string; amount: number }>;
}

export interface LoanPreview {
  amount: number;
  numberOfRepayments: number;
  monthlyRate: number;
  annualRate: number;
  monthlyPayment: number;
  totalRepayment: number;
  totalInterest: number;
  interestType: string;
  schedulePreview: RepaymentScheduleItem[];
}

export interface CreateBnplLoanDto {
  amount: number;
  description?: string;
  numberOfRepayments?: number;
}

export interface LoansResponse {
  loans: BnplLoan[];
  count: number;
}

export interface ConsolidatedScheduleResponse {
  schedule: ConsolidatedScheduleItem[];
  summary: { totalMonths: number; totalDue: number };
}

export interface BnplTransaction {
  id: string;
  type: string;
  amount: number;
  description?: string;
  date?: string;
  createdAt?: string;
  source?: string;
}

// ==================== API ====================

export const bnplAPI = {
  /** Get BNPL wallet info */
  getWallet: async (): Promise<BnplWalletInfo> => {
    const response = await api.get<{ data: BnplWalletInfo }>(
      "/api/bnpl/wallet",
    );
    return response.data.data;
  },

  /** Preview BNPL loan (public) */
  previewLoan: async (data: {
    amount: number;
    numberOfRepayments?: number;
  }): Promise<LoanPreview> => {
    const response = await api.post<{ data: LoanPreview }>(
      "/api/bnpl/preview",
      data,
    );
    return response.data.data;
  },

  /** Create new BNPL loan */
  createLoan: async (data: CreateBnplLoanDto): Promise<BnplLoan> => {
    const response = await api.post<{ data: BnplLoan }>(
      "/api/bnpl/loans",
      data,
    );
    return response.data.data;
  },

  /** Get all loans */
  getLoans: async (status?: string): Promise<LoansResponse> => {
    const params = status ? { status } : {};
    const response = await api.get<{ data: LoansResponse }>("/api/bnpl/loans", {
      params,
    });
    return response.data.data;
  },

  /** Get loan details */
  getLoanDetails: async (loanId: string): Promise<BnplLoan> => {
    const response = await api.get<{ data: BnplLoan }>(
      `/api/bnpl/loans/${loanId}`,
    );
    return response.data.data;
  },

  /** Sync loan status from Fineract */
  syncLoanStatus: async (loanId: string): Promise<BnplLoan> => {
    const response = await api.post<{ data: BnplLoan }>(
      `/api/bnpl/loans/${loanId}/sync`,
    );
    return response.data.data;
  },

  /** Get consolidated repayment schedule */
  getConsolidatedSchedule: async (): Promise<ConsolidatedScheduleResponse> => {
    const response = await api.get<{ data: ConsolidatedScheduleResponse }>(
      "/api/bnpl/schedule",
    );
    return response.data.data;
  },

  /** Get BNPL transaction history */
  getTransactions: async (
    limit = 20,
  ): Promise<{ transactions: BnplTransaction[]; total: number }> => {
    try {
      const response = await api.get<{
        data: { transactions: BnplTransaction[]; total: number };
      }>("/api/bnpl/transactions", { params: { limit } });
      return response.data.data;
    } catch {
      return { transactions: [], total: 0 };
    }
  },
};
