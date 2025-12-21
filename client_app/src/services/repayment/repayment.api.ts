/**
 * Repayment API Service - API calls for repayment module
 */

import { httpClient } from '../http/httpClient';

/**
 * Make Repayment Request
 */
export interface MakeRepaymentRequest {
    loanId: string;
    amount: number;
}

/**
 * Repayment Response
 */
export interface RepaymentResponse {
    success: boolean;
    loanId: string;
    amount: number;
    fineractRepayment?: any;
    distribution?: {
        success: boolean;
        totalDistributed: number;
        repaymentAmount: number;
        lendersCount: number;
        distributions: any[];
    };
}

/**
 * Repayment API endpoints
 */
const ENDPOINTS = {
    repay: '/repayment/repay',
};

/**
 * Repayment API Service
 */
export const repaymentApi = {
    /**
     * Make a repayment on a loan (distributes to lenders automatically)
     */
    async makeRepayment(data: MakeRepaymentRequest): Promise<RepaymentResponse> {
        try {
            const response = await httpClient.post<RepaymentResponse>(ENDPOINTS.repay, data);
            return response.data;
        } catch (error: any) {
            console.error('[repaymentApi.makeRepayment] Failed:', error);
            throw new Error(error.response?.data?.message || 'Failed to make repayment');
        }
    },
};

export default repaymentApi;
