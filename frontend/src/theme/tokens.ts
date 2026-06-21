// Single source of truth for mapping design-token keys <-> CSS custom properties
// and for grouping tokens in the Appearance Studio editor.

import { COMPONENT_STYLE_DEFAULTS } from './component-styles';
import { LANDING_STYLE_DEFAULTS } from './landing-styles';

export type TokenType = 'color' | 'size' | 'radius' | 'font' | 'shadow' | 'spacing' | 'other';

export interface EditorToken {
  id: number;
  token_key: string;
  token_type: TokenType;
  category: string | null;
  description: string | null;
  default_value: string;
  current_value: string | null;
  draft_value: string | null;
  current_value_dark?: string | null;
  draft_value_dark?: string | null;
  is_published: number | boolean;
  role_editable?: number | boolean;
}

export interface PublishedThemePayload {
  /** Non–mode-specific tokens (components, brand radii, fonts, etc.) */
  shared: Record<string, string>;
  /** Semantic / surface colors for light mode (:root) */
  light: Record<string, string>;
  /** Semantic / surface colors for dark mode (html.dark) */
  dark: Record<string, string>;
}

export interface ThemeVersion {
  id: number;
  label: string | null;
  published_at: string;
  published_by: number | null;
  published_by_name: string | null;
}

/** The bare Google-font family name token; loaded via an injected <link>. */
export const GOOGLE_FONT_TOKEN_KEY = 'font-google-family';

/** A design token's CSS custom-property name, e.g. `color-primary` -> `--color-primary`. */
export function cssVarFor(tokenKey: string): string {
  return `--${tokenKey}`;
}

/**
 * Whether a token key maps to a live CSS custom property the app actually reads.
 *
 * The canonical tokens are kebab-case (`color-primary`, `radius-sm`, …) and are
 * the only ones referenced via `var(--…)` in the app. The DB also carries
 * legacy snake_case seed keys (`primary_color`, `border_radius`, `sidebar_width`,
 * `logo_url`, …) that map to no CSS var — they only clutter the editor. We hide
 * those from the Appearance Studio and skip applying them at runtime.
 */
export function isCssVarToken(tokenKey: string): boolean {
  return !tokenKey.includes('_');
}

/** The live value for a token: draft beats current beats default. */
export function effectiveValue(t: EditorToken): string {
  return t.draft_value ?? t.current_value ?? t.default_value;
}

let lastThemeSignature = '';
let lastPublishedTheme: PublishedThemePayload | null = null;

const LIGHT_STYLE_ID = 'cz-theme-light-vars';
const DARK_STYLE_ID = 'cz-theme-dark-vars';
const SHARED_STYLE_ID = 'cz-theme-shared-vars';

/** Tokens controlled by :root / .dark in index.css — not overwritten by Appearance Studio. */
export const COLOR_SCHEME_TOKEN_KEYS = new Set([
  'color-bg',
  'color-surface',
  'color-text',
  'color-text-muted',
  'color-border',
  'color-primary-bg',
  'color-success-bg',
  'color-success-text',
  'color-warning-bg',
  'color-warning-text',
  'color-error-bg',
  'color-error-text',
  'color-info-bg',
  'color-info-text',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
  'shadow-xl',
]);

/** Fixed light palette for Appearance Studio preview (ignores app dark mode). */
export const PREVIEW_SEMANTIC_LIGHT: Record<string, string> = {
  'color-primary': '#059669',
  'color-primary-dark': '#047857',
  'color-primary-light': '#10B981',
  'color-primary-bg': '#ECFDF5',
  'color-secondary': '#EA580C',
  'color-accent': '#6366F1',
  'color-bg': '#F9FAFB',
  'color-surface': '#FFFFFF',
  'color-text': '#111827',
  'color-text-muted': '#6B7280',
  'color-border': '#E5E7EB',
  'color-success': '#10B981',
  'color-warning': '#F59E0B',
  'color-error': '#EF4444',
  'color-success-bg': '#DCFCE7',
  'color-success-text': '#15803D',
  'color-warning-bg': '#FEF3C7',
  'color-warning-text': '#B45309',
  'color-error-bg': '#FEE2E2',
  'color-error-text': '#B91C1C',
  'color-info-bg': '#DBEAFE',
  'color-info-text': '#1D4ED8',
  'shadow-sm': '0 1px 2px rgba(0,0,0,0.04)',
  'shadow-md': '0 4px 12px rgba(0,0,0,0.06)',
  'shadow-lg': '0 12px 40px rgba(0,0,0,0.08)',
  'shadow-xl': '0 20px 60px rgba(0,0,0,0.12)',
};

