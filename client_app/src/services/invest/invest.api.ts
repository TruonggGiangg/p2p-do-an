import httpClient from '../http/httpClient';

/**
 * Investment API endpoints
 */
const INVEST_ENDPOINTS = {
    AVAILABLE_LOANS: '/invest/available-loans',
    CREATE: '/invest/create',
    MY_INVESTMENTS: '/invest/my-investments',
    STATS: '/invest/stats',
    MY_BALANCE: '/invest/my-balance',
    DETAIL: (id: string) => `/invest/${id}`,
};

/**
 * Investment Info interface
 */
export interface InvestmentInfo {
    capital: number;
    numNotes: number;
    serviceFee?: number;
    monthlyPrincipalIncome?: number;
    monthlyInterestIncome?: number;
    monthlyIncome?: number;
    monthlyProfit?: number;
    entirelyProfit?: number;
    createdDate?: string;
}

/**
 * Investment interface
 */
export interface Investment {
    id: string;
    contractId: string;
    lender: string;
    loanContract: any;
    loanContractId?: string;
    info: InvestmentInfo;
    status: string;
    totalReceived?: number;
    totalPrincipalReceived?: number;
    totalInterestReceived?: number;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Available loan for investment
 */
export interface AvailableLoan {
    _id: string;
    contractId: string;
    info: {
        capital: number;
        rate: number;
        periodMonth: number;
        willing: string;
        disbursementDate?: string;
    };
    totalNotes: number;
    investedNotes: number;
    availableNotes: number;
    availableAmount: number;
    fundedPercentage: number;
    status: string;
}

/**
 * Investment stats
 */
export interface InvestmentStats {
    totalInvested: number;
    totalEarned: number;
    pendingReturns: number;
    activeInvestments: number;
    completedInvestments: number;
}

/**
 * Create Investment DTO
 */
export interface CreateInvestmentDto {
    loanContractId: string;
    capital: number;
    numNotes?: number;
}

/**
 * Investment API service
 */
export const investApi = {
    /**
     * Get loans available for investment
     */
    async getAvailableLoans(page = 1, limit = 10) {
        const response = await httpClient.get<{
            data: AvailableLoan[];
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(INVEST_ENDPOINTS.AVAILABLE_LOANS, { params: { page, limit } });
        return response.data;
    },

    /**
     * Create new investment
     */
    async createInvestment(dto: CreateInvestmentDto) {
        const response = await httpClient.post<Investment>(INVEST_ENDPOINTS.CREATE, dto);
        return response.data;
    },

    /**
     * Get my investments
     */
    async getMyInvestments(status?: string, page = 1, limit = 10) {
        const params: any = { page, limit };
        if (status) params.status = status;

        const response = await httpClient.get<{
            data: Investment[];
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(INVEST_ENDPOINTS.MY_INVESTMENTS, { params });
        return response.data;
    },

    /**
     * Get investment statistics
     */
    async getStats() {
        const response = await httpClient.get<InvestmentStats>(INVEST_ENDPOINTS.STATS);
        return response.data;
    },

    /**
     * Get wallet balance
     */
    async getMyBalance() {
        const response = await httpClient.get<{
            balance: number;
            availableBalance: number;
            accountId?: number;
            accountNo?: string;
        }>(INVEST_ENDPOINTS.MY_BALANCE);
        return response.data;
    },

    /**
     * Get investment by ID
     */
    async getInvestmentById(investmentId: string) {
        const response = await httpClient.get<Investment>(INVEST_ENDPOINTS.DETAIL(investmentId));
        return response.data;
    },
};

export default investApi;
