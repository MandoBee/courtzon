/**
 * Tournament print view — focused, print-only coverage.
 *
 * Verifies the shared TournamentPrintView renders the shared print bracket
 * (no animated/hover chrome) and that the print stylesheet keeps the required
 * readability/pagination contracts. Deliberately avoids browser print-render
 * assertions, which are not reproducible in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { TournamentPrintView } from '../TournamentPrintView';
import type { TournamentBracketInfo, TournamentMatchNode } from '../../../types/tournamentBracket';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k) }),
}));

const tournament = {
  id: 1, name: 'City Open', sport_name: 'Padel',
  bracket_type_name: 'Single Elimination', status: 'running', start_date: '2026-10-01',
} as unknown as TournamentBracketInfo;

const matches = [
  {
    id: 1, round: 1, round_name: 'Semi Final', bracket_position: 0,
    player1_id: 10, player2_id: 11, player1_name: 'Alpha', player2_name: 'Bravo',
    status: 'completed', score_summary: '2 - 0',
  },
  {
    id: 2, round: 2, round_name: 'Final', bracket_position: 0,
    player1_id: 10, player2_id: 12, player1_name: 'Alpha', player2_name: 'Charlie',
    status: 'scheduled',
  },
] as unknown as TournamentMatchNode[];

beforeEach(() => cleanup());

describe('TournamentPrintView', () => {
  it('renders the tournament header, the shared bracket and the match result', () => {
    const { container } = render(
      <TournamentPrintView tournament={tournament} matches={matches} participants={[]} />,
    );

    expect(container.querySelector('.print-root')).toBeTruthy();
    expect(container.querySelector('.print-header')).toBeTruthy();
    expect(screen.getByText('City Open')).toBeTruthy();
    expect(screen.getByText('Padel · Single Elimination · running')).toBeTruthy();
    expect(container.querySelectorAll('.cz-match-card').length).toBe(2);
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    // Numeric, colour-independent result is preserved.
    expect(screen.getAllByText('2 - 0').length).toBeGreaterThan(0);
  });

  it('uses the shared bracket in print mode (no screen entrance animation)', () => {
    const { container } = render(
      <TournamentPrintView tournament={tournament} matches={matches} participants={[]} />,
    );
    // The animated entrance class is only applied to the interactive bracket.
    expect(container.querySelectorAll('.cz-bracket-col').length).toBe(0);
    // No interactive footer controls are injected by the print view.
    expect(screen.queryByText('tournamentBracket.tbdHint')).toBeNull();
  });

  it('keeps the print stylesheet readable and pagination-safe', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const print = css.slice(css.indexOf('@media print'));

    // Match cards stay distinguishable and are not split across pages.
    expect(print).toMatch(/\.cz-print-area \.cz-match-card[^}]*border:\s*1px solid #000/);
    expect(print).toMatch(/\.cz-print-area \.cz-match-card[^}]*break-inside:\s*avoid/);
    // No motion in print.
    expect(print).toMatch(/\.cz-print-area,\s*\.cz-print-area \*\s*{[^}]*animation:\s*none/);
    // Columns share the page width (no horizontal overflow).
    expect(print).toMatch(/\.print-rounds > div\s*{[^}]*flex:\s*1 1 0/);
    // Names wrap instead of being clipped by `truncate`.
    expect(print).toMatch(/\.cz-print-area \.truncate[^}]*white-space:\s*normal/);
    // Round headers are black and separated.
    expect(print).toMatch(/\.cz-print-area h4[^}]*border-bottom:\s*1px solid #000/);
  });
});
