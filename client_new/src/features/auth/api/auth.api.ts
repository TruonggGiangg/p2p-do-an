import { api, authStorage, authEvents } from "../../../core";
import type {
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  RegisterResponse,
  User,
  CreditScoreHistoryPageResponse,
  CreditScoreFactors,
} from "../../../types/auth.types";

export const authAPI = {
  /** Kiểm tra SĐT đã đăng ký chưa (giống HD-AMC CheckPhoneController) */
  checkPhone: async (phone: string): Promise<{ available: boolean; reason?: string }> => {
    try {
      const response = await api.get<{ data: { available: boolean; reason?: string } }>(
        "/api/auth/check-phone",
        { params: { phone } },
      );
      return response.data.data;
    } catch {
      return { available: true }; // Fallback: cho phép tiếp tục nếu API lỗi
    }
  },

  /** Register new user */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post<RegisterResponse>(
      "/api/auth/register",
      data,
    );
    return response.data;
  },

  /** Login with username and password */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>(
      "/api/auth/login",
      credentials,
    );
    const { data, accessToken, refreshToken, requires2fa } = response.data;

    if (requires2fa) {
      return response.data;
    }

    if (data && accessToken && refreshToken) {
      await authStorage.saveAuthData(data, { accessToken, refreshToken });
      authEvents.emitLogin();
    }

    return response.data;
  },

  /** Get current user info */
  getMe: async (): Promise<User> => {
    const response = await api.get<{ data: User }>("/api/auth/me");
    const user = response.data.data;

    await authStorage.saveUser(user);

    return user;
  },

  /** Get paginated credit score history of current user */
  getCreditScoreHistory: async (
    page = 1,
    limit = 20,
  ): Promise<CreditScoreHistoryPageResponse> => {
    const response = await api.get<{ data: CreditScoreHistoryPageResponse }>(
      "/api/auth/me/credit-score-history",
      { params: { page, limit } },
    );

    return response.data.data;
  },

  /** Recalculate credit score based on current data */
  recalculateCreditScore: async (): Promise<{
    score: number;
    factors: CreditScoreFactors;
    risk: { riskLevel: string; label: string; description: string };
  }> => {
    const response = await api.post<{
      data: {
        score: number;
        factors: CreditScoreFactors;
        risk: { riskLevel: string; label: string; description: string };
      };
    }>("/api/auth/me/credit-score/recalculate");
    return response.data.data;
  },

  /** Logout user */
  logout: async (): Promise<void> => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Continue with local cleanup even if API fails
    } finally {
      await authStorage.clearAll();
      authEvents.emitLogout();
    }
  },

  /** Check if user is authenticated */
  isAuthenticated: async (): Promise<boolean> => {
    return authStorage.isAuthenticated();
  },
};
