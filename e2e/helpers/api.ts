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

/**
 * Country calling code used for E2E users.
 *
 * CourtZon login is phone + password only, and the backend resolves the user by
 * the country-code-prefixed `full_phone` (`authService.login` →
 * `fullPhone = countryCode + digits`, `auth.service.ts:520–529`). Every E2E user
 * is seeded with `countryId = 1` (`insertUser` default in
 * `e2e/helpers/database.ts`, plus `testUsers.*.countryId`), and country 1 is
 * Egypt with `phone_code = '+20'` (`database/seeds/001_baseline.sql:154`).
 * `insertUser` derives `full_phone` from that same row, so both sides agree.
 */
const E2E_COUNTRY_CODE = '+20';

export const api = {
  /**
   * Log in through the production phone + password contract.
   *
   * `LoginSchema` (`backend/src/modules/auth/presentation/auth.dto.ts:28–31`)
   * requires an 11-digit local `phoneNumber` and accepts an optional
   * `countryCode`; `authService.login` then prefixes it. Sending the bare local
   * number without a country code is rejected with 401, and sending an
   * already-prefixed number fails schema validation, so the helper always sends
   * the local digits plus the country code — exactly like the web client
   * (`frontend/src/pages/auth/LoginPage.tsx:58–63`).
   */
  async login(
    phoneNumber: string,
    password: string,
    countryCode: string = E2E_COUNTRY_CODE,
  ): Promise<{ status: number; data: any }> {
    if (phoneNumber.trim().startsWith('+')) {
      // Never double-prefix: an international number cannot be split back into
      // `countryCode` + 11 local digits without guessing (Egypt drops the
      // leading 0 in E.164), so fail loudly instead of sending a wrong login.
      throw new Error(
        'api.login expects the local 11-digit phone number (optionally with a separate countryCode), ' +
          `received an international number: ${phoneNumber}`,
      );
    }

    const res = await request<any>('POST', '/auth/login', {
      phoneNumber: phoneNumber.replace(/\D/g, ''),
      password,
      countryCode: countryCode.startsWith('+') ? countryCode : `+${countryCode}`,
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
