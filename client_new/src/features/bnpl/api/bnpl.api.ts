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
  purpose?: string;
  disbursedAt?: string;
  repaymentSchedule?: RepaymentScheduleItem[];
}

export interface BnplApplication {
  id: string;
  userId: string;
  status: string;
  requestedLimit?: number;
  approvedLimit?: number;
  income?: number;
  occupation?: string;
  purpose?: string;
  address?: string;
  requestedTermMonths?: number;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectReason?: string;
  riskDecision?: Record<string, any> | null;
  riskReasons?: string[];
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
  totalFees: number;
  interestType: string;
  schedulePreview: RepaymentScheduleItem[];
}

export interface CreateBnplLoanDto {
  amount: number;
  description?: string;
  purpose?: string;
  numberOfRepayments?: number;
}

export interface CreateBnplApplicationDto {
  requestedLimit?: number;
  requestedTermMonths?: number;
  income?: number;
  occupation?: string;
  purpose?: string;
  address?: string;
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
  loanId?: string;
  fineractLoanId?: string;
  loanStatus?: string;
}

export interface BnplPrepayAmount {
  amount: number;
  principalPortion: number;
  interestPortion: number;
  penaltyPortion: number;
  feesPortion: number;
  date: string;
  loanId: string;
  fineractLoanId: string;
  capital: number;
}

export interface BnplPaymentResult {
  success: boolean;
  transactionId: number | string;
  amount: number;
  date: string;
  loanStatus: string;
  breakdown?: { principal: number; interest: number; fees: number; penalty: number };
}

export interface DelinquencyPolicyItem {
  _id: string;
  debt_group: number;
  debt_group_name: string;
  min_days: number | null;
  max_days: number | null;
  send_email: boolean;
  send_sms: boolean;
  send_notification: boolean;
  apply_penalty: boolean;
  block_new_loan: boolean;
  collection_stage:
    | "NONE"
    | "REMINDER"
    | "WARNING"
    | "COLLECTION"
    | "LEGAL"
    | "WRITE_OFF";
  legal_escalation: boolean;
  is_active: boolean;
  description?: string;
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

  /** Get amount needed to prepay BNPL loan */
  getPrepayAmount: async (loanId: string): Promise<BnplPrepayAmount> => {
    const response = await api.get<{ data: BnplPrepayAmount }>(
      `/api/bnpl/loans/${loanId}/prepay-amount`,
    );
    return response.data.data;
  },

  /** Submit BNPL application */
  submitApplication: async (data: CreateBnplApplicationDto): Promise<BnplApplication> => {
    const response = await api.post<{ data: BnplApplication }>('/api/bnpl/applications', data);
    return response.data.data;
  },

  /** Activate BNPL wallet after user signs the agreement */
  activateWallet: async (signatureText?: string): Promise<BnplWalletInfo> => {
    const response = await api.post<{ data: BnplWalletInfo }>('/api/bnpl/wallet/activate', {
      signatureText,
    });
    return response.data.data;
  },

  /** Get current BNPL application for logged-in user */
  getCurrentApplication: async (): Promise<BnplApplication | null> => {
    try {
      const response = await api.get<{ data: { application: BnplApplication | null } }>('/api/bnpl/applications/current');
      return response.data.data.application || null;
    } catch {
      return null;
    }
  },

  /** Repay a BNPL loan installment */
  repayLoan: async (
    loanId: string,
    amount: number,
    repaymentDate?: string,
    idempotencyKey?: string,
  ): Promise<BnplPaymentResult> => {
    const response = await api.post<{ data: BnplPaymentResult }>(
      `/api/bnpl/loans/${loanId}/repay`,
      { amount, repaymentDate, idempotencyKey },
    );
    return response.data.data;
  },

  /** Prepay a BNPL loan */
  prepayLoan: async (loanId: string, repaymentDate?: string, idempotencyKey?: string): Promise<BnplPaymentResult> => {
    const response = await api.post<{ data: BnplPaymentResult }>(
      `/api/bnpl/loans/${loanId}/prepay`,
      { repaymentDate, idempotencyKey },
    );
    return response.data.data;
  },

  /** Get active delinquency policies for displaying contract terms before signature */
  getDelinquencyPolicies: async (): Promise<DelinquencyPolicyItem[]> => {
    try {
      const response = await api.get<{ data: DelinquencyPolicyItem[] }>(
        "/api/delinquency/policies",
        { params: { is_active: true } },
      );
      return response.data.data || [];
    } catch {
      return [];
    }
  },
};
