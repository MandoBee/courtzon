/**
 * MatchDetailsDrawer — defensive bracket navigation (integration).
 *
 * Covers the UI contract:
 *  - Next enabled only when the winner-progression target is unambiguous.
 *  - Previous enabled only when the feeder relationship is unambiguous.
 *  - Unknown / ambiguous / round-robin relationships leave the control disabled.
 *  - Clicking a control re-targets the drawer to the related match.
 *  - Raw progression_meta is never rendered.
 *  - Navigation performs no additional network call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { MatchDetailsDrawer } from '../MatchDetailsDrawer';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

const meta = (o: Record<string, unknown>) => o as TournamentMatchNode['progression_meta'];

function m(partial: Partial<TournamentMatchNode> & { id: number }): TournamentMatchNode {
  return { tournament_id: 1, ...partial } as TournamentMatchNode;
}

const PREV = 'tournamentBracket.prevMatch';
const NEXT = 'tournamentBracket.nextMatch';

const feederP1 = m({
  id: 101, round: 1, bracket_position: 0, player1_id: 10, player2_id: 11,
  player1_name: 'Alpha', player2_name: 'Bravo', status: 'completed', score_summary: '2 - 0',
  progression_meta: meta({ is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' }),
});
const feederP2 = m({
  id: 102, round: 1, bracket_position: 1, player1_id: 12, player2_id: 13,
  player1_name: 'Charlie', player2_name: 'Delta', status: 'completed', score_summary: '2 - 1',
  progression_meta: meta({ is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player2' }),
});
const final = m({
  id: 103, round: 2, round_name: 'Final', bracket_position: 0, player1_id: 10, player2_id: 12,
  player1_name: 'Alpha', player2_name: 'Charlie', status: 'scheduled',
  progression_meta: meta({ is_bracket: true, target_round: null, target_bracket_position: null }),
});
const bracket = [feederP1, feederP2, final];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function prevButton() {
  return screen.getByRole('button', { name: PREV }) as HTMLButtonElement;
}
function nextButton() {
  return screen.getByRole('button', { name: NEXT }) as HTMLButtonElement;
}

describe('MatchDetailsDrawer navigation', () => {
  it('enables Next for a feeder and navigates to the unique progression target', () => {
    const onSelectMatch = vi.fn();
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={feederP1} matches={bracket} currentUserId={10} onSelectMatch={onSelectMatch} />,
    );

    const next = nextButton();
    expect(next.disabled).toBe(false);
    expect(prevButton().disabled).toBe(true); // opening round → no feeder

    fireEvent.click(next);
    expect(onSelectMatch).toHaveBeenCalledTimes(1);
    expect(onSelectMatch.mock.calls[0][0].id).toBe(103);
  });

  it('enables Previous when the viewer side disambiguates the feeder pair', () => {
    const onSelectMatch = vi.fn();
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={final} matches={bracket} currentUserId={10} onSelectMatch={onSelectMatch} />,
    );

    const prev = prevButton();
    expect(prev.disabled).toBe(false);
    expect(nextButton().disabled).toBe(true); // terminal slot → no next

    fireEvent.click(prev);
    expect(onSelectMatch).toHaveBeenCalledTimes(1);
    expect(onSelectMatch.mock.calls[0][0].id).toBe(101);
  });

  it('keeps Previous disabled when two feeders exist and the viewer side is unknown', () => {
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={final} matches={bracket} onSelectMatch={vi.fn()} />,
    );
    expect(prevButton().disabled).toBe(true);
  });

  it('disables both controls when there is no derivable relationship', () => {
    const lonely = m({ id: 900, round: 5, bracket_position: 9, player1_name: 'Solo', player2_name: 'Duo' });
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={lonely} matches={[lonely]} onSelectMatch={vi.fn()} />,
    );
    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(true);
  });

  it('never invents navigation for a round-robin (non-bracket) slot', () => {
    const rrA = m({ id: 301, round: 1, bracket_position: 0, player1_name: 'A', player2_name: 'B', progression_meta: meta({ is_bracket: false }) });
    const rrB = m({ id: 302, round: 1, bracket_position: 1, player1_name: 'C', player2_name: 'D', progression_meta: meta({ is_bracket: false }) });
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={rrA} matches={[rrA, rrB]} onSelectMatch={vi.fn()} />,
    );
    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(true);
  });

  it('does not render navigation controls when no match list is supplied (unchanged contract)', () => {
    render(<MatchDetailsDrawer open onClose={() => {}} match={final} currentUserId={10} />);
    expect(screen.queryByRole('button', { name: PREV })).toBeNull();
    expect(screen.queryByRole('button', { name: NEXT })).toBeNull();
  });

  it('never renders raw progression_meta JSON', () => {
    const leaky = m({
      id: 500, round: 1, bracket_position: 0, player1_name: 'Alpha', player2_name: 'Bravo',
      progression_meta: meta({
        is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1',
        internal_secret: 'SHOULD_NOT_RENDER_XYZ',
      }),
    });
    const target = m({ id: 501, round: 2, bracket_position: 0, player1_name: 'Alpha', player2_name: 'Bravo' });
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={leaky} matches={[leaky, target]} onSelectMatch={vi.fn()} />,
    );
    expect(screen.queryByText(/SHOULD_NOT_RENDER_XYZ/)).toBeNull();
    expect(screen.queryByText(/"is_bracket"/)).toBeNull();
  });

  it('updates the drawer to the selected target match', () => {
    function Harness() {
      const [selected, setSelected] = useState<TournamentMatchNode>(feederP1);
      return (
        <MatchDetailsDrawer open onClose={() => {}} match={selected} matches={bracket} currentUserId={10} onSelectMatch={setSelected} />
      );
    }
    render(<Harness />);

    // Feeders show Alpha/Bravo; the final shows Alpha/Charlie.
    expect(screen.getByText('Bravo')).toBeTruthy();
    fireEvent.click(nextButton());

    expect(screen.queryByText('Bravo')).toBeNull();
    expect(screen.getByText('Charlie')).toBeTruthy();
    expect(screen.getByText(/Final/)).toBeTruthy();
  });

  it('performs no additional network call when navigating', () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchSpy;
    try {
      render(
        <MatchDetailsDrawer open onClose={() => {}} match={feederP1} matches={bracket} currentUserId={10} onSelectMatch={vi.fn()} />,
      );
      fireEvent.click(nextButton());
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
