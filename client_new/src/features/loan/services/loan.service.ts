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

/** Loại tài liệu cần nộp theo gói vay (cho form hồ sơ) */
export interface LoanDocumentType {
    id: string;
    name: string;
    required: boolean;
    sortOrder: number;
}

export interface LoanDocumentTypesResponse {
    statusCode: number;
    message: string;
    data: { documentTypes: LoanDocumentType[] };
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

    /**
     * Lấy danh sách loại tài liệu cần nộp theo sản phẩm vay
     */
    async getDocumentTypesByProduct(productId: number): Promise<LoanDocumentType[]> {
        try {
            const response = await api.get<LoanDocumentTypesResponse>(`/api/loan/products/${productId}/document-types`);
            return response.data.data.documentTypes ?? [];
        } catch (error) {
            console.error('[LoanService] Error fetching document types:', error);
            throw error;
        }
    }
}

export const loanService = new LoanService();
