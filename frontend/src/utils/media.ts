const MISSING_IMAGE_STORAGE_KEY = 'cz_missing_image_urls';
const LEGACY_MISSING_KEY = 'cz_missing_upload_urls';

/**
 * Resolve upload paths for <img src>. Relative /uploads/... works with Vite proxy in dev
 * and same-origin nginx in Docker; absolute API base is used when VITE_API_URL is set.
 */
export function resolveUploadUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const apiBase = import.meta.env.VITE_API_URL as string | undefined;
  if (apiBase) {
    return `${apiBase.replace(/\/$/, '')}${path}`;
  }
  return path;
}

export function loadMissingImageUrls(): Set<string> {
  const set = new Set<string>();
  try {
    for (const key of [MISSING_IMAGE_STORAGE_KEY, LEGACY_MISSING_KEY]) {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) arr.forEach((u) => set.add(u));
    }
  } catch {
    /* ignore */
  }
  return set;
}

export function rememberMissingImageUrl(url: string): void {
  const set = loadMissingImageUrls();
  set.add(url);
  try {
    sessionStorage.setItem(MISSING_IMAGE_STORAGE_KEY, JSON.stringify([...set].slice(-300)));
  } catch {
    /* quota */
  }
}

export function isKnownMissingImageUrl(url: string): boolean {
  return loadMissingImageUrls().has(url);
}

export function fallbackLetter(label: string, isoCode?: string | null): string {
  const iso = (isoCode || '').trim();
  if (iso.length >= 2) return iso.slice(0, 2).toUpperCase();
  const trimmed = (label || '').trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}
