const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

interface CookieJar {
  [name: string]: string;
}

const jar: CookieJar = {};

function parseSetCookie(value: string): void {
  const [cookiePair] = value.split(';');
  if (!cookiePair) return;
  const eqIdx = cookiePair.indexOf('=');
  if (eqIdx === -1) return;
  const name = cookiePair.slice(0, eqIdx).trim();
  const val = cookiePair.slice(eqIdx + 1).trim();
  if (name) jar[name] = val;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
): Promise<{ status: number; headers: Headers; data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (cookie) {
    headers['Cookie'] = cookie;
  } else if (Object.keys(jar).length > 0) {
    headers['Cookie'] = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const parts = setCookie.split(',');
    for (const part of parts) parseSetCookie(part);
  }

  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text);
  } catch {
    data = text as unknown as T;
  }

  return { status: res.status, headers: res.headers, data };
}

export function getCookie(name: string): string | undefined {
  return jar[name];
}

export function clearCookies(): void {
  for (const key of Object.keys(jar)) delete jar[key];
}

export function cookieHeader(): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export const api = {
  async login(
    phoneNumber: string,
    password: string,
  ): Promise<{ status: number; data: any }> {
    const res = await request<any>('POST', '/auth/login', {
      phoneNumber,
      password,
    });
    return { status: res.status, data: res.data };
  },

  async registerPlayer(
    data: Record<string, unknown>,
  ): Promise<{ status: number; data: any }> {
    const res = await request<any>('POST', '/auth/register-player', data);
    return { status: res.status, data: res.data };
  },

  async createBooking(
    data: Record<string, unknown>,
    cookie?: string,
  ): Promise<{ status: number; data: any }> {
    const res = await request<any>('POST', '/bookings', data, cookie);
    return { status: res.status, data: res.data };
  },

  async prepareBooking(
    data: Record<string, unknown>,
    cookie?: string,
  ): Promise<{ status: number; data: any }> {
    const res = await request<any>('POST', '/bookings/prepare', data, cookie);
    return { status: res.status, data: res.data };
  },

  async getNotifications(
    cookie?: string,
    params?: { page?: number; limit?: number },
  ): Promise<{ status: number; data: any; headers: Headers }> {
    const query = params
      ? `?${new URLSearchParams({
          page: String(params.page ?? 1),
          limit: String(params.limit ?? 20),
        })}`
      : '';
    const res = await request<any>('GET', `/notifications${query}`, undefined, cookie);
    return { status: res.status, data: res.data, headers: res.headers };
  },

  async markAsRead(
    id: number,
    cookie?: string,
  ): Promise<{ status: number; data: any }> {
    const res = await request<any>(
      'PUT',
      `/notifications/${id}/read`,
      undefined,
      cookie,
    );
    return { status: res.status, data: res.data };
  },

  async health(): Promise<{ status: number; data: any }> {
    const res = await request<any>('GET', '/health');
    return { status: res.status, data: res.data };
  },

  async raw<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
  ): Promise<{ status: number; headers: Headers; data: T }> {
    return request<T>(method, path, body, cookie);
  },
};
