/**
 * Subtle bracket animation hooks — focused, timing-free coverage.
 *
 * These assertions verify the CSS class contracts (entrance stagger, hover
 * transform hook, current-player emphasis) and the presence of the
 * prefers-reduced-motion protection. They deliberately avoid timing/pixel
 * assertions, which would be brittle in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { TournamentBracket } from '../TournamentBracket';
import { MatchCard } from '../MatchCard';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k) }),
}));

const knockout = { id: 1, name: 'Cup', format: 'knockout', bracket_type_name: 'Single Elimination' };

const matches = [
  {
    id: 1, round: 1, round_name: 'Semi Final', bracket_position: 0,
    player1_id: 10, player2_id: 11, player1_name: 'Me', player2_name: 'Rival',
    status: 'completed', score_summary: '2 - 0',
  },
  {
    id: 2, round: 2, round_name: 'Final', bracket_position: 0,
    player1_id: 10, player2_id: 12, player1_name: 'Me', player2_name: 'Other',
    status: 'scheduled',
  },
] as unknown as TournamentMatchNode[];

beforeEach(() => cleanup());

describe('TournamentBracket subtle animations', () => {
  it('applies the staggered entrance class to interactive bracket columns', () => {
    const { container } = render(
      <TournamentBracket tournament={knockout as any} matches={matches} currentUserId={10} />,
    );
    const cols = Array.from(container.querySelectorAll<HTMLElement>('.cz-bracket-col'));
    expect(cols.length).toBe(2);
    expect(cols[0].style.animationDelay).toBe('0ms');
    expect(cols[1].style.animationDelay).toBe('60ms');
  });

  it('never animates the print-only bracket', () => {
    const { container } = render(
      <TournamentBracket tournament={knockout as any} matches={matches} printOnly />,
    );
    expect(container.querySelectorAll('.cz-bracket-col').length).toBe(0);
  });

  it('marks match cards with the animation hook and subtle transform utilities', () => {
    const { container } = render(<MatchCard match={matches[0]} currentUserId={10} />);
    const card = container.querySelector<HTMLElement>('.cz-match-card');
    expect(card).toBeTruthy();
    expect(card!.className).toContain('hover:-translate-y-px');
    expect(card!.className).toContain('active:translate-y-0');
    expect(card!.className).toContain('transition-[transform,border-color]');
  });

  it('emphasises only the current player and never continuously', () => {
    const { container } = render(<MatchCard match={matches[0]} currentUserId={10} />);
    // player1 (id 10) is the current user; player2 is not.
    expect(container.querySelectorAll('.cz-player-emphasis').length).toBe(1);
  });

  it('protects reduced-motion users in the stylesheet', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/cz-bracket-col/);
    expect(reduced).toMatch(/cz-player-emphasis/);
    expect(reduced).toMatch(/cz-match-card/);
    // The bracket entrance is a single, finite animation (no pulse/loop).
    expect(css).toMatch(/\.cz-bracket-col\s*{[^}]*animation:\s*cz-bracket-rise/);
    expect(css).not.toMatch(/\.cz-bracket-col\s*{[^}]*infinite/);
  });
});
