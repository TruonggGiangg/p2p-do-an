/**
 * Wallet API Service - API calls for wallet module
 */

import { httpClient } from '../http/httpClient';

/**
 * Wallet Balance Response
 */
export interface WalletBalance {
    balance: number;
    availableBalance: number;
    accountId?: number;
    accountNo?: string;
    currency?: string;
}

/**
 * Wallet Transaction
 */
export interface WalletTransaction {
    id: string;
    type: string;
    amount: number;
    date: string;
    description?: string;
    balance?: number;
}

/**
 * Wallet Transactions Response
 */
export interface WalletTransactionsResponse {
    transactions: WalletTransaction[];
    total: number;
    message?: string;
}

/**
 * Link Wallet Request
 */
export interface LinkWalletRequest {
    fineractClientId: string;
    phone?: string;
}

/**
 * Wallet API endpoints
 */
const ENDPOINTS = {
    balance: '/wallet/balance',
    transactions: '/wallet/transactions',
    link: '/wallet/link',
};

/**
 * Wallet API Service
 */
export const walletApi = {
    /**
     * Get wallet balance from Fineract savings account
     */
    async getBalance(): Promise<WalletBalance> {
        try {
            const response = await httpClient.get<WalletBalance>(ENDPOINTS.balance);
            return response.data;
        } catch (error: any) {
            console.error('[walletApi.getBalance] Failed:', error);
            throw new Error(error.response?.data?.message || 'Failed to fetch wallet balance');
        }
    },

    /**
     * Get wallet transactions
     */
    async getTransactions(limit: number = 20, offset: number = 0): Promise<WalletTransactionsResponse> {
        try {
            const response = await httpClient.get<WalletTransactionsResponse>(
                ENDPOINTS.transactions,
                { params: { limit, offset } }
            );
            return response.data;
        } catch (error: any) {
            console.error('[walletApi.getTransactions] Failed:', error);
            throw new Error(error.response?.data?.message || 'Failed to fetch wallet transactions');
        }
    },

    /**
     * Link P2P wallet to Fineract account
     */
    async linkWallet(data: LinkWalletRequest): Promise<any> {
        try {
            const response = await httpClient.post<any>(ENDPOINTS.link, data);
            return response.data;
        } catch (error: any) {
            console.error('[walletApi.linkWallet] Failed:', error);
            throw new Error(error.response?.data?.message || 'Failed to link wallet');
        }
    },
};

export default walletApi;
