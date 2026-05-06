import axios from 'axios';
import { useAuthStore } from '../store/authStore.ts';

/** Dev: `/api/v1` → Vite proxies to API. Prod / Docker: set `VITE_API_URL` to API origin (no `/api/v1` suffix). */
export function resolveApiBaseURL(): string {
  const root = import.meta.env.VITE_API_URL as string | undefined;
  if (root?.trim()) {
    return `${root.replace(/\/$/, '')}/api/v1`;
  }
  return '/api/v1';
}

const api = axios.create({
  baseURL: resolveApiBaseURL(),
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const refreshClient = axios.create({
  baseURL: resolveApiBaseURL(),
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// refreshClient also attaches the current token (needed if any middleware checks it)
refreshClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: string) => void; reject: (reason?: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        useAuthStore.getState().logout();
        window.location.assign('/login');
        return Promise.reject(error);
      }

      try {
        const response = await refreshClient.post('/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        useAuthStore.getState().setTokens(accessToken, newRefreshToken);
        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Fully clear auth — wipe persisted Zustand key so stale token is gone on next load
        useAuthStore.getState().logout();
        try { localStorage.removeItem('smartload-auth'); } catch { /* ignore */ }
        window.location.assign('/login');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
