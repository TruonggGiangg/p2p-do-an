import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import Constants from "expo-constants";
import { authStorage } from "../storage";
import { authEvents } from "../events";

// ==================== CONFIG ====================

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  "http://192.168.1.6:3001";

if (__DEV__) {
  console.log("📡 API_URL:", API_URL);
}

const PUBLIC_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/bnpl/preview",
  "/health",
];

// ==================== API INSTANCE ====================

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ==================== TOKEN REFRESH QUEUE ====================

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ==================== REQUEST INTERCEPTOR ====================

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip token for public endpoints
    if (PUBLIC_ENDPOINTS.some((endpoint) => config.url?.includes(endpoint))) {
      return config;
    }

    const accessToken = await authStorage.getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ==================== RESPONSE INTERCEPTOR ====================

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only handle 401 errors
    const isPublicEndpoint = PUBLIC_ENDPOINTS.some((endpoint) =>
      originalRequest.url?.includes(endpoint),
    );
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isPublicEndpoint
    ) {
      return Promise.reject(error);
    }

    // Refresh endpoint failed - session expired
    if (originalRequest.url?.includes("/auth/refresh")) {
      if (__DEV__) {
        console.log("Refresh token expired - logging out");
      }
      await authStorage.clearAll();
      authEvents.emitSessionExpired();
      return Promise.reject(error);
    }

    // Queue requests while refreshing
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    // Start token refresh
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await authStorage.getRefreshToken();

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const response = await api.post("/api/auth/refresh", { refreshToken });
      const { accessToken } = response.data.data;

      await authStorage.saveAccessToken(accessToken);

      api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;

      processQueue(null, accessToken);
      authEvents.emitTokenRefreshed(accessToken);

      return api(originalRequest);
    } catch (refreshError) {
      if (__DEV__) {
        console.error("Token refresh failed:", refreshError);
      }
      processQueue(refreshError as Error, null);

      await authStorage.clearAll();
      authEvents.emitSessionExpired();

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
