import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import api from './api';

/**
 * These tests exercise the real axios pipeline (transformRequest → interceptors →
 * adapter) with a scripted adapter, so they cover `services/api.ts` behavior that
 * the page tests bypass by mocking this module entirely.
 */

type Handler = (config: InternalAxiosRequestConfig) => AxiosResponse | Promise<AxiosResponse>;

function response(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config };
}

function isRefreshCall(config: InternalAxiosRequestConfig): boolean {
  const url = String(config.url ?? '');
  if (url.startsWith('/auth/refresh')) return true;
  return /\/auth\/refresh(\?|$)/.test(new URL(url, 'http://localhost').pathname);
}

function installAdapter(handler: Handler) {
  const adapter: AxiosAdapter = async (config) => {
    const result = await handler(config);
    if (result.status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${result.status}`,
        result.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
        config,
        {},
        result,
      );
    }
    return result;
  };
  api.defaults.adapter = adapter;
  // `refreshAuthSession()` posts with the global axios instance, not `api`.
  axios.defaults.adapter = adapter;
}

function clearAuthStorage() {
  localStorage.clear();
  sessionStorage.clear();
}

beforeEach(() => {
  clearAuthStorage();
});

afterEach(() => {
  api.defaults.adapter = undefined;
  axios.defaults.adapter = undefined;
  clearAuthStorage();
});

describe('services/api request pipeline', () => {
  it('sends JSON with the default Content-Type and attaches the device fingerprint', async () => {
    localStorage.setItem('device_fingerprint', 'fp-abc');
    let seen: InternalAxiosRequestConfig | undefined;

    installAdapter((config) => {
      seen = config;
      return response(config, 200, { ok: true });
    });

    const result = await api.post('/demo', { hello: 'world' });

    expect(result.data).toEqual({ ok: true });
    expect(seen?.url).toBe('/demo');
    expect(seen?.withCredentials).toBe(true);
    expect(seen?.headers.get('Content-Type')).toBe('application/json');
    expect(seen?.headers.get('X-Device-Fingerprint')).toBe('fp-abc');
    expect(typeof seen?.data).toBe('string');
    expect(JSON.parse(String(seen?.data))).toEqual({ hello: 'world' });
  });

  it('omits the fingerprint header when no device fingerprint is stored', async () => {
    let seen: InternalAxiosRequestConfig | undefined;

    installAdapter((config) => {
      seen = config;
      return response(config, 200, {});
    });

    await api.get('/demo');

    expect(seen?.headers.get('X-Device-Fingerprint')).toBeUndefined();
    expect(seen?.headers.get('Content-Type')).toBe('application/json');
  });

  it('keeps FormData as FormData instead of JSON-serializing it', async () => {
    let seen: InternalAxiosRequestConfig | undefined;

    installAdapter((config) => {
      seen = config;
      return response(config, 201, { uploaded: true });
    });

    const form = new FormData();
    form.append('file', new Blob(['pixels'], { type: 'image/png' }), 'logo.png');
    form.append('kind', 'brand');

    const result = await api.post('/upload', form);

    expect(result.status).toBe(201);
    expect(seen?.data).toBeInstanceOf(FormData);
    // The interceptor must not leave the JSON content type in place; if it did,
    // axios would call formDataToJSON() and send a JSON body instead of multipart.
    expect(seen?.headers.get('Content-Type')).not.toBe('application/json');
    expect((seen?.data as FormData).get('kind')).toBe('brand');
  });

  it('returns blob payloads untouched for responseType: "blob"', async () => {
    const blob = new Blob(['id,name\n1,court'], { type: 'text/csv' });
    let seen: InternalAxiosRequestConfig | undefined;

    installAdapter((config) => {
      seen = config;
      return response(config, 200, blob);
    });

    const result = await api.get('/reports/export', { responseType: 'blob' });

    expect(result.data).toBe(blob);
    expect(seen?.responseType).toBe('blob');
    expect(seen?.withCredentials).toBe(true);
  });
});

describe('services/api auth refresh interceptor', () => {
  it('refreshes once and replays the original request after a 401', async () => {
    let protectedAttempts = 0;
    const refreshCalls: string[] = [];
    let replayedConfig: InternalAxiosRequestConfig | undefined;

    installAdapter((config) => {
      if (isRefreshCall(config)) {
        refreshCalls.push(String(config.url));
        return response(config, 200, { user: { id: 1 } });
      }
      protectedAttempts += 1;
      if (protectedAttempts === 1) {
        return response(config, 401, { error: 'UNAUTHORIZED' });
      }
      replayedConfig = config;
      return response(config, 200, { data: 'recovered' });
    });

    const result = await api.get('/protected');

    expect(result.data).toEqual({ data: 'recovered' });
    expect(protectedAttempts).toBe(2);
    expect(refreshCalls).toHaveLength(1);
    expect(replayedConfig?.url).toBe('/protected');
    expect(replayedConfig?.withCredentials).toBe(true);
  });

  it('shares a single refresh across concurrent 401 responses', async () => {
    const attempts = new Map<string, number>();
    let refreshCalls = 0;

    installAdapter(async (config) => {
      if (isRefreshCall(config)) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return response(config, 200, {});
      }
      const url = String(config.url);
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      if (attempt === 1) return response(config, 401, { error: 'UNAUTHORIZED' });
      return response(config, 200, { url });
    });

    const [first, second] = await Promise.all([api.get('/a'), api.get('/b')]);

    expect(first.data).toEqual({ url: '/a' });
    expect(second.data).toEqual({ url: '/b' });
    expect(refreshCalls).toBe(1);
  });

  it('does not refresh for /auth/me or /auth/refresh themselves', async () => {
    const calls: string[] = [];

    installAdapter((config) => {
      calls.push(String(config.url));
      return response(config, 401, { error: 'INVALID_REFRESH_TOKEN' });
    });

    await expect(api.get('/auth/me')).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toEqual(['/auth/me']);

    calls.length = 0;
    await expect(api.post('/auth/refresh')).rejects.toMatchObject({ response: { status: 401 } });
    // Exactly one call: the direct request. A nested refresh would loop forever.
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0], 'http://localhost').pathname).toBe('/auth/refresh');
  });

  it('clears the cached session and emits auth:logout when the refresh token is invalid', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 7 }));
    let logoutEvents = 0;
    const onLogout = () => {
      logoutEvents += 1;
    };
    window.addEventListener('auth:logout', onLogout);

    installAdapter((config) => {
      if (isRefreshCall(config)) {
        return response(config, 401, { error: 'INVALID_REFRESH_TOKEN' });
      }
      return response(config, 401, { error: 'UNAUTHORIZED' });
    });

    try {
      await expect(api.get('/protected')).rejects.toMatchObject({ response: { status: 401 } });
      expect(sessionStorage.getItem('user')).toBeNull();
      expect(logoutEvents).toBe(1);
    } finally {
      window.removeEventListener('auth:logout', onLogout);
    }
  });

  it('treats SESSION_EXPIRED like an invalid refresh token', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 8 }));
    let logoutEvents = 0;
    const onLogout = () => {
      logoutEvents += 1;
    };
    window.addEventListener('auth:logout', onLogout);

    installAdapter((config) => {
      if (isRefreshCall(config)) {
        return response(config, 401, { error: 'SESSION_EXPIRED' });
      }
      return response(config, 401, { error: 'UNAUTHORIZED' });
    });

    try {
      await expect(api.get('/protected')).rejects.toMatchObject({ response: { status: 401 } });
      expect(sessionStorage.getItem('user')).toBeNull();
      expect(logoutEvents).toBe(1);
    } finally {
      window.removeEventListener('auth:logout', onLogout);
    }
  });

  it('keeps the session and emits no logout event for other refresh failures', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 9 }));
    let logoutEvents = 0;
    const onLogout = () => {
      logoutEvents += 1;
    };
    window.addEventListener('auth:logout', onLogout);

    installAdapter((config) => {
      if (isRefreshCall(config)) {
        return response(config, 503, { error: 'SERVICE_UNAVAILABLE' });
      }
      return response(config, 401, { error: 'UNAUTHORIZED' });
    });

    try {
      await expect(api.get('/protected')).rejects.toMatchObject({ response: { status: 401 } });
      expect(sessionStorage.getItem('user')).not.toBeNull();
      expect(logoutEvents).toBe(0);
    } finally {
      window.removeEventListener('auth:logout', onLogout);
    }
  });

  it('propagates non-401 failures without attempting a refresh', async () => {
    const calls: string[] = [];

    installAdapter((config) => {
      calls.push(String(config.url));
      return response(config, 500, { error: 'SERVER_ERROR' });
    });

    await expect(api.get('/broken')).rejects.toMatchObject({ response: { status: 500 } });
    expect(calls).toEqual(['/broken']);
  });
});
