import { Platform } from "react-native";
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

/**
 * Chuẩn hóa URI ảnh cho Android.
 * Android cần file:// hoặc content:// scheme.
 */
function normalizeUri(uri: string): string {
  if (
    Platform.OS === "android" &&
    !uri.startsWith("file://") &&
    !uri.startsWith("content://") &&
    !uri.startsWith("http")
  ) {
    return `file://${uri}`;
  }
  return uri;
}

/**
 * Config chung cho multipart upload.
 * QUAN TRỌNG:
 * - transformRequest: ngăn axios serialize FormData thành JSON
 * - Content-Type: "multipart/form-data" — React Native sẽ tự thêm boundary
 * - timeout lớn hơn vì upload ảnh chậm trên Android
 */
const MULTIPART_CONFIG = {
  headers: { "Content-Type": "multipart/form-data" },
  timeout: 60000,
  transformRequest: (data: any) => data,
};

class KycService {
  /**
   * OCR Front ID Card
   */
  async ocrFrontID(imageUri: string): Promise<OCRResult> {
    const formData = new FormData();
    formData.append("frontID", {
      uri: normalizeUri(imageUri),
      type: "image/jpeg",
      name: "front_cccd.jpg",
    } as any);

    console.log("[KycService] ocrFrontID sending uri:", normalizeUri(imageUri));
    const response = await api.post(
      "/api/ekyc/front-id",
      formData,
      MULTIPART_CONFIG,
    );

    console.log(
      "[KycService] ocrFrontID raw response:",
      JSON.stringify(response.data),
    );
    return response.data;
  }

  /**
   * OCR Back ID Card
   */
  async ocrBackID(imageUri: string): Promise<OCRResult> {
    const formData = new FormData();
    formData.append("backID", {
      uri: normalizeUri(imageUri),
      type: "image/jpeg",
      name: "back_cccd.jpg",
    } as any);

    console.log("[KycService] ocrBackID sending uri:", normalizeUri(imageUri));
    const response = await api.post(
      "/api/ekyc/back-id",
      formData,
      MULTIPART_CONFIG,
    );

    console.log(
      "[KycService] ocrBackID raw response:",
      JSON.stringify(response.data),
    );
    return response.data;
  }

  /**
   * Process Face Matching & Liveness
   */
  async processFaceMatching(
    portraitUris: string[],
    frontIDUri: string,
  ): Promise<FaceMatchingResult> {
    const formData = new FormData();

    // Add front ID
    formData.append("frontID", {
      uri: normalizeUri(frontIDUri),
      type: "image/jpeg",
      name: "front_cccd.jpg",
    } as any);

    // Add portraits
    portraitUris.forEach((uri, index) => {
      formData.append("portraitImages", {
        uri: normalizeUri(uri),
        type: "image/jpeg",
        name: `portrait_${index}.jpg`,
      } as any);
    });

    const response = await api.post(
      "/api/ekyc/process",
      formData,
      MULTIPART_CONFIG,
    );

    console.log(
      "[KycService] processFaceMatching raw response:",
      JSON.stringify(response.data),
    );
    return response.data;
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
    },
  ): Promise<any> {
    const formData = new FormData();

    // Thêm hình ảnh dạng file
    formData.append("frontImage", {
      uri: normalizeUri(frontImageUri),
      type: "image/jpeg",
      name: "front_cccd.jpg",
    } as any);

    formData.append("backImage", {
      uri: normalizeUri(backImageUri),
      type: "image/jpeg",
      name: "back_cccd.jpg",
    } as any);

    // Thêm dữ liệu JSON dạng chuỗi
    formData.append("frontOCRData", JSON.stringify(ocrData.frontOCRData));
    formData.append("backOCRData", JSON.stringify(ocrData.backOCRData));
    formData.append(
      "faceMatchingResult",
      JSON.stringify(ocrData.faceMatchingResult),
    );
    formData.append("livenessResult", JSON.stringify(ocrData.livenessResult));

    const response = await api.post(
      "/api/ekyc/save",
      formData,
      MULTIPART_CONFIG,
    );

    console.log(
      "[KycService] saveKYC raw response:",
      JSON.stringify(response.data),
    );
    return response.data;
  }
}

export const kycService = new KycService();
export default kycService;
