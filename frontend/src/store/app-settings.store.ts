import { create } from 'zustand';
import api from '../services/api';
import { syncFaviconForTheme, syncManifestIcons } from '../branding/sync-favicon';

const DEFAULT_LOGO_LIGHT = '/images/site-logo-light.svg';
const DEFAULT_LOGO_DARK = '/images/site-logo-dark.svg';
const DEFAULT_FAVICON_LIGHT = '/images/favicon-light.svg';
const DEFAULT_FAVICON_DARK = '/images/favicon-dark.svg';
const DEFAULT_PWA_192 = '/icon-192.png';
const DEFAULT_PWA_512 = '/icon-512.png';

export interface PublicAppSettings {
  site_name?: string;
  site_tagline?: string;
  site_logo_url?: string;
  site_logo_dark_url?: string;
  favicon_url?: string;
  favicon_dark_url?: string;
  pwa_icon_192?: string;
  pwa_icon_512?: string;
  meta_description?: string;
}

interface AppSettingsState {
  siteName: string;
  siteTagline: string;
  siteLogoLightUrl: string;
  siteLogoDarkUrl: string;
  faviconLightUrl: string;
  faviconDarkUrl: string;
  pwaIcon192Url: string;
  pwaIcon512Url: string;
  loaded: boolean;
  fetch: () => Promise<void>;
}

function pickString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function pickBrandAssetForTheme(
  lightUrl: string,
  darkUrl: string,
  mode: 'light' | 'dark',
  defaultLight: string,
  defaultDark: string,
): string {
  if (mode === 'dark') {
    return darkUrl.trim() || lightUrl.trim() || defaultDark;
  }
  return lightUrl.trim() || darkUrl.trim() || defaultLight;
}

export function pickSiteLogoForTheme(
  lightUrl: string,
  darkUrl: string,
  mode: 'light' | 'dark',
): string {
  return pickBrandAssetForTheme(lightUrl, darkUrl, mode, DEFAULT_LOGO_LIGHT, DEFAULT_LOGO_DARK);
}

export function pickFaviconForTheme(
  lightUrl: string,
  darkUrl: string,
  mode: 'light' | 'dark',
): string {
  const light = lightUrl.trim();
  const dark = darkUrl.trim();
  const lightIsCustom = light && !light.includes('favicon-light.svg') && !light.endsWith('/favicon.svg');
  const darkIsCustom = dark && !dark.includes('favicon-dark.svg');

  if (mode === 'dark') {
    if (darkIsCustom) return dark;
    if (lightIsCustom) return light;
    return dark || DEFAULT_FAVICON_DARK;
  }
  if (lightIsCustom) return light;
  if (darkIsCustom) return dark;
  return light || DEFAULT_FAVICON_LIGHT;
}

function applyDocumentMeta(settings: PublicAppSettings) {
  const name = pickString(settings.site_name, 'CourtZon');
  document.title = `${name} - Sports Facility Booking`;

  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (apple && settings.pwa_icon_512) {
    apple.href = resolveAssetUrl(String(settings.pwa_icon_512));
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (meta && settings.meta_description) {
    meta.content = String(settings.meta_description);
  }

  const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.content = name;
}

/** @deprecated Use syncFaviconForTheme from branding/sync-favicon */
export function applyThemeFavicon(_lightUrl: string, _darkUrl: string, mode: 'light' | 'dark') {
  syncFaviconForTheme(mode);
}

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
  siteName: 'CourtZon',
  siteTagline: 'Book. Play. Connect.',
  siteLogoLightUrl: DEFAULT_LOGO_LIGHT,
  siteLogoDarkUrl: DEFAULT_LOGO_DARK,
  faviconLightUrl: DEFAULT_FAVICON_LIGHT,
  faviconDarkUrl: DEFAULT_FAVICON_DARK,
  pwaIcon192Url: DEFAULT_PWA_192,
  pwaIcon512Url: DEFAULT_PWA_512,
  loaded: false,
  fetch: async () => {
    try {
      const res = await api.get('/public/app-settings');
      const data = (res.data?.data ?? {}) as PublicAppSettings;
      const siteName = pickString(data.site_name, 'CourtZon');
      const siteTagline = pickString(data.site_tagline, 'Book. Play. Connect.');
      const siteLogoLightUrl = pickString(data.site_logo_url, DEFAULT_LOGO_LIGHT);
      const siteLogoDarkUrl = pickString(data.site_logo_dark_url, DEFAULT_LOGO_DARK);
      const faviconLightUrl = pickString(data.favicon_url, DEFAULT_FAVICON_LIGHT);
      const faviconDarkUrl = pickString(data.favicon_dark_url, DEFAULT_FAVICON_DARK);
      const pwaIcon192Url = pickString(data.pwa_icon_192, DEFAULT_PWA_192);
      const pwaIcon512Url = pickString(data.pwa_icon_512, DEFAULT_PWA_512);
      applyDocumentMeta(data);
      set({
        siteName,
        siteTagline,
        siteLogoLightUrl,
        siteLogoDarkUrl,
        faviconLightUrl,
        faviconDarkUrl,
        pwaIcon192Url,
        pwaIcon512Url,
        loaded: true,
      });
      syncFaviconForTheme();
      void syncManifestIcons();
    } catch {
      set({ loaded: true });
    }
  },
}));

export function resolveAssetUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return url;
  return `/${url}`;
}

/** Theme-adaptive inline wordmark (legacy single SVG or empty). */
export function isInlineWordmarkLogo(url: string): boolean {
  return !url || url.endsWith('/images/site-logo.svg') || url.endsWith('/images/logo.svg');
}
