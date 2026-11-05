import { create } from 'zustand';
import { authApi } from '../services/api';
import api from '../services/api';
import { syncUserThemePreference } from './theme.store';
import { useCurrencyStore } from './currency.store';
import { setLocale } from '../i18n';
import { LOGIN_SPLASH_KEY } from '../constants/login-splash';

interface OrgScope {
  id: number;
  name: string;
  logoUrl: string | null;
  scopeType: string;
  isVerified: boolean;
  isActive: boolean;
}

interface User {
  id: number;
  publicId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  fullPhone: string;
  gender: string;
  birthDate: string | null;
  avatarUrl: string | null;
  languageId: number | null;
  languageCode?: string | null;
  timezone: string;
  darkMode: 'light' | 'dark' | 'system';
  isCoach: boolean;
  coachStatus?: string;
  isSeller: boolean;
  isPublic?: boolean;
  mainSportId: number | null;
  mainLevelId: number | null;
  interestedSportIds?: number[];
  defaultCurrency?: string;
  defaultCurrencySymbol?: string | null;
  roles?: string[];
  permissions?: string[];
  organisations?: OrgScope[];
  hasSeenWelcome?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * True when the last session check failed for a transient reason
   * (429 / 5xx / network). The session is *unknown*, not invalid: guards must
   * offer a retry instead of redirecting to /login.
   */
  authTransientError: boolean;
  /**
   * True while a user-initiated retry of the session check is in flight.
   * Kept separate from `isLoading` so a retry never swaps the whole app to the
   * startup splash (which can only dismiss itself once).
   */
  isRecheckingAuth: boolean;
  setUser: (user: User | null) => void;
  login: (data: unknown) => Promise<void>;
  register: (data: unknown) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: (reason?: string) => void;
  checkAuth: () => Promise<void>;
  refreshOrganisations: () => Promise<void>;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 429 / 5xx / network failures are transient. They must never be interpreted
 * as "the session ended": the live incident (rapid navigation → 429 on
 * /auth/me) bounced users to /login because any non-success answer cleared the
 * session when no user was cached yet (fresh page load).
 */
function isTransientAuthFailure(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
  if (typeof status !== 'number') return true; // network error / timeout
  return status === 429 || status >= 500;
}

const TRANSIENT_AUTH_RETRY_DELAY_MS = 750;

/**
 * One bounded retry for transient failures so a momentary 429 is absorbed
 * instead of surfacing as a logout. Definitive auth failures (401/403) are
 * rethrown immediately.
 */
async function fetchCurrentUserResilient(): Promise<Awaited<ReturnType<typeof authApi.me>>> {
  try {
    return await authApi.me();
  } catch (err) {
    if (!isTransientAuthFailure(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_AUTH_RETRY_DELAY_MS));
    return authApi.me();
  }
}

function startProactiveRefresh() {
  stopProactiveRefresh();
  refreshTimer = setInterval(() => {
    authApi
      .refresh()
      .then((res: any) => {
        // /auth/refresh returns a fresh user (roles + permissions) from the
        // server. Apply it so newly granted permissions reach existing
        // sessions without a logout/login (the 401-interceptor path refreshes
        // tokens only). Preserve org scopes, which /auth/refresh does not carry.
        const fresh = res?.user;
        const current = useAuthStore.getState().user;
        if (fresh && current) {
          const finalUser = {
            ...current,
            ...fresh,
            roles: fresh.roles || current.roles || [],
            permissions: fresh.permissions || current.permissions || [],
            organisations: current.organisations,
          };
          useAuthStore.getState().setUser(finalUser);
        }
      })
      .catch(() => {});
  }, 12 * 60 * 1000);
}

function stopProactiveRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

async function loadScopes(): Promise<OrgScope[]> {
  try {
    let res: any;
    try {
      res = await api.get('/my/scopes');
    } catch (firstErr: any) {
      // The login request resolves as soon as the body arrives; the browser can
      // still be committing the Set-Cookie when this immediate follow-up call
      // fires (observed as a one-off 401 in the login UI). Retry once before
      // treating the scope fetch as failed.
      if (firstErr?.response?.status === 401) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        res = await api.get('/my/scopes');
      } else {
        throw firstErr;
      }
    }
    const raw = res.data?.data || res.data || [];
    const arr = Array.isArray(raw) ? raw : [];
    const orgRows = arr.filter((s: { scope_type?: string }) => !s.scope_type || s.scope_type === 'organisation');
    const seen = new Set<number>();
    return orgRows.map((s: {
      scope_id: number;
      name?: string;
      logo_url?: string | null;
      scope_type: string;
      is_verified?: boolean | number;
      is_active?: boolean | number;
    }) => ({
      id: s.scope_id,
      name: s.name || `Organisation ${s.scope_id}`,
      logoUrl: s.logo_url || null,
      scopeType: s.scope_type,
      isVerified: s.is_verified === true || s.is_verified === 1,
      isActive: s.is_active === true || s.is_active === 1,
    })).filter((org) => {
      if (seen.has(org.id)) return false;
      seen.add(org.id);
      return true;
    });
  } catch (err) {
    console.error('[loadScopes] failed:', err);
    return [];
  }
}

