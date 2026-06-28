import { useAppSettingsStore, pickFaviconForTheme, resolveAssetUrl } from '../store/app-settings.store';

let manifestBlobUrl: string | null = null;

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

function mimeForUrl(url: string): string {
  if (url.endsWith('.svg')) return 'image/svg+xml';
  if (url.endsWith('.webp')) return 'image/webp';
  if (url.endsWith('.png')) return 'image/png';
  return 'image/png';
}

function isSvgUrl(url: string): boolean {
  return url.endsWith('.svg') || mimeForUrl(url) === 'image/svg+xml';
}

/** Manifests loaded from blob: URLs require absolute URLs for start_url and icons. */
function toAbsoluteUrl(path: string): string {
  if (!path) return `${window.location.origin}/`;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return new URL(path, window.location.origin).href;
}

function probeImageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function manifestIconEntry(
  url: string,
  _fallbackSize: number,
  purpose?: string,
): Promise<ManifestIcon | null> {
  if (!url.trim()) return null;
  const src = toAbsoluteUrl(resolveAssetUrl(url));
  const type = mimeForUrl(src);
  if (isSvgUrl(src)) {
    return { src, sizes: 'any', type, ...(purpose ? { purpose } : {}) };
  }
  const dims = await probeImageSize(src);
  if (!dims) return null;
  return { src, sizes: `${dims.width}x${dims.height}`, type, ...(purpose ? { purpose } : {}) };
}

function applyFaviconLink(href: string, mode: 'light' | 'dark') {
  const base = resolveAssetUrl(href);
  const busted = `${base}${base.includes('?') ? '&' : '?'}cz-theme=${mode}&t=${Date.now()}`;

  document
    .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((node) => node.remove());

  for (const rel of ['icon', 'shortcut icon'] as const) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = busted;
    link.type = mimeForUrl(base);
    document.head.appendChild(link);
  }
}

/** Patch manifest with dedicated PWA icons (not tab favicons — Edge validates declared sizes). */
export async function syncManifestIcons() {
  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifestLink) return;

  const baseHref = manifestLink.dataset.czManifestBase || manifestLink.href;
  if (!manifestLink.dataset.czManifestBase) {
    manifestLink.dataset.czManifestBase = baseHref.split('?')[0];
  }

  try {
    const res = await fetch(manifestLink.dataset.czManifestBase);
    if (!res.ok) return;
    const manifest = await res.json();
    const { pwaIcon192Url, pwaIcon512Url } = useAppSettingsStore.getState();

    manifest.start_url = toAbsoluteUrl(manifest.start_url || '/');
    if (manifest.scope) manifest.scope = toAbsoluteUrl(manifest.scope);

    const icons: ManifestIcon[] = [];
    const icon192Src = resolveAssetUrl(pwaIcon192Url);
    const icon512Src = resolveAssetUrl(pwaIcon512Url);
    const icon192 = await manifestIconEntry(pwaIcon192Url, 192);
    const icon192Maskable = isSvgUrl(icon192Src) ? null : await manifestIconEntry(pwaIcon192Url, 192, 'maskable');
    const icon512 = await manifestIconEntry(pwaIcon512Url, 512, 'any');
    const icon512Maskable = isSvgUrl(icon512Src) ? null : await manifestIconEntry(pwaIcon512Url, 512, 'maskable');
    if (icon192) icons.push(icon192);
    if (icon192Maskable) icons.push(icon192Maskable);
    if (icon512 && icon512.src !== icon192?.src) {
      icons.push(icon512);
      if (icon512Maskable) icons.push(icon512Maskable);
    }
    if (icons.length === 0) {
      icons.push(
        { src: toAbsoluteUrl('/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: toAbsoluteUrl('/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: toAbsoluteUrl('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: toAbsoluteUrl('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: toAbsoluteUrl('/favicon.svg'), sizes: 'any', type: 'image/svg+xml' },
      );
    }
    manifest.icons = icons;

    if (manifest.shortcuts) {
      manifest.shortcuts = manifest.shortcuts.map((s: { name: string; url: string; icons?: unknown[] }) => ({
        ...s,
        url: toAbsoluteUrl(s.url),
      }));
    }

    if (manifestBlobUrl) URL.revokeObjectURL(manifestBlobUrl);
    manifestBlobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }),
    );
    manifestLink.href = manifestBlobUrl;
  } catch {
    /* manifest optional in dev */
  }
}

/** Swap tab favicon for the active light/dark theme. */
export function syncFaviconForTheme(mode?: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const resolved =
    mode ??
    (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const { faviconLightUrl, faviconDarkUrl } = useAppSettingsStore.getState();
  const href = pickFaviconForTheme(faviconLightUrl, faviconDarkUrl, resolved);
  applyFaviconLink(href, resolved);
}
