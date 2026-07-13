import axios, { AxiosError } from 'axios';

/**
 * Local API base URL. Docker/nginx on :5173 uses same-origin ('').
 * https://localhost (often Apache on :443) must not use relative URLs — they become https://localhost/...
 */
function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return '';
  const { hostname, port, protocol } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (local && protocol === 'https:') {
    return 'http://127.0.0.1:3000';
  }
  if (local && protocol === 'http:' && (port === '5173' || port === '5174' || port === '80')) {
    return port === '5173' || port === '5174' ? '' : 'http://127.0.0.1:3000';
  }
  return '';
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  const fingerprint = localStorage.getItem('device_fingerprint');
  if (fingerprint) {
    config.headers['X-Device-Fingerprint'] = fingerprint;
  }
  return config;
});

function isAuthSessionRequest(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('/auth/me') || url.includes('/auth/refresh');
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url || '';

    if (status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    // checkAuth handles /auth/me 401 — never hard-reload the page here (causes blink loops)
    if (isAuthSessionRequest(requestUrl)) {
      return Promise.reject(error);
    }

    if (!originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        return api(originalRequest);
      } catch {
        sessionStorage.removeItem('user');
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
    }

    return Promise.reject(error);
  },
);

export default api;

export const authApi = {
  register: (data: unknown) => api.post('/auth/register', data).then((r) => r.data),
  login: (data: unknown) => api.post('/auth/login', data).then((r) => r.data),
  refresh: () => api.post('/auth/refresh', {}, { withCredentials: true }).then((r) => r.data),
  logout: (data?: unknown) => api.post('/auth/logout', data || {}, { withCredentials: true }).then((r) => r.data),
  /** Returns { user: null } when logged out (200, not 401). */
  me: () => api.get('/auth/me').then((r) => r.data),
  checkUniqueness: (data: { phoneNumber: string; countryCode?: string; countryId: number; email: string }) =>
    api.post('/auth/check-uniqueness', data).then((r) => r.data),
  requestReactivation: (data: { phoneNumber: string; email: string; countryId?: number }) =>
    api.post('/auth/request-reactivation', data).then((r) => r.data),
};
