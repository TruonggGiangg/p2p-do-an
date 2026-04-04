import { api } from '../../../core';
import type { Wallet } from '../../../types/auth.types';

// ==================== TYPES ====================

export type { Wallet };

export interface WalletsResponse {
    wallets: Wallet[];
    totalBalance?: number;
    count?: number;
}

export interface WalletTransaction {
    id: string;
    type: string;
    amount: number;
    date: string;
    description?: string;
}

export interface WalletTransactionsResponse {
    transactions: WalletTransaction[];
    total: number;
}

export interface TotalBalanceResponse {
    totalBalance: number;
}

export interface TransferRequest {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    description?: string;
    deviceId: string;
}

export interface TransferByPhoneRequest {
    fromWalletId: string;
    recipientPhone: string;
    amount: number;
    description?: string;
    deviceId: string;
}

export interface TransferByAccountRequest {
    fromWalletId: string;
    recipientAccountNo: string;
    amount: number;
    description?: string;
    deviceId: string;
}

export interface ConfirmTransferRequest {
    sessionId: string;
    otp: string;
    signature: string;
    deviceId: string;
    timestamp: number;
}

export interface TransferResponse {
    transactionId: string;
    fromWallet: {
        id: string;
        balance: number;
    };
    toWallet?: {
        id: string;
        balance: number;
    };
    amount: number;
    timestamp: string;
    message?: string;
}

// ==================== API ====================

export const walletAPI = {
    /** Get all wallets for current user */
    getWallets: async (): Promise<WalletsResponse> => {
        const response = await api.get<{ data: WalletsResponse }>('/api/wallets');
        return response.data.data;
    },

    /** Get specific wallet details */
    getWallet: async (walletId: string): Promise<Wallet> => {
        const response = await api.get<{ data: Wallet }>(`/api/wallets/${walletId}`);
        return response.data.data;
    },

    /** Force sync wallets from Fineract */
    syncWallets: async (): Promise<WalletsResponse> => {
        const response = await api.post<{ data: WalletsResponse }>('/api/wallets/sync');
        return response.data.data;
    },

    /** Get total balance across all wallets */
    getTotalBalance: async (): Promise<TotalBalanceResponse> => {
        const response = await api.get<{ data: TotalBalanceResponse }>('/api/wallets/balance');
        return response.data.data;
    },

    /** Get wallet transaction history */
    getTransactions: async (limit = 20, offset = 0, walletId?: string): Promise<WalletTransactionsResponse> => {
        const params: Record<string, string | number> = { limit, offset };
        if (walletId) params.walletId = walletId;
        const response = await api.get<{ data: WalletTransactionsResponse }>('/api/wallets/transactions', { params });
        return response.data.data;
    },

    /** Transfer money between wallets */
    transfer: async (data: TransferRequest): Promise<TransferResponse> => {
        const response = await api.post<{ data: TransferResponse }>('/api/wallets/transfer', data);
        return response.data.data;
    },

    /** Transfer money by phone number */
    transferByPhone: async (data: TransferByPhoneRequest): Promise<any> => {
        const response = await api.post<{ data: any }>('/api/wallets/transfer/phone', data);
        return response.data.data;
    },

    /** Set a wallet as default */
    setDefaultWallet: async (walletId: string): Promise<Wallet> => {
        const response = await api.patch<{ data: Wallet }>(`/api/wallets/${walletId}/default`);
        return response.data.data;
    },

    /** Transfer money by account number */
    transferByAccountNumber: async (data: TransferByAccountRequest): Promise<any> => {
        const response = await api.post<{ data: any }>('/api/wallets/transfer/account', data);
        return response.data.data;
    },

    /** Confirm and execute transfer after OTP */
    confirmTransfer: async (data: ConfirmTransferRequest): Promise<TransferResponse> => {
        const response = await api.post<{ data: TransferResponse }>('/api/wallets/transfer/confirm', data);
        return response.data.data;
    },
};
