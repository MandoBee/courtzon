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