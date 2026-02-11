import api from '../../../core/api/api.client';

export interface LoanProduct {
    id: number;
    name: string;
    shortName: string;
    interestRatePerPeriod: number;
    interestType: {
        id: number;
        code: string;
        value: string;
    };
    minPrincipal?: number;
    maxPrincipal?: number;
    minNumberOfRepayments?: number;
    maxNumberOfRepayments?: number;
}

export interface LoanProductsResponse {
    statusCode: number;
    message: string;
    data: {
        products: LoanProduct[];
        count: number;
    };
}

class LoanService {
    /**
     * Fetch all loan products available for borrowing
     */
    async getLoanProducts(): Promise<LoanProduct[]> {
        try {
            const response = await api.get<LoanProductsResponse>('/api/loan/products');
            return response.data.data.products;
        } catch (error) {
            console.error('[LoanService] Error fetching loan products:', error);
            throw error;
        }
    }
}

export const loanService = new LoanService();
