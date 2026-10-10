import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RuleSetVisualEditor from '../RuleSetVisualEditor';

/**
 * Phase 1 — the visual editor must round-trip the canonical scoring JSON
 * contract WITHOUT dropping optional or unknown fields: the backend (and match
 * snapshots) consume the exact existing shape.
 */

const CHANGED = vi.fn();

function renderEditor() {
  return render(
    <RuleSetVisualEditor
      rules={{
        score_structure: 'sets',
        best_of: 3,
        sets_to_win: 2,
        first_to: 6,
        margin: 2,
        tiebreak_at: 6,
        tiebreak_first_to: 7,
        deuce_rule: 'golden_point',
        draw_allowed: false,
        terminations: ['retired', 'walkover'],
        future_flag: 'keep-me',
      }}
      standingsRules={{
        points: { win: 3, draw: 1, loss: 0 },
        tiebreakers: [{ field: 'points', direction: 'desc' }],
        standings_flag: 'standings-keep',
      }}
      onChange={CHANGED}
    />,
  );
}

describe('RuleSetVisualEditor — JSON contract round-trip', () => {
  it('keeps unknown keys and optional fields when toggling a known option', () => {
    renderEditor();
    CHANGED.mockClear();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Draws allowed' }));

    const [rules, standings] = CHANGED.mock.calls[CHANGED.mock.calls.length - 1] as any[];
    expect(rules.score_structure).toBe('sets');
    expect(rules.best_of).toBe(3);
    expect(rules.sets_to_win).toBe(2);
    expect(rules.deuce_rule).toBe('golden_point');
    expect(rules.tiebreak_at).toBe(6);
    expect(rules.draw_allowed).toBe(true);
    expect(rules.terminations).toContain('retired');
    expect(rules.future_flag).toBe('keep-me'); // unknown key preserved verbatim

    expect(standings.points.win).toBe(3);
    expect(standings.tiebreakers[0]).toEqual({ field: 'points', direction: 'desc' });
    expect(standings.standings_flag).toBe('standings-keep'); // unknown standings key preserved
  });

  it('switch to goals keeps preserved keys and emits a valid goals contract', () => {
    renderEditor();
    CHANGED.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: /Goals \(halves \/ duration\)/ }));

    const [rules] = CHANGED.mock.calls[CHANGED.mock.calls.length - 1] as any[];
    expect(rules.score_structure).toBe('goals');
    expect(rules.future_flag).toBe('keep-me');
    expect(rules.extra_time).toBe(false);
  });

  it('does not emit standings when none are configured and nothing preserved', () => {
    CHANGED.mockClear();
    render(<RuleSetVisualEditor rules={{ score_structure: 'sets', draw_allowed: false, terminations: [] }} standingsRules={null} onChange={CHANGED} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Draws allowed' })); // trigger an emission
    const [, standings] = CHANGED.mock.calls[CHANGED.mock.calls.length - 1] as any[];
    expect(standings).toBeNull();
  });
});