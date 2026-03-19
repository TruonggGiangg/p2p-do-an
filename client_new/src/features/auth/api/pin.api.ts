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

function unwrapData(payload: any): any {
  let current = payload;
  for (let i = 0; i < 4; i++) {
    if (current && typeof current === "object" && "data" in current) {
      current = current.data;
      continue;
    }
    break;
  }
  return current;
}

// Server có TransformInterceptor wrap response thành { success, data, ... }
// Cần truy cập response.data.data để lấy dữ liệu thực

export const pinAPI = {
  /** Kiểm tra trạng thái PIN */
  getStatus: async (): Promise<PinStatusResponse> => {
    const response = await api.get("/api/auth/pin/status");
    const result = unwrapData(response.data);

    const hasPin =
      typeof result?.hasPin === "boolean"
        ? result.hasPin
        : typeof response.data?.hasPin === "boolean"
          ? response.data.hasPin
          : false;

    return {
      hasPin,
      pinSetAt: result?.pinSetAt,
    };
  },

  /** Thiết lập mã PIN (sau khi Smart OTP đã xác thực) */
  setupPin: async (
    data: SetupPinRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/api/auth/pin/setup", data);
    const result = unwrapData(response.data);
    return {
      success: result?.success !== false,
      message:
        result?.message ||
        response.data?.message ||
        "Thiết lập mã PIN thành công",
    };
  },

  /** Xác thực mã PIN */
  verifyPin: async (
    pin: string,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/api/auth/pin/verify", { pin });
    const result = unwrapData(response.data);

    if (typeof result?.success === "boolean") {
      return {
        success: result.success,
        message: result.message || "",
      };
    }

    if (typeof result?.valid === "boolean") {
      return {
        success: result.valid,
        message: result.message || "",
      };
    }

    return {
      success: false,
      message:
        result?.message || response.data?.message || "Xác thực mã PIN thất bại",
    };
  },

  /** Đổi mã PIN (cần PIN cũ + Smart OTP) */
  changePin: async (
    data: ChangePinRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/api/auth/pin/change", data);
    const result = unwrapData(response.data);
    return {
      success: result?.success !== false,
      message:
        result?.message || response.data?.message || "Đổi mã PIN thành công",
    };
  },
};