/** Fixed dark palette for Appearance Studio preview. */
export const PREVIEW_SEMANTIC_DARK: Record<string, string> = {
  'color-primary': '#10B981',
  'color-primary-dark': '#059669',
  'color-primary-light': '#34D399',
  'color-primary-bg': '#064E3B',
  'color-secondary': '#F97316',
  'color-accent': '#818CF8',
  'color-bg': '#0F172A',
  'color-surface': '#1E293B',
  'color-text': '#F1F5F9',
  'color-text-muted': '#94A3B8',
  'color-border': '#334155',
  'color-success-bg': '#064E3B',
  'color-success-text': '#6EE7B7',
  'color-warning-bg': '#78350F',
  'color-warning-text': '#FCD34D',
  'color-error-bg': '#7F1D1D',
  'color-error-text': '#FCA5A5',
  'color-info-bg': '#1E3A8A',
  'color-info-text': '#93C5FD',
  'shadow-sm': '0 1px 2px rgba(0,0,0,0.2)',
  'shadow-md': '0 4px 12px rgba(0,0,0,0.3)',
  'shadow-lg': '0 12px 40px rgba(0,0,0,0.4)',
  'shadow-xl': '0 20px 60px rgba(0,0,0,0.5)',
};

/** Default dark values when DB has no current_value_dark yet. */
export const DARK_DEFAULTS: Record<string, string> = { ...PREVIEW_SEMANTIC_DARK };

export function effectiveValueDark(t: EditorToken): string {
  return t.draft_value_dark ?? t.current_value_dark ?? DARK_DEFAULTS[t.token_key] ?? t.default_value;
}

/** Tokens stored separately for light vs dark theme. */
export function isDualModeThemeToken(t: Pick<EditorToken, 'token_key' | 'token_type' | 'category'>): boolean {
  if (!isCssVarToken(t.token_key)) return false;
  if ((HERO_THEME_KEYS as readonly string[]).includes(t.token_key)) return true;
  if ((THEME_COLOR_KEYS as readonly string[]).includes(t.token_key)) return true;
  if (COLOR_SCHEME_TOKEN_KEYS.has(t.token_key)) return true;
  const cat = (t.category || '').toLowerCase();
  if (t.token_type === 'color' && (cat === 'semantic' || cat === 'tint')) return true;
  return false;
}

/** Semantic tokens that can differ between light and dark previews. */
export function isModeSpecificSemanticToken(tokenKey: string): boolean {
  return isDualModeThemeToken({ token_key: tokenKey, token_type: 'color', category: 'semantic' });
}

/** Landing hero band — separate light/dark values (gradient + text on gradient). */
export const HERO_THEME_KEYS = [
  'gradient-hero',
  'hero-title-color',
  'hero-subtitle-color',
] as const;

export const HERO_THEME_LABELS: Record<string, string> = {
  'gradient-hero': 'Hero background gradient',
  'hero-title-color': 'Hero title text',
  'hero-subtitle-color': 'Hero subtitle text (fixes grey-on-green)',
};

export const PREVIEW_HERO_LIGHT: Record<string, string> = {
  'gradient-hero': 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)',
  'hero-title-color': '#FFFFFF',
  'hero-subtitle-color': '#E2E8F0',
};

export const PREVIEW_HERO_DARK: Record<string, string> = {
  'gradient-hero': 'linear-gradient(135deg, #022C22 0%, #064E3B 50%, #065F46 100%)',
  'hero-title-color': '#F1F5F9',
  'hero-subtitle-color': '#CBD5E1',
};

/** All keys edited in the light/dark theme colors panel. */
export const THEME_COLOR_KEYS = [
  'color-bg',
  'color-surface',
  'color-text',
  'color-text-muted',
  'color-border',
  'color-success-bg',
  'color-success-text',
  'color-warning-bg',
  'color-warning-text',
  'color-error-bg',
  'color-error-text',
  'color-info-bg',
  'color-info-text',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
  'shadow-xl',
] as const;

