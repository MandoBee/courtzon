import { describe, it, expect } from 'vitest';
import {
  TOURNAMENT_STATUS_COLORS,
  TOURNAMENT_REG_STATUS_COLORS,
  PLAYER_TOURNAMENT_STATUS_BADGE,
} from '../statusBadges';

/**
 * TUX-05 recurrence guard — asserts that no tournament status-badge definition
 * resolves its background and its foreground to the SAME theme token.
 *
 * The original defect was `bg-gray-100 text-gray-700` where tailwind.config.js
 * maps BOTH gray-100 and gray-700 to `var(--color-border)`, producing text on
 * an identical background (effectively invisible).
 *
 * The token map below mirrors frontend/tailwind.config.js
 * `theme.extend.colors`. Only the palettes used by tournament status badges are
 * listed, and only steps that are actually mapped are included: an unmapped
 * step (e.g. blue-700 / purple-700 / teal-700) intentionally resolves to
 * `undefined` and is skipped — that is the separate off-palette finding (F-11),
 * not a same-token collision.
 */
const TOKENS: Record<string, Record<string, string>> = {
  gray: {
    50: '--color-bg',
    100: '--color-border',
    200: '--color-border',
    300: '--color-text-muted',
    400: '--color-text-muted',
    500: '--color-text-muted',
    600: '--color-text',
    700: '--color-border',
    800: '--color-surface',
    900: '--color-text',
    950: '--color-bg',
  },
  green: {
    100: '--color-success-bg',
    400: '--color-success-text',
    500: '--color-success',
    600: '--color-success-text',
    700: '--color-success-text',
    900: '--color-success-bg',
  },
  red: {
    100: '--color-error-bg',
    400: '--color-error-text',
    500: '--color-error',
    600: '--color-error-text',
    700: '--color-error-text',
    900: '--color-error-bg',
  },
  blue: {
    50: '--color-info-bg',
    100: '--color-info-bg',
    200: '--color-info-bg',
    400: '--color-info-text',
    500: '--color-info-text',
    600: '--color-info-text',
    800: '--color-info-bg',
    900: '--color-info-bg',
  },
  yellow: {
    100: '--color-warning-bg',
    400: '--color-warning-text',
    500: '--color-warning',
    600: '--color-warning-text',
    700: '--color-warning-text',
    900: '--color-warning-bg',
  },
  amber: {
    100: '--color-warning-bg',
    400: '--color-warning-text',
    500: '--color-warning',
    600: '--color-warning-text',
    700: '--color-warning-text',
    900: '--color-warning-bg',
  },
};

const STEP_RE = /^(?:bg|text)-([a-z]+)-(\d{2,3})$/;

function token(cls?: string): string | undefined {
  if (!cls) return undefined;
  const m = STEP_RE.exec(cls);
  if (!m) return undefined;
  return TOKENS[m[1]]?.[m[2]];
}

function classOf(badge: string, prefix: 'bg-' | 'text-'): string | undefined {
  return badge.split(/\s+/).find((c) => c.startsWith(prefix));
}

function resolved(badge: string): { bg?: string; text?: string } {
  return { bg: token(classOf(badge, 'bg-')), text: token(classOf(badge, 'text-')) };
}

const MAPS: Array<{ name: string; map: Record<string, string> }> = [
  { name: 'admin TOURNAMENT_STATUS_COLORS', map: TOURNAMENT_STATUS_COLORS },
  { name: 'admin TOURNAMENT_REG_STATUS_COLORS', map: TOURNAMENT_REG_STATUS_COLORS },
  { name: 'player PLAYER_TOURNAMENT_STATUS_BADGE', map: PLAYER_TOURNAMENT_STATUS_BADGE },
];

describe('TUX-05 — tournament status badge token-distinctness', () => {
  it('detector flags the known collision (self-check: bg==fg)', () => {
    const bad = resolved('bg-gray-100 text-gray-700');
    expect(bad.bg).toBe('--color-border');
    expect(bad.text).toBe('--color-border');
    expect(bad.bg).toBe(bad.text);
  });

  it('no definition uses the colliding text-gray-700 step', () => {
    for (const { name, map } of MAPS) {
      for (const [status, badge] of Object.entries(map)) {
        expect(badge, `${name}.${status} must not use text-gray-700`).not.toContain('text-gray-700');
      }
    }
  });

  it('every definition resolves to distinct background/foreground tokens', () => {
    for (const { name, map } of MAPS) {
      for (const [status, badge] of Object.entries(map)) {
        const { bg, text } = resolved(badge);
        if (bg && text) {
          expect(bg, `${name}.${status} ("${badge}") — bg and fg resolve to the same token`).not.toBe(text);
        }
      }
    }
  });

  it('disqualified explicitly uses the readable gray-600 foreground', () => {
    expect(TOURNAMENT_REG_STATUS_COLORS.disqualified).toBe('bg-gray-100 text-gray-600');
  });
});
