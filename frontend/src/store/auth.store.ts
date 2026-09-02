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
  setUser: (user: User | null) => void;
  login: (data: unknown) => Promise<void>;
  register: (data: unknown) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: (reason?: string) => void;
  checkAuth: () => Promise<void>;
  refreshOrganisations: () => Promise<void>;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

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
    const res = await api.get('/my/scopes');
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

  setUser: (user) => {
    const finalUser = user
      ? { ...user, roles: user.roles || [], permissions: user.permissions || [] }
      : null;
    cacheUser(finalUser);
    set({ user: finalUser, isAuthenticated: !!finalUser });
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
    set({ user: finalUser, isAuthenticated: true });
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
    set({ user: null, isAuthenticated: false });
  },

  forceLogout: (reason?: string) => {
    stopProactiveRefresh();
    cacheUser(null);
    sessionStorage.removeItem(LOGIN_SPLASH_KEY);
    set({ user: null, isAuthenticated: false });
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
    if (!hadUser) set({ isLoading: true });
    try {
      try { await authApi.refresh(); } catch {}
      const result = await authApi.me();
      if (!result?.user) {
        cacheUser(null);
        set({ user: null, isAuthenticated: false });
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
      set({ user: finalUser, isAuthenticated: true });
      startProactiveRefresh();
      syncUserThemePreference(finalUser.darkMode);
      applyUserPreferences(finalUser);
      void import('./appearance.store').then(({ useAppearanceStore }) => useAppearanceStore.getState().fetch());
    } catch {
      const cached = get().user;
      if (!cached) {
        cacheUser(null);
        set({ user: null, isAuthenticated: false });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
