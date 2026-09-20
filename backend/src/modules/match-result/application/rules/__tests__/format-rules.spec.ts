import { describe, it, expect } from 'vitest';
import { formatSportRules } from '../format-rules.js';

const PADEL_FORMAT = { name: 'Padel Standard', formatType: 'doubles' as const, playersPerSide: 2 };
const TENNIS_FORMAT = { name: 'Tennis Standard', formatType: 'singles' as const, playersPerSide: 1 };
const FOOTBALL_FORMAT = { name: 'Football 11v11', formatType: 'team' as const, playersPerSide: 11 };

describe('formatSportRules — Group 1 shared human-readable formatter', () => {
  it('Padel-style sets: best_of, sets_to_win, first_to, margin, tiebreak, golden point', () => {
    const out = formatSportRules(
      {
        score_structure: 'sets',
        best_of: 3,
        sets_to_win: 2,
        first_to: 6,
        margin: 1,
        tiebreak_at: 6,
        tiebreak_first_to: 7,
        tiebreak_win_by: 2,
        deuce_rule: 'golden_point',
        draw_allowed: false,
      },
      { format: PADEL_FORMAT },
    );

    expect(out).toContain('Padel Standard — Doubles.');
    expect(out).toContain('Best of 3 sets.');
    expect(out).toContain('First to 6 games by a 1-game margin.');
    expect(out).toContain('Tiebreak at 6-6, first to 7 by 2.');
    expect(out).toContain('Golden point at deuce.');
    expect(out).toContain('Draws are not allowed.');
  });

  it('Tennis-style sets: standard deuce, tiebreak', () => {
    const out = formatSportRules(
      {
        score_structure: 'sets',
        best_of: 3,
        sets_to_win: 2,
        first_to: 6,
        margin: 2,
        tiebreak_at: 6,
        tiebreak_first_to: 7,
        tiebreak_win_by: 2,
        deuce_rule: 'standard',
        draw_allowed: false,
      },
      { format: TENNIS_FORMAT },
    );

    expect(out).toContain('Tennis Standard — Singles.');
    expect(out).toContain('First to 6 games by a 2-game margin.');
    expect(out).toContain('Standard deuce.');
  });

  it('Football-style goals: duration, halves, extra time, penalty shootout, draws', () => {
    const out = formatSportRules(
      {
        score_structure: 'goals',
        match_duration_minutes: 90,
        halves: [45, 45],
        extra_time: true,
        penalty_shootout: true,
        draw_allowed: true,
      },
      { format: FOOTBALL_FORMAT },
    );

    expect(out).toContain('Football 11v11 — 11v11.');
    expect(out).toContain('90-minute match.');
    expect(out).toContain('Two 45-minute halves.');
    expect(out).toContain('Extra time may be played.');
    expect(out).toContain('A penalty shootout may be used.');
    expect(out).toContain('Draws are allowed.');
  });

  it('goals structure without extra time / shootout stays minimal', () => {
    const out = formatSportRules(
      { score_structure: 'goals', match_duration_minutes: 90, halves: [45, 45], draw_allowed: false },
      { format: FOOTBALL_FORMAT },
    );

    expect(out).toContain('90-minute match.');
    expect(out).not.toContain('Extra time');
    expect(out).not.toContain('penalty shootout');
    expect(out).toContain('Draws are not allowed.');
  });

  it('partial/unknown config: missing optional values never throw and do not invent values', () => {
    const out = formatSportRules({ score_structure: 'sets', best_of: 3 }, { format: PADEL_FORMAT });
    expect(out).toContain('Best of 3 sets.');
    // No margin / first_to / tiebreak were provided — nothing is invented.
    expect(out).not.toContain('margin');
    expect(out).not.toContain('Tiebreak');
  });

  it('empty rules object falls back to format description when provided', () => {
    const out = formatSportRules({}, {
      format: { name: 'Padel Standard', formatType: 'doubles', playersPerSide: 2, description: 'Best of 3 sets, tiebreak at 6-6.' },
    });
    expect(out).toContain('Padel Standard — Doubles.');
    expect(out).toContain('Best of 3 sets, tiebreak at 6-6.');
  });

  it('null rules produce header only (no invented values)', () => {
    const out = formatSportRules(null, { format: PADEL_FORMAT });
    expect(out).toBe('Padel Standard — Doubles.');
  });

  it('team format renders players-per-side label (e.g. 11v11)', () => {
    const out = formatSportRules({ score_structure: 'goals', match_duration_minutes: 90 }, { format: FOOTBALL_FORMAT });
    expect(out).toContain('11v11');
  });
});