import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from './auth.store';
import { authApi } from '../services/api';

vi.mock('../services/api', () => {
  const get = vi.fn().mockResolvedValue({ data: { data: [] } });
  const post = vi.fn();
  return {
    default: { get, post },
    authApi: {
      login: vi.fn(),
      refresh: vi.fn(),
      me: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      checkUniqueness: vi.fn(),
      requestReactivation: vi.fn(),
    },
  };
});

vi.mock('../i18n', () => ({ setLocale: vi.fn() }));
vi.mock('./theme.store', () => ({ syncUserThemePreference: vi.fn() }));
vi.mock('./currency.store', () => ({
  useCurrencyStore: { getState: () => ({ registerSymbol: vi.fn() }) },
}));
vi.mock('./appearance.store', () => ({
  useAppearanceStore: { getState: () => ({ fetch: vi.fn() }) },
}));

const baseUser = {
  id: 1,
  publicId: 'p1',
  fullName: 'Mohamed Yassen',
  email: 'mniazyy@gmail.com',
  phoneNumber: '',
  fullPhone: '',
  gender: '',
  birthDate: null,
  avatarUrl: null,
  languageId: null,
  timezone: 'UTC',
  darkMode: 'light' as const,
  isCoach: false,
  isSeller: false,
  mainSportId: null,
  mainLevelId: null,
};

describe('auth.store — proactive permission re-sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    (authApi.login as any).mockResolvedValue({
      user: baseUser,
      session: { sessionToken: 's', refreshToken: 'r', expiresAt: '2026-10-01T00:00:00.000Z', refreshTokenExpiresAt: '2027-10-01T00:00:00.000Z', rememberMe: true },
    });
    (authApi.refresh as any).mockResolvedValue({ user: { ...baseUser }, session: {} });
    (authApi.logout as any).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies freshly granted permissions from the periodic /auth/refresh without a logout/login', async () => {
    await useAuthStore.getState().login({ email: 'mniazyy@gmail.com', password: 'x' });

    // Session starts WITHOUT the newly granted permission.
    expect(useAuthStore.getState().user?.permissions).not.toContain('financial.gateway-settlement.reverse');

    // The server grants it afterwards; the next proactive refresh returns it.
    (authApi.refresh as any).mockResolvedValue({
      user: { ...baseUser, permissions: ['financial.gateway-settlement.reverse', 'financial.gateway-settlement.settle-orgs'] },
      session: {},
    });

    // Advance one 12-minute refresh cycle.
    await vi.advanceTimersByTimeAsync(12 * 60 * 1000);

    expect(useAuthStore.getState().user?.permissions).toContain('financial.gateway-settlement.reverse');
    expect(useAuthStore.getState().user?.permissions).toContain('financial.gateway-settlement.settle-orgs');
  });

  it('preserves org scopes and roles when the refresh re-applies the user', async () => {
    await useAuthStore.getState().login({ email: 'mniazyy@gmail.com', password: 'x' });
    useAuthStore.getState().setUser({
      ...(useAuthStore.getState().user as any),
      roles: ['super_admin'],
      organisations: [{ id: 9, name: 'Org Nine', logoUrl: null, scopeType: 'organisation', isVerified: true, isActive: true }],
    });

    (authApi.refresh as any).mockResolvedValue({
      user: { ...baseUser, roles: ['super_admin'], permissions: ['financial.gateway-settlement.view'] },
      session: {},
    });

    await vi.advanceTimersByTimeAsync(12 * 60 * 1000);

    const user = useAuthStore.getState().user;
    expect(user?.roles).toContain('super_admin');
    expect(user?.permissions).toContain('financial.gateway-settlement.view');
    expect(user?.organisations?.length).toBe(1);
    expect(user?.organisations?.[0].id).toBe(9);
  });

  it('keeps the current session when the refresh fails', async () => {
    await useAuthStore.getState().login({ email: 'mniazyy@gmail.com', password: 'x' });
    (authApi.refresh as any).mockRejectedValue(new Error('network'));

    await vi.advanceTimersByTimeAsync(12 * 60 * 1000);

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(1);
  });
});

/**
 * Regression coverage for the live 429 incident: rapid navigation exhausted the
 * global rate-limit bucket, `/auth/me` answered 429, and the store treated that
 * like "no session" → redirect to /login. A rate limit (or any transient
 * failure) must never end a valid session.
 */
