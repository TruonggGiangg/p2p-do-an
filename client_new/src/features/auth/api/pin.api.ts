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

// Server có TransformInterceptor wrap response thành { success, data, ... }
// Cần truy cập response.data.data để lấy dữ liệu thực

export const pinAPI = {
  /** Kiểm tra trạng thái PIN */
  getStatus: async (): Promise<PinStatusResponse> => {
    const response = await api.get("/api/auth/pin/status");
    const result = response.data?.data ?? response.data;
    return { hasPin: result.hasPin, pinSetAt: result.pinSetAt };
  },

  /** Thiết lập mã PIN (sau khi Smart OTP đã xác thực) */
  setupPin: async (
    data: SetupPinRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/api/auth/pin/setup", data);
    return response.data?.data ?? response.data;
  },

  /** Xác thực mã PIN */
  verifyPin: async (
    pin: string,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/api/auth/pin/verify", { pin });
    return response.data?.data ?? response.data;
  },

  /** Đổi mã PIN (cần PIN cũ + Smart OTP) */
  changePin: async (
    data: ChangePinRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/api/auth/pin/change", data);
    return response.data?.data ?? response.data;
  },
};
