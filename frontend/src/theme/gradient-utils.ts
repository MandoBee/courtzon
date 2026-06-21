/** Parse / build CSS `linear-gradient(…deg, …)` for Appearance Studio. */

export const DEFAULT_GRADIENTS: Record<string, string> = {
  'gradient-hero': 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)',
  'gradient-primary': 'linear-gradient(135deg, #059669, #10B981)',
};

const COLOR_RE = /(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.,\s%]+\)|var\(--[a-zA-Z0-9-]+\))/g;

export interface ParsedLinearGradient {
  angle: number;
  colors: string[];
}

export function parseLinearGradient(css: string): ParsedLinearGradient | null {
  const trimmed = css.trim();
  if (!trimmed.toLowerCase().startsWith('linear-gradient')) return null;

  const angleMatch = trimmed.match(/linear-gradient\s*\(\s*(\d+(?:\.\d+)?)\s*deg/i);
  const angle = angleMatch ? Number(angleMatch[1]) : 135;

  const bodyMatch = trimmed.match(/linear-gradient\s*\(\s*\d+(?:\.\d+)?\s*deg\s*,\s*(.+)\)\s*$/i);
  if (!bodyMatch) {
    const simple = [...trimmed.matchAll(COLOR_RE)].map((m) => m[1]);
    if (simple.length >= 2) return { angle, colors: simple };
    return null;
  }

  const colors = [...bodyMatch[1].matchAll(COLOR_RE)].map((m) => m[1]);
  if (colors.length < 2) return null;
  return { angle, colors: colors.slice(0, 4) };
}

export function buildLinearGradient(angle: number, colors: string[]): string {
  const safe = colors.filter(Boolean);
  if (safe.length < 2) {
    return DEFAULT_GRADIENTS['gradient-primary'];
  }
  if (safe.length === 2) {
    return `linear-gradient(${Math.round(angle)}deg, ${safe[0]} 0%, ${safe[1]} 100%)`;
  }
  const stops = safe.map((color, i) => {
    const at = Math.round((i / (safe.length - 1)) * 100);
    return `${color} ${at}%`;
  });
  return `linear-gradient(${Math.round(angle)}deg, ${stops.join(', ')})`;
}

export function gradientLabel(key: string): string {
  if (key === 'gradient-hero') return 'Hero band (landing hero, CTA, stats)';
  if (key === 'gradient-primary') return 'Brand gradient (buttons, logos)';
  return key;
}
