/** Chart palette derived from published theme CSS variables (Appearance Studio). */

const FALLBACK = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

function readVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function getChartPalette(): string[] {
  return [
    readVar('--color-primary', '#059669'),
    readVar('--color-accent', '#6366F1'),
    readVar('--color-warning', '#f59e0b'),
    readVar('--color-error', '#ef4444'),
    readVar('--color-secondary', '#ea580c'),
    readVar('--color-info-text', '#1d4ed8'),
    readVar('--color-success', '#10b981'),
    readVar('--color-primary-light', '#10b981'),
  ];
}

export function getChartColor(index: number): string {
  const palette = getChartPalette();
  return palette[index % palette.length] ?? FALLBACK[index % FALLBACK.length];
}

export const CHART_STROKE_PRIMARY = () => readVar('--color-primary', '#059669');
export const CHART_STROKE_ERROR = () => readVar('--color-error', '#ef4444');
