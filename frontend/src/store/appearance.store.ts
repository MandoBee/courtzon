import { create } from 'zustand';
import api from '../services/api';
import { applyPublishedTheme, type PublishedThemePayload } from '../theme/tokens';
const CACHE_KEY = 'cz_theme';

function normalizeThemePayload(raw: unknown): PublishedThemePayload {
  if (raw && typeof raw === 'object' && 'shared' in (raw as object)) {
    const p = raw as PublishedThemePayload;
    return { shared: p.shared || {}, light: p.light || {}, dark: p.dark || {} };
  }
  const flat = (raw || {}) as Record<string, string>;
  return { shared: flat, light: {}, dark: {} };
}

interface AppearanceState {
  theme: PublishedThemePayload;
  loaded: boolean;
  editableKeys: string[];
  roleId: number | null;
  roleName: string | null;
  /** Apply the cached theme synchronously for instant paint (no network). */
  hydrateFromCache: () => void;
  /** Fetch the published theme and apply it; revalidates the cache. */
  fetch: () => Promise<void>;
}

function readCache(): PublishedThemePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeThemePayload(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const emptyTheme = (): PublishedThemePayload => ({ shared: {}, light: {}, dark: {} });

export const useAppearanceStore = create<AppearanceState>((set) => ({
  theme: emptyTheme(),
  loaded: false,
  editableKeys: [],
  roleId: null,
  roleName: null,

  hydrateFromCache: () => {
    const cached = readCache();
    if (cached) {
      applyPublishedTheme(cached);
      set({ theme: cached });
    }
  },

  fetch: async () => {
    try {
      const { useAuthStore } = await import('./auth.store');
      const canCustomize = useAuthStore.getState().user?.permissions?.includes('appearance.role-customize');
      if (canCustomize) {
        const { data } = await api.get('/appearance/theme');
        const payload = normalizeThemePayload(data?.theme);
        applyPublishedTheme(payload);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore quota */ }
        set({
          theme: payload,
          loaded: true,
          editableKeys: data?.editableKeys || [],
          roleId: data?.roleId ?? null,
          roleName: data?.roleName ?? null,
        });
        return;
      }
      const { data } = await api.get('/public/theme');
      const payload = normalizeThemePayload(data);
      applyPublishedTheme(payload);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore quota */ }
      set({ theme: payload, loaded: true, editableKeys: [], roleId: null, roleName: null });
    } catch {
      set({ loaded: true });
    }
  },
}));

// Apply any cached theme as early as possible (module import time), so the first
// paint already reflects the published brand instead of the static index.css.
useAppearanceStore.getState().hydrateFromCache();
