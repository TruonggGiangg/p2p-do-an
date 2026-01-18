import api from './api';

// ==================== WALLET API ====================

export interface CreateWalletRequest {
    type?: 'credit_wallet' | 'e_wallet';
}

export const walletAPI = {
    /**
     * GET /api/wallets - Fetch all wallets for current user
     */
    getWallets: async () => {
        const response = await api.get('/api/wallets');
        return response.data;
    },

    /**
     * GET /api/wallets/:id - Get specific wallet details
     */
    getWallet: async (walletId: string) => {
        const response = await api.get(`/api/wallets/${walletId}`);
        return response.data;
    },

    /**
     * POST /api/wallets - Create new wallet (for testing)
     */
    createWallet: async (data?: CreateWalletRequest) => {
        const response = await api.post('/api/wallets', data || {});
        return response.data;
    },

    /**
     * POST /api/wallets/sync - Force sync wallets from Fineract
     */
    syncWallets: async () => {
        const response = await api.post('/api/wallets/sync');
        return response.data;
    },

    /**
     * GET /api/wallets/balance - Get total balance across all wallets
     */
    getTotalBalance: async () => {
        const response = await api.get('/api/wallets/balance');
        return response.data;
    },
};