describe('auth.store — rate limiting must not end the session', () => {
  type StoreUser = NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  const seededUser = baseUser as unknown as StoreUser;
  const httpError = (status: number, error: string) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status, data: { error } },
    });

  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, authTransientError: false, isRecheckingAuth: false });
    vi.clearAllMocks();
    vi.mocked(authApi.refresh).mockResolvedValue({ user: { ...baseUser }, session: {} });
    vi.mocked(authApi.logout).mockResolvedValue({ success: true });
  });

  it('retries once on 429 and keeps the user signed in', async () => {
    vi.mocked(authApi.me)
      .mockRejectedValueOnce(httpError(429, 'RATE_LIMITED'))
      .mockResolvedValueOnce({ user: baseUser });

    await useAuthStore.getState().checkAuth();

    expect(authApi.me).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(baseUser.id);
    expect(useAuthStore.getState().isLoading).toBe(false);

    await useAuthStore.getState().logout();
  });

  it('never clears an existing session when the rate limit persists', async () => {
    sessionStorage.setItem('user', JSON.stringify(baseUser));
    useAuthStore.setState({ user: seededUser, isAuthenticated: true, isLoading: false });
    vi.mocked(authApi.me).mockRejectedValue(httpError(429, 'RATE_LIMITED'));

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(baseUser.id);
    expect(sessionStorage.getItem('user')).not.toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('treats a network failure (no response) as transient', async () => {
    useAuthStore.setState({ user: seededUser, isAuthenticated: true, isLoading: false });
    vi.mocked(authApi.me).mockRejectedValue(new Error('Network Error'));

    await useAuthStore.getState().checkAuth();

    expect(authApi.me).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('still clears the session on a definitive 401 (no retry)', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
    vi.mocked(authApi.me).mockRejectedValue(httpError(401, 'AUTHENTICATION_ERROR'));

    await useAuthStore.getState().checkAuth();

    expect(authApi.me).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
    // A definitive 401 is a real logout, never an indeterminate state.
    expect(useAuthStore.getState().authTransientError).toBe(false);
  });

  it('marks a cold start with no cached user as indeterminate, not logged out', async () => {
    vi.mocked(authApi.me).mockRejectedValue(httpError(429, 'RATE_LIMITED'));

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    // Indeterminate: guards must offer a retry instead of redirecting to /login.
    expect(state.authTransientError).toBe(true);
  });

  it('clears the indeterminate flag once a later session check succeeds', async () => {
    vi.mocked(authApi.me).mockRejectedValue(httpError(429, 'RATE_LIMITED'));
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().authTransientError).toBe(true);

    vi.mocked(authApi.me).mockResolvedValue({ user: baseUser });
    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().authTransientError).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    await useAuthStore.getState().logout();
  });

  it('keeps the retry surface while rechecking (no global splash swap) and returns to retryable on failure', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, authTransientError: true, isRecheckingAuth: false });
    vi.mocked(authApi.me).mockRejectedValue(httpError(429, 'RATE_LIMITED'));

    const pending = useAuthStore.getState().checkAuth();

    // Retry must not set isLoading (App.tsx would swap to the one-shot splash).
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isRecheckingAuth).toBe(true);

    await pending;

    // Failure leaves the user on a retryable surface, not on a spinner.
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isRecheckingAuth).toBe(false);
    expect(useAuthStore.getState().authTransientError).toBe(true);
  });

  it('clears the retry-in-progress flag from every session-ending action', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ user: baseUser });
    vi.mocked(authApi.logout).mockResolvedValue({ success: true });

    // setUser
    useAuthStore.setState({ isRecheckingAuth: true });
    useAuthStore.getState().setUser(seededUser);
    expect(useAuthStore.getState().isRecheckingAuth).toBe(false);

    // login
    useAuthStore.setState({ isRecheckingAuth: true });
    await useAuthStore.getState().login({ email: 'x', password: 'y' });
    expect(useAuthStore.getState().isRecheckingAuth).toBe(false);

    // logout (also stops the proactive refresh interval started by login)
    useAuthStore.setState({ isRecheckingAuth: true });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().isRecheckingAuth).toBe(false);

    // forceLogout
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    try {
      useAuthStore.setState({ isRecheckingAuth: true, user: seededUser, isAuthenticated: true });
      useAuthStore.getState().forceLogout('admin action');
      expect(useAuthStore.getState().isRecheckingAuth).toBe(false);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('ignores a failing /auth/refresh when /auth/me still returns a user', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(httpError(401, 'INVALID_REFRESH_TOKEN'));
    vi.mocked(authApi.me).mockResolvedValue({ user: baseUser });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authTransientError).toBe(false);

    await useAuthStore.getState().logout();
  });

  it('ignores a transient /auth/refresh failure when /auth/me still returns a user', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(httpError(429, 'RATE_LIMITED'));
    vi.mocked(authApi.me).mockResolvedValue({ user: baseUser });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authTransientError).toBe(false);

    await useAuthStore.getState().logout();
  });

  it('still logs out when /auth/refresh fails and /auth/me confirms there is no session', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(httpError(401, 'INVALID_REFRESH_TOKEN'));
    vi.mocked(authApi.me).mockResolvedValue({ user: null });

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.authTransientError).toBe(false);
  });
});