function applyUserPreferences(user: User) {
  if (user.languageCode) {
    void setLocale(user.languageCode);
  }
  if (user.defaultCurrency && user.defaultCurrencySymbol) {
    useCurrencyStore.getState().registerSymbol(user.defaultCurrency, user.defaultCurrencySymbol);
  }
}

function cacheUser(user: User | null): void {
  if (user) {
    sessionStorage.setItem('user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('user');
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authTransientError: false,
  isRecheckingAuth: false,

  setUser: (user) => {
    const finalUser = user
      ? { ...user, roles: user.roles || [], permissions: user.permissions || [] }
      : null;
    cacheUser(finalUser);
    set({ user: finalUser, isAuthenticated: !!finalUser, authTransientError: false, isRecheckingAuth: false });
  },

  login: async (data) => {
    const result = await authApi.login(data);
    const scopes = await loadScopes();
    const finalUser = {
      ...result.user,
      roles: result.user?.roles || [],
      permissions: result.user?.permissions || [],
      organisations: scopes,
    };
    cacheUser(finalUser);
    set({ user: finalUser, isAuthenticated: true, authTransientError: false, isRecheckingAuth: false });
    startProactiveRefresh();
    sessionStorage.setItem(LOGIN_SPLASH_KEY, '1');
    applyUserPreferences(finalUser);
    void import('./appearance.store').then(({ useAppearanceStore }) => useAppearanceStore.getState().fetch());
  },

  register: async (data) => {
    await authApi.register(data);
  },

  logout: async () => {
    stopProactiveRefresh();
    try {
      await authApi.logout({ allDevices: false });
    } catch {
      // clear local state even if server logout fails
    }
    cacheUser(null);
    sessionStorage.removeItem(LOGIN_SPLASH_KEY);
    set({ user: null, isAuthenticated: false, authTransientError: false, isRecheckingAuth: false });
  },

  forceLogout: (reason?: string) => {
    stopProactiveRefresh();
    cacheUser(null);
    sessionStorage.removeItem(LOGIN_SPLASH_KEY);
    set({ user: null, isAuthenticated: false, authTransientError: false, isRecheckingAuth: false });
    sessionStorage.setItem('force_logout_reason', reason || 'Session terminated by administrator');
    window.location.href = '/login';
  },

  refreshOrganisations: async () => {
    const user = get().user;
    if (!user) return;
    const scopes = await loadScopes();
    const finalUser = { ...user, organisations: scopes };
    cacheUser(finalUser);
    set({ user: finalUser });
  },

  checkAuth: async () => {
    const hadUser = !!get().user;
    // A retry after a transient failure must stay on the retry surface: setting
    // `isLoading` here would swap the app to the one-shot startup splash, which
    // cannot dismiss itself if the check outlives it (stuck screen).
    const isRetry = get().authTransientError === true;
    if (!hadUser && !isRetry) set({ isLoading: true });
    if (isRetry) set({ isRecheckingAuth: true });
    try {
      try { await authApi.refresh(); } catch {}
      const result = await fetchCurrentUserResilient();
      if (!result?.user) {
        cacheUser(null);
        set({ user: null, isAuthenticated: false, authTransientError: false, isRecheckingAuth: false });
        return;
      }
      const scopes = await loadScopes();
      const finalUser = {
        ...result.user,
        roles: result.user?.roles || [],
        permissions: result.user?.permissions || [],
        organisations: scopes,
      };
      cacheUser(finalUser);
      set({ user: finalUser, isAuthenticated: true, authTransientError: false, isRecheckingAuth: false });
      startProactiveRefresh();
      syncUserThemePreference(finalUser.darkMode);
      applyUserPreferences(finalUser);
      void import('./appearance.store').then(({ useAppearanceStore }) => useAppearanceStore.getState().fetch());
    } catch (err) {
      // Transient failures (429 / 5xx / network) must not invalidate a session.
      // On a cold start (no cached user) they must not fall through to the
      // unauthenticated state either: ProtectedRoute would then redirect to
      // /login — the exact live-incident symptom. Mark the session as
      // indeterminate and let the guard offer a bounded, user-initiated retry.
      if (isTransientAuthFailure(err)) {
        set({ authTransientError: true });
      } else {
        set({ authTransientError: false });
        const cached = get().user;
        if (!cached) {
          cacheUser(null);
          set({ user: null, isAuthenticated: false });
        }
      }
    } finally {
      set({ isLoading: false, isRecheckingAuth: false });
    }
  },
}));