export const THEME_COLOR_LABELS: Record<string, string> = {
  'color-bg': 'App background',
  'color-surface': 'Card / surface background',
  'color-text': 'Primary text',
  'color-text-muted': 'Muted text',
  'color-border': 'Border color',
  'color-success-bg': 'Success badge background',
  'color-success-text': 'Success badge text',
  'color-warning-bg': 'Warning badge background',
  'color-warning-text': 'Warning badge text',
  'color-error-bg': 'Error badge background',
  'color-error-text': 'Error badge text',
  'color-info-bg': 'Info badge background',
  'color-info-text': 'Info badge text',
  'shadow-sm': 'Small shadow',
  'shadow-md': 'Medium shadow',
  'shadow-lg': 'Large shadow',
  'shadow-xl': 'Extra-large shadow',
};

/** Editor sections for the light/dark color panel. */
export const THEME_COLOR_GROUPS: { label: string; description: string; keys: string[] }[] = [
  {
    label: 'Surfaces',
    description: 'App background and card surfaces',
    keys: ['color-bg', 'color-surface'],
  },
  {
    label: 'Text',
    description: 'Primary and muted text',
    keys: ['color-text', 'color-text-muted'],
  },
  {
    label: 'Borders',
    description: 'Dividers and outlines',
    keys: ['color-border'],
  },
  {
    label: 'Status tints',
    description: 'Badge / pill backgrounds and text',
    keys: [
      'color-success-bg',
      'color-success-text',
      'color-warning-bg',
      'color-warning-text',
      'color-error-bg',
      'color-error-text',
      'color-info-bg',
      'color-info-text',
    ],
  },
  {
    label: 'Shadows',
    description: 'Elevation (box-shadow)',
    keys: ['shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl'],
  },
];

export type ThemeEditScope = 'both' | 'light' | 'dark';

/** Resolve `var(--other-token)` against the preview variable map (few passes). */
function resolvePreviewVarRefs(vars: Record<string, string>): Record<string, string> {
  const out = { ...vars };
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const [prop, value] of Object.entries(out)) {
      const m = value.trim().match(/^var\((--[a-zA-Z0-9-]+)\)$/);
      if (!m) continue;
      const target = m[1];
      const resolved = out[target];
      if (resolved && resolved !== value) {
        out[prop] = resolved;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** Live preview: shared draft + optional per-mode semantic overrides + component tokens. */
export function mergePreviewStyles(
  draft: Record<string, string>,
  mode: 'light' | 'dark',
  modeDraft: Record<string, string> = {},
): Record<string, string> {
  const semanticBase = mode === 'light' ? PREVIEW_SEMANTIC_LIGHT : PREVIEW_SEMANTIC_DARK;
  const heroBase = mode === 'light' ? PREVIEW_HERO_LIGHT : PREVIEW_HERO_DARK;
  const vars: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(semanticBase)) {
    vars[cssVarFor(key)] = modeDraft[key] ?? fallback;
  }
  for (const [key, fallback] of Object.entries(heroBase)) {
    vars[cssVarFor(key)] = modeDraft[key] ?? fallback;
  }
  // Brand / radius / typography + component style tokens from the editor draft.
  for (const [key, value] of Object.entries(draft)) {
    if (key === GOOGLE_FONT_TOKEN_KEY) continue;
    if (!isCssVarToken(key)) continue;
    if (COLOR_SCHEME_TOKEN_KEYS.has(key)) continue;
    if (isModeSpecificSemanticToken(key)) continue;
    vars[cssVarFor(key)] = value;
  }
  // Component tab: ensure every --button-*, --form-control-*, etc. is on the preview root.
  for (const [key, defaultVal] of Object.entries(COMPONENT_STYLE_DEFAULTS)) {
    const prop = cssVarFor(key);
    if (draft[key] !== undefined) vars[prop] = draft[key];
    else if (vars[prop] === undefined) vars[prop] = defaultVal;
  }
  for (const [key, defaultVal] of Object.entries(LANDING_STYLE_DEFAULTS)) {
    const prop = cssVarFor(key);
    if (draft[key] !== undefined) vars[prop] = draft[key];
    else if (vars[prop] === undefined) vars[prop] = defaultVal;
  }
  return resolvePreviewVarRefs(vars);
}

/** Build a CSS declaration block for scoped Appearance Studio preview panels. */
export function previewVarsToCssBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([prop, value]) => `${prop}: ${value.replace(/;/g, '')};`)
    .join(' ');
}

function schemeCssBlock(entries: [string, string][]): string {
  return entries.map(([k, v]) => `${cssVarFor(k)}: ${v};`).join(' ');
}

