/**
 * MatchDetailsDrawer — accessibility (opt-in Modal dialog semantics + focus).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { MatchDetailsDrawer } from '../MatchDetailsDrawer';
import { Modal } from '../../ui/Modal';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k) }),
}));

const TITLE = 'tournamentBracket.matchDetailsTitle';
const PREV = 'tournamentBracket.prevMatch';
const NEXT = 'tournamentBracket.nextMatch';

function m(partial: Partial<TournamentMatchNode> & { id: number }): TournamentMatchNode {
  return { tournament_id: 1, ...partial } as TournamentMatchNode;
}

const completed = m({
  id: 1, round: 1, bracket_position: 0,
  player1_id: 1, player2_id: 2, player1_name: 'Alpha', player2_name: 'Bravo',
  status: 'completed', score_summary: '2 - 0', winner_id: 1,
});

beforeEach(() => cleanup());

describe('MatchDetailsDrawer dialog semantics', () => {
  it('exposes role=dialog, aria-modal and an accessible name from the title', () => {
    render(<MatchDetailsDrawer open onClose={() => {}} match={completed} currentUserId={1} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog).toHaveAccessibleName(TITLE);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<MatchDetailsDrawer open onClose={onClose} match={completed} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives the close button an accessible name', () => {
    render(<MatchDetailsDrawer open onClose={() => {}} match={completed} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('keeps accessible labels on Previous / Next navigation', () => {
    const feeder = m({
      id: 101, round: 1, bracket_position: 0, player1_name: 'Alpha', player2_name: 'Bravo',
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' } as any,
    });
    const target = m({ id: 103, round: 2, bracket_position: 0, player1_name: 'Alpha', player2_name: 'Charlie' });
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={feeder} matches={[feeder, target]} onSelectMatch={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: PREV })).toBeTruthy();
    expect(screen.getByRole('button', { name: NEXT })).toBeTruthy();
  });
});

describe('MatchDetailsDrawer focus management', () => {
  it('moves focus into the dialog when opened', async () => {
    render(<MatchDetailsDrawer open onClose={() => {}} match={completed} />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(dialog));
  });

  it('returns focus to the trigger when closed', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>open-match</button>
          <MatchDetailsDrawer open={open} onClose={() => setOpen(false)} match={completed} />
        </div>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'open-match' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('shared Modal remains opt-in (no unrelated regression)', () => {
  it('does not add dialog semantics unless a11yDialog is enabled', () => {
    render(
      <Modal open onClose={() => {}} title="Plain dialog">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    // Visible text is unchanged.
    expect(screen.getByText('Plain dialog')).toBeTruthy();
  });
});
