/**
 * eKYC API Service
 * 
 * Gọi các API eKYC trên server NestJS
 */

import { httpClient } from '../http/httpClient';
import { apiConfig } from '../config/api.config';

// eKYC Python service URL (OCR, Face Detection)
const EKYC_SERVICE_URL = 'http://10.10.3.114:8000';

export interface KycImage {
    id: number;
    name: string;
    fileName: string;
    description: string;
    downloadUrl: string;
}

export interface KycImagesResponse {
    success: boolean;
    hasImages: boolean;
    identifierId?: number;
    identifierInfo?: {
        documentKey: string;
        description: string;
    };
    images: KycImage[];
    message?: string;
}

export interface SaveKycResponse {
    success: boolean;
    message?: string;
    fineractUpload?: {
        success: boolean;
        frontDocId?: number;
        backDocId?: number;
        identifierId?: number;
    };
    ocrData?: any;
    faceMatchingResult?: boolean;
}

export interface LivenessResponse {
    success: boolean;
    results?: {
        face_matching: boolean;
        liveness: boolean;
        spoof_score?: number;
        motion_variance?: number;
        bypassed?: boolean;
    };
    error?: string;
}

export interface BypassStatusResponse {
    bypassEnabled: boolean;
    message: string;
}

export interface OcrResponse {
    success: boolean;
    data?: {
        idNumber?: string;
        fullName?: string;
        dob?: string;
        gender?: string;
        nationality?: string;
        placeOfOrigin?: string;
        placeOfResidence?: string;
        expiry?: string;
        // Back side
        issueDate?: string;
        issuingAuthority?: string;
    };
    error?: string;
}

/**
 * eKYC API Functions
 */
export const ekycApi = {
    /**
     * Lấy danh sách ảnh CCCD đã upload
     */
    getImages: async (): Promise<KycImagesResponse> => {
        const response = await httpClient.get<KycImagesResponse>('/ekyc/images');
        return response.data;
    },

    /**
     * Lấy URL download ảnh CCCD
     */
    getImageUrl: (identifierId: number, documentId: number): string => {
        return `${apiConfig.baseUrl}/ekyc/images/${identifierId}/${documentId}`;
    },

    /**
     * Kiểm tra bypass mode có bật không
     */
    getBypassStatus: async (): Promise<BypassStatusResponse> => {
        const response = await httpClient.get<BypassStatusResponse>('/ekyc/bypass-status');
        return response.data;
    },

    /**
     * Lưu KYC và upload CCCD lên Fineract
     */
    saveKyc: async (data: {
        frontOCRData: any;
        backOCRData?: any;
        frontImageBase64: string;
        backImageBase64?: string;
        faceMatchingResult?: boolean;
        livenessResult?: any;
    }): Promise<SaveKycResponse> => {
        const formData = new FormData();

        formData.append('frontOCRData', JSON.stringify(data.frontOCRData));
        if (data.backOCRData) {
            formData.append('backOCRData', JSON.stringify(data.backOCRData));
        }
        formData.append('frontImageBase64', data.frontImageBase64);
        if (data.backImageBase64) {
            formData.append('backImageBase64', data.backImageBase64);
        }
        if (data.faceMatchingResult !== undefined) {
            formData.append('faceMatchingResult', String(data.faceMatchingResult));
        }
        if (data.livenessResult) {
            formData.append('livenessResult', JSON.stringify(data.livenessResult));
        }

        const response = await httpClient.post<SaveKycResponse>('/ekyc/save', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    /**
     * Gọi Python eKYC service để xử lý OCR mặt trước CCCD
     */
    processOcrFront: async (imageUri: string): Promise<OcrResponse> => {
        try {
            const formData = new FormData();
            formData.append('image', {
                uri: imageUri,
                type: 'image/jpeg',
                name: 'front_cccd.jpg',
            } as any);

            const response = await fetch(`${EKYC_SERVICE_URL}/api/ekyc/frontID`, {
                method: 'POST',
                body: formData,
            });

            return await response.json();
        } catch (error: any) {
            console.error('[ekycApi] OCR Front error:', error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * Gọi Python eKYC service để xử lý OCR mặt sau CCCD
     */
    processOcrBack: async (imageUri: string): Promise<OcrResponse> => {
        try {
            const formData = new FormData();
            formData.append('image', {
                uri: imageUri,
                type: 'image/jpeg',
                name: 'back_cccd.jpg',
            } as any);

            const response = await fetch(`${EKYC_SERVICE_URL}/api/ekyc/backID`, {
                method: 'POST',
                body: formData,
            });

            return await response.json();
        } catch (error: any) {
            console.error('[ekycApi] OCR Back error:', error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * Gọi Python eKYC service để kiểm tra liveness + face matching
     * Truyền trực tiếp đến Python service (không qua NestJS để tránh timeout)
     */
    processLiveness: async (
        frontImageUri: string,
        portraitUris: string[],
    ): Promise<LivenessResponse> => {
        try {
            const formData = new FormData();

            // Front CCCD image
            formData.append('frontID', {
                uri: frontImageUri,
                type: 'image/jpeg',
                name: 'front_cccd.jpg',
            } as any);

            // Portrait images
            portraitUris.forEach((uri, idx) => {
                formData.append('portraitImages', {
                    uri,
                    type: 'image/jpeg',
                    name: `portrait_${idx}.jpg`,
                } as any);
            });

            const response = await fetch(`${EKYC_SERVICE_URL}/api/ekyc/liveness`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            return {
                success: true,
                results: result.results || result,
            };
        } catch (error: any) {
            console.error('[ekycApi] Liveness error:', error.message);
            return { success: false, error: error.message };
        }
    },
};