function upsertThemeStyle(id: string, cssText: string): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!cssText) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = cssText;
}

function applyLightScheme(light: Record<string, string>): void {
  const entries = Object.entries(light).filter(([k]) => isCssVarToken(k));
  const body = schemeCssBlock(entries);
  upsertThemeStyle(
    LIGHT_STYLE_ID,
    body ? `:root, html.light, html:not(.dark) { ${body} }` : '',
  );
}

function applyDarkScheme(dark: Record<string, string>): void {
  const entries = Object.entries(dark).filter(([k]) => isCssVarToken(k));
  const body = schemeCssBlock(entries);
  upsertThemeStyle(DARK_STYLE_ID, body ? `html.dark, .dark { ${body} }` : '');
}

function applySharedScheme(shared: Record<string, string>): void {
  const entries = Object.entries(shared).filter(
    ([k]) => k !== GOOGLE_FONT_TOKEN_KEY && isCssVarToken(k) && !COLOR_SCHEME_TOKEN_KEYS.has(k),
  );
  const body = schemeCssBlock(entries);
  upsertThemeStyle(SHARED_STYLE_ID, body ? `:root { ${body} }` : '');
}

/** Clears published theme injections (e.g. logout / reset). */
export function clearPublishedTheme(): void {
  lastPublishedTheme = null;
  lastThemeSignature = '';
  upsertThemeStyle(LIGHT_STYLE_ID, '');
  upsertThemeStyle(DARK_STYLE_ID, '');
  upsertThemeStyle(SHARED_STYLE_ID, '');
}

/** @deprecated No-op: toggling light/dark must not wipe published schemes. */
export function clearColorSchemeInlineTokens(): void {
  /* kept for callers; published theme uses style tags, not inline :root overrides */
}

/** Apply published theme: shared tokens + per-mode color schemes. */
export function applyPublishedTheme(payload: PublishedThemePayload | Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const normalized: PublishedThemePayload =
    'shared' in payload && 'light' in payload && 'dark' in payload
      ? (payload as PublishedThemePayload)
      : { shared: payload as Record<string, string>, light: {}, dark: {} };

  const signature = JSON.stringify(normalized);
  if (signature === lastThemeSignature) return;
  lastThemeSignature = signature;
  lastPublishedTheme = normalized;

  applySharedScheme(normalized.shared);
  loadGoogleFont(normalized.shared[GOOGLE_FONT_TOKEN_KEY]);
  applyLightScheme(normalized.light);
  applyDarkScheme(normalized.dark);
}

export function getLastPublishedTheme(): PublishedThemePayload | null {
  return lastPublishedTheme;
}

/** @deprecated Use applyPublishedTheme — kept for callers passing a flat map. */
export function applyThemeMap(map: Record<string, string>): void {
  applyPublishedTheme({ shared: map, light: {}, dark: {} });
}

/** Inject (or update) a Google Fonts <link> for the selected family. */
export function loadGoogleFont(family?: string): void {
  if (typeof document === 'undefined') return;
  const id = 'cz-google-font';
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  const trimmed = (family || '').trim();
  // System / generic stacks don't need a Google Fonts request.
  const SKIP = new Set(['', 'system-ui', 'sans-serif', 'serif', 'monospace']);
  if (SKIP.has(trimmed.toLowerCase())) {
    if (existing) existing.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(trimmed).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** Ordered groups for the editor, keyed by token category with a friendly label. */
export const TOKEN_GROUPS: { category: string; label: string; description: string }[] = [
  { category: 'brand', label: 'Brand Colors', description: 'Primary, secondary and accent colors' },
  { category: 'semantic', label: 'Semantic Colors', description: 'Surfaces, text, borders and status colors' },
  { category: 'tint', label: 'Status tints', description: 'Soft badge backgrounds + text for success / warning / error / info pills' },
  { category: 'typography', label: 'Typography', description: 'Fonts loaded across the app' },
  { category: 'radius', label: 'Corner Radius', description: 'Roundness of buttons, cards and inputs' },
  { category: 'shadow', label: 'Shadows', description: 'Elevation / depth' },
  { category: 'gradient', label: 'Gradients', description: 'Hero and brand gradients' },
];

/** A curated list of Google Fonts offered in the typography dropdown. */
export const GOOGLE_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Nunito',
  'Work Sans',
  'Manrope',
  'DM Sans',
  'Source Sans 3',
  'Plus Jakarta Sans',
];
