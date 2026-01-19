import api from './api';

export interface TransferRequest {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    description?: string;
}

export interface TransferByPhoneRequest {
    fromWalletId: string;
    recipientPhone: string;
    amount: number;
    description?: string;
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

export const transferAPI = {
    /**
     * Transfer money between wallets
     * POST /api/wallets/transfer
     */
    transfer: async (data: TransferRequest): Promise<TransferResponse> => {
        const response = await api.post<{ data: TransferResponse }>('/api/wallets/transfer', data);
        return response.data.data;
    },

    /**
     * Transfer money by phone number
     * POST /api/wallets/transfer/phone
     */
    transferByPhone: async (data: TransferByPhoneRequest): Promise<TransferResponse> => {
        const response = await api.post<{ data: TransferResponse }>('/api/wallets/transfer/phone', data);
        return response.data.data;
    },

    /**
     * Get transfer history
     * GET /api/wallets/transfers
     */
    getTransferHistory: async (walletId?: string) => {
        const params = walletId ? { walletId } : {};
        const response = await api.get('/api/wallets/transfers', { params });
        return response.data.data;
    },
};
