import { api } from "../../../core";

export interface PinStatusResponse {
  hasPin: boolean;
  pinSetAt?: string;
}

export interface SetupPinRequest {
  pin: string;
  sessionId: string;
}

export interface ChangePinRequest {
  oldPin: string;
  newPin: string;
  sessionId: string;
}

export const pinAPI = {
  /** Kiểm tra trạng thái PIN */
  getStatus: async (): Promise<PinStatusResponse> => {
    const response = await api.get<{
      success: boolean;
      hasPin: boolean;
      pinSetAt?: string;
    }>("/api/auth/pin/status");
    return { hasPin: response.data.hasPin, pinSetAt: response.data.pinSetAt };
  },

  /** Thiết lập mã PIN (sau khi Smart OTP đã xác thực) */
  setupPin: async (
    data: SetupPinRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post<{ success: boolean; message: string }>(
      "/api/auth/pin/setup",
      data,
    );
    return response.data;
  },

  /** Xác thực mã PIN */
  verifyPin: async (
    pin: string,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post<{ success: boolean; message: string }>(
      "/api/auth/pin/verify",
      { pin },
    );
    return response.data;
  },

  /** Đổi mã PIN (cần PIN cũ + Smart OTP) */
  changePin: async (
    data: ChangePinRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post<{ success: boolean; message: string }>(
      "/api/auth/pin/change",
      data,
    );
    return response.data;
  },
};
