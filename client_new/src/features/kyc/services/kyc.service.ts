import api from "../../../core/api/api.client";

export interface OCRResult {
    success: boolean;
    result?: any;
    error?: string;
    data?: any;
    errorCode?: number | string;
    errorMessage?: string;
    message?: string;
}

export interface FaceMatchingResult {
    success: boolean;
    face_matching?: boolean;
    spoof_score?: number;
    motion_variance?: number;
    error?: string;
    results?: any;
}

class KycService {
    /**
     * OCR Front ID Card
     */
    async ocrFrontID(imageUri: string): Promise<OCRResult> {
        const formData = new FormData();
        formData.append("frontID", {
            uri: imageUri,
            type: "image/jpeg",
            name: "front_cccd.jpg",
        } as any);

        const response = await api.post("/api/ekyc/front-id", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        console.log('[KycService] ocrFrontID raw response:', JSON.stringify(response.data));
        return response.data;
    }

    /**
     * OCR Back ID Card
     */
    async ocrBackID(imageUri: string): Promise<OCRResult> {
        const formData = new FormData();
        formData.append("backID", {
            uri: imageUri,
            type: "image/jpeg",
            name: "back_cccd.jpg",
        } as any);

        const response = await api.post("/api/ekyc/back-id", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        console.log('[KycService] ocrBackID raw response:', JSON.stringify(response.data));
        return response.data;
    }

    /**
     * Process Face Matching & Liveness
     */
    async processFaceMatching(
        portraitUris: string[],
        frontIDUri: string
    ): Promise<FaceMatchingResult> {
        const formData = new FormData();

        // Add front ID
        formData.append("frontID", {
            uri: frontIDUri,
            type: "image/jpeg",
            name: "front_cccd.jpg",
        } as any);

        // Add portraits
        portraitUris.forEach((uri, index) => {
            formData.append("portraitImages", {
                uri,
                type: "image/jpeg",
                name: `portrait_${index}.jpg`,
            } as any);
        });

        const response = await api.post("/api/ekyc/process", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        console.log('[KycService] processFaceMatching raw response:', JSON.stringify(response.data));
        return response.data?.data ?? response.data;
    }

    /**
     * Save KYC Data Flow
     */
    async saveKYC(
        frontImageUri: string,
        backImageUri: string,
        ocrData: {
            frontOCRData: any;
            backOCRData: any;
            faceMatchingResult: any;
            livenessResult: any;
        }
    ): Promise<any> {
        const formData = new FormData();

        // Thêm hình ảnh dạng file
        formData.append("frontImage", {
            uri: frontImageUri,
            type: "image/jpeg",
            name: "front_cccd.jpg",
        } as any);

        formData.append("backImage", {
            uri: backImageUri,
            type: "image/jpeg",
            name: "back_cccd.jpg",
        } as any);

        // Thêm dữ liệu JSON dạng chuỗi
        formData.append("frontOCRData", JSON.stringify(ocrData.frontOCRData));
        formData.append("backOCRData", JSON.stringify(ocrData.backOCRData));
        formData.append("faceMatchingResult", JSON.stringify(ocrData.faceMatchingResult));
        formData.append("livenessResult", JSON.stringify(ocrData.livenessResult));

        const response = await api.post("/api/ekyc/save", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        console.log("[KycService] saveKYC raw response:", JSON.stringify(response.data));
        return response.data;
    }
}

export const kycService = new KycService();
export default kycService;
