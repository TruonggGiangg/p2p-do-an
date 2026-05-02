import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // gửi cookie refreshToken (nếu BE đặt) cho /api/auth/refresh
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // FormData: bỏ Content-Type để browser tự set multipart/form-data + boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// ── Refresh token logic ─────────────────────────────────────────────────────
type RetryConfig = AxiosRequestConfig & { _retried?: boolean };
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('admin_refresh_token');
  if (!refreshToken) return null;
  try {
    // Dùng axios "trần" để tránh interceptor đệ quy
    const res = await axios.post(
      `${API_URL}/api/auth/refresh`,
      { refreshToken },
      { withCredentials: true, timeout: 15000 },
    );
    const payload = res.data?.data ?? res.data;
    const newAccess: string | undefined = payload?.accessToken;
    const newRefresh: string | undefined = payload?.refreshToken;
    if (!newAccess) return null;
    localStorage.setItem('admin_access_token', newAccess);
    if (newRefresh) localStorage.setItem('admin_refresh_token', newRefresh);
    return newAccess;
  } catch {
    return null;
  }
}

function clearAuthAndRedirect() {
  localStorage.removeItem('admin_access_token');
  localStorage.removeItem('admin_refresh_token');
  localStorage.removeItem('admin_user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const status = err.response?.status;
    const original = err.config as RetryConfig | undefined;

    // Không phải 401 hoặc đã retry → bỏ qua
    if (status !== 401 || !original || original._retried) {
      return Promise.reject(err);
    }

    // Tránh vòng lặp khi chính endpoint refresh trả 401
    const url = (original.url || '').toString();
    if (url.includes('/api/auth/refresh') || url.includes('/api/auth/login')) {
      clearAuthAndRedirect();
      return Promise.reject(err);
    }

    original._retried = true;

    // Gộp các request 401 song song vào cùng 1 lần refresh
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        // reset sau 1 tick để các request đang chờ kịp lấy kết quả
        setTimeout(() => { refreshPromise = null; }, 0);
      });
    }
    const newToken = await refreshPromise;

    if (!newToken) {
      clearAuthAndRedirect();
      return Promise.reject(err);
    }

    // Gắn lại header rồi retry
    original.headers = original.headers || {};
    (original.headers as any).Authorization = `Bearer ${newToken}`;
    return api(original);
  }
);
