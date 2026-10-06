/**
 * Bracket match presentation — score dedup, winner/loser treatment, initials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MatchCard } from '../MatchCard';
import { MatchDetailsDrawer } from '../MatchDetailsDrawer';
import { playerInitials, resolveWinnerSide } from '../PlayerAvatar';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k) }),
}));

const WINNER_LABEL = 'tournamentBracket.winner';

function m(partial: Partial<TournamentMatchNode> & { id: number }): TournamentMatchNode {
  return { tournament_id: 1, ...partial } as TournamentMatchNode;
}

const completed = m({
  id: 1, round: 1, bracket_position: 0,
  player1_id: 10, player2_id: 11, player1_name: 'Alpha', player2_name: 'Bravo',
  status: 'completed', score_summary: '2 - 0', winner_id: 10,
});

beforeEach(() => cleanup());

describe('playerInitials', () => {
  it('handles two-word, one-word, separators and missing names', () => {
    expect(playerInitials('Alpha Bravo')).toBe('AB');
    expect(playerInitials('Alpha')).toBe('A');
    expect(playerInitials('  alpha   bravo  ')).toBe('AB');
    expect(playerInitials('Alpha / Beta')).toBe('AB');
    expect(playerInitials('')).toBe('?');
    expect(playerInitials(null)).toBe('?');
    expect(playerInitials(undefined)).toBe('?');
    expect(playerInitials('123 ???')).toBe('1');
  });
});

describe('resolveWinnerSide', () => {
  it('resolves from winner_id, participant fallback, and none', () => {
    expect(resolveWinnerSide(m({ id: 1, player1_id: 10, player2_id: 11, winner_id: 10 }))).toBe('p1');
    expect(resolveWinnerSide(m({ id: 1, player1_id: 10, player2_id: 11, winner_id: 11 }))).toBe('p2');
    expect(resolveWinnerSide(m({ id: 1, participant1_id: 5, participant2_id: 6, winner_participant_id: 6 }))).toBe('p2');
    expect(resolveWinnerSide(m({ id: 1, player1_id: 10, player2_id: 11 }))).toBe('none');
  });
});

describe('MatchCard — single score + winner/loser + initials', () => {
  it('renders the score exactly once', () => {
    render(<MatchCard match={completed} />);
    expect(screen.getAllByText('2 - 0')).toHaveLength(1);
  });

  it('renders multi-set scores once and does not split them naively', () => {
    const sets = m({
      id: 2, round: 1, player1_id: 10, player2_id: 11, player1_name: 'Alpha', player2_name: 'Bravo',
      status: 'completed', score_summary: '6-4 6-3', winner_id: 10,
    });
    render(<MatchCard match={sets} />);
    expect(screen.getAllByText('6-4 6-3')).toHaveLength(1);
    expect(screen.queryByText('6-4')).toBeNull();
  });

  it('emphasises the winner and de-emphasises the loser (not disabled)', () => {
    const { container } = render(<MatchCard match={completed} />);
    expect(screen.getAllByText(WINNER_LABEL)).toHaveLength(1);

    const winnerRow = screen.getByText('Alpha').closest('div') as HTMLElement;
    const loserRow = screen.getByText('Bravo').closest('div') as HTMLElement;
    expect(winnerRow.className).toContain('font-semibold');
    expect(loserRow.className).toContain('text-[var(--color-text-muted)]');
    // Loser is dimmed, never hidden.
    expect(loserRow.style.display).not.toBe('none');

    // Initials avatars are rendered for both sides (decorative).
    const avatars = Array.from(container.querySelectorAll('span[aria-hidden="true"]')).map((el) => el.textContent);
    expect(avatars).toEqual(['A', 'B']);
  });

  it('has no winner treatment for a draw or an unplayed match', () => {
    const draw = m({ id: 3, round: 1, player1_id: 10, player2_id: 11, player1_name: 'Alpha', player2_name: 'Bravo', status: 'completed', score_summary: '1 - 1' });
    const { rerender } = render(<MatchCard match={draw} />);
    expect(screen.queryAllByText(WINNER_LABEL)).toHaveLength(0);

    const scheduled = m({ id: 4, round: 1, player1_id: 10, player2_id: 11, player1_name: 'Alpha', player2_name: 'Bravo', status: 'scheduled' });
    rerender(<MatchCard match={scheduled} />);
    expect(screen.queryAllByText(WINNER_LABEL)).toHaveLength(0);
    expect(screen.getByText('vs')).toBeTruthy();
  });

  it('keeps a current-player highlight distinct from the winner treatment', () => {
    render(<MatchCard match={completed} currentUserId={10} />);
    const mine = screen.getByText('Alpha').closest('div') as HTMLElement;
    expect(mine.className).toContain('text-[var(--color-primary)]');
    expect(mine.className).toContain('font-bold');
  });

  it('renders a safe fallback when the player name is missing', () => {
    const blank = m({ id: 5, round: 1, player1_id: 10, player2_id: 11, status: 'scheduled' });
    const { container } = render(<MatchCard match={blank} />);
    // No crash and avatars still render (initials derive from the fallback label).
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('MatchDetailsDrawer — single score + winner', () => {
  it('renders the primary score exactly once', () => {
    render(<MatchDetailsDrawer open onClose={() => {}} match={completed} currentUserId={10} />);
    expect(screen.getAllByText('2 - 0')).toHaveLength(1);
  });

  it('renders a multi-set score once with no per-side duplication', () => {
    const sets = m({
      id: 6, round: 1, player1_id: 10, player2_id: 11, player1_name: 'Alpha', player2_name: 'Bravo',
      status: 'completed', score_summary: '6-4 6-3', winner_id: 10,
    });
    render(<MatchDetailsDrawer open onClose={() => {}} match={sets} currentUserId={10} />);
    expect(screen.getAllByText('6-4 6-3')).toHaveLength(1);
    expect(screen.queryByText('6-4')).toBeNull();
  });

  it('keeps the winner clear', () => {
    render(<MatchDetailsDrawer open onClose={() => {}} match={completed} currentUserId={10} />);
    expect(screen.getAllByText(WINNER_LABEL)).toHaveLength(1);
  });
});

describe('MatchCard — safe participant fallback (no internal ids)', () => {
  it('renders participant_name when player_name is absent', () => {
    const participant = m({ id: 50, round: 1, participant1_name: 'Alice', participant2_name: 'Bob', status: 'scheduled' });
    const { container } = render(<MatchCard match={participant} />);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('renders TBD and Bye for unassigned sides', () => {
    const tbd = m({ id: 51, round: 1, status: 'scheduled', match_id: 77 });
    render(<MatchCard match={tbd} />);
    expect(screen.getByText('tournamentBracket.tbd')).toBeTruthy();
    expect(screen.getByText('tournamentBracket.bye')).toBeTruthy();
  });

  it('keeps the Bye presentation', () => {
    const bye = m({ id: 52, round: 1, player1_id: 10, status: 'scheduled', match_id: null });
    render(<MatchCard match={bye} />);
    expect(screen.getByText('tournamentBracket.bye')).toBeTruthy();
  });

  it('never renders internal P{id} when only an id exists', () => {
    const idsOnly = m({ id: 53, round: 1, player1_id: 10, player2_id: 11, status: 'scheduled' });
    const { container } = render(<MatchCard match={idsOnly} />);
    expect(container.textContent).not.toMatch(/\bP\d+\b/);
    expect(container.textContent).not.toContain('#');
    expect(screen.getAllByText('tournamentBracket.notAvailable').length).toBeGreaterThanOrEqual(2);
  });

  it('preserves current-player highlight and initials avatars when names are absent', () => {
    const idsOnly = m({ id: 54, round: 1, player1_id: 10, player2_id: 11, status: 'scheduled' });
    const { container } = render(<MatchCard match={idsOnly} currentUserId={10} />);
    const rows = Array.from(container.querySelectorAll('div.flex.items-center.gap-2'));
    expect(rows.some((r) => String(r.className).includes('text-[var(--color-primary)]'))).toBe(true);
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });
});
