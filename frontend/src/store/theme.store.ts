import { create } from 'zustand';
import { syncFaviconForTheme } from '../branding/sync-favicon';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  init: () => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;
}

let systemMq: MediaQueryList | null = null;
let systemHandler: (() => void) | null = null;

function detachSystemListener() {
  if (systemMq && systemHandler) {
    systemMq.removeEventListener('change', systemHandler);
  }
  systemMq = null;
  systemHandler = null;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const attachSystemListener = () => {
    detachSystemListener();
    if (typeof window === 'undefined') return;
    systemMq = window.matchMedia('(prefers-color-scheme: dark)');
    systemHandler = () => {
      if (get().mode !== 'system') return;
      const newResolved = getSystemTheme();
      applyTheme(newResolved);
      set({ resolved: newResolved });
      syncFaviconForTheme(newResolved);
    };
    systemMq.addEventListener('change', systemHandler);
  };

  return {
    mode: 'system',
    resolved: 'light',

    setMode: (mode) => {
      const resolved = resolveTheme(mode);
      applyTheme(resolved);
      localStorage.setItem('theme_mode', mode);
      set({ mode, resolved });
      syncFaviconForTheme(resolved);
      if (mode === 'system') attachSystemListener();
      else detachSystemListener();
    },

    init: () => {
      const stored = (localStorage.getItem('theme_mode') as ThemeMode) || 'system';
      const valid: ThemeMode =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      const resolved = resolveTheme(valid);
      applyTheme(resolved);
      set({ mode: valid, resolved });
      syncFaviconForTheme(resolved);
      if (valid === 'system') attachSystemListener();
      else detachSystemListener();
    },
  };
});

/** Apply profile / API darkMode preference (light | dark | system). */
export function syncUserThemePreference(darkMode?: string | null): void {
  const mode: ThemeMode =
    darkMode === 'light' || darkMode === 'dark' || darkMode === 'system' ? darkMode : 'system';
  useThemeStore.getState().setMode(mode);
}
