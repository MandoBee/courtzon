import { useCallback, type ReactNode } from 'react';
import { create } from 'zustand';
import api from '../services/api';
import { getRegistryDefaultsMap, type TranslationKeyEntry } from './translation-keys.registry';

export type Locale = string;

const registryDefaults = getRegistryDefaultsMap();
const fallbackLocale: Locale = 'en';

function getInitialLocale(): Locale {
  if (typeof localStorage === 'undefined') return fallbackLocale;
  return localStorage.getItem('locale') || fallbackLocale;
}

function applyDocumentLocale(locale: Locale, isRtl?: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl !== undefined ? (isRtl ? 'rtl' : 'ltr') : locale === 'ar' ? 'rtl' : 'ltr';
}

interface I18nState {
  locale: Locale;
  bundle: Record<string, string>;
  loading: boolean;
  setLocale: (locale: Locale, isRtl?: boolean) => Promise<void>;
  loadTranslations: (locale?: Locale) => Promise<void>;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: getInitialLocale(),
  bundle: { ...registryDefaults },
  loading: false,

  loadTranslations: async (localeArg?: Locale) => {
    const locale = localeArg || get().locale;
    set({ loading: true });
    try {
      const res = await api.get(`/public/translations/${locale}`);
      const data = res.data?.data as Record<string, string> | undefined;
      set({ bundle: data && Object.keys(data).length ? data : { ...registryDefaults }, loading: false });
    } catch {
      set({ bundle: { ...registryDefaults }, loading: false });
    }
  },

  setLocale: async (locale: Locale, isRtl?: boolean) => {
    localStorage.setItem('locale', locale);
    applyDocumentLocale(locale, isRtl);
    set({ locale });
    await get().loadTranslations(locale);
  },
}));

export function getLocale(): Locale {
  return useI18nStore.getState().locale;
}

export async function setLocale(locale: Locale, isRtl?: boolean): Promise<void> {
  await useI18nStore.getState().setLocale(locale, isRtl);
}

function resolveTranslation(
  bundle: Record<string, string>,
  key: string,
  params?: Record<string, string | number>
): string {
  let value = bundle[key] || registryDefaults[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      value = value.replace(`{${k}}`, String(v));
    });
  }
  return value;
}

/** Imperative translate — does not subscribe; prefer `useTranslation()` in components. */
export function t(key: string, params?: Record<string, string | number>): string {
  return resolveTranslation(useI18nStore.getState().bundle, key, params);
}

export function useTranslation() {
  const locale = useI18nStore((s) => s.locale);
  const bundle = useI18nStore((s) => s.bundle);
  const loading = useI18nStore((s) => s.loading);
  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => resolveTranslation(bundle, key, params),
    [bundle]
  );
  return { t: translate, locale, setLocale, getLocale, loading };
}

/** Subscribes to locale/bundle so children re-render when language changes. */
export function I18nProvider({ children }: { children: ReactNode }) {
  useI18nStore((s) => s.locale);
  useI18nStore((s) => s.bundle);
  return children;
}

/** Re-export registry helpers for tooling. */
export type { TranslationKeyEntry };
export { getRegistryDefaultsMap, translationKeysRegistry } from './translation-keys.registry';

// Bootstrap locale on module load
const initial = getInitialLocale();
applyDocumentLocale(initial);
void useI18nStore.getState().loadTranslations(initial);
