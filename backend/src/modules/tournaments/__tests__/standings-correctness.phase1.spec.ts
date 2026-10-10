import { describe, it, expect } from 'vitest';
import {
  computeStandings,
  extractStandingsTiebreakers,
  parseReliableMatchScore,
  resolveStandingsTiebreakers,
  resolveTournamentStandingsTiebreakers,
  LEGACY_TIEBREAKERS,
  type ReliableMatchScore,
  type StandingsTiebreakerRef,
} from '../domain/tournament-aggregate.js';

/**
 * Phase 1 — tournament standings & match-result correctness.
 *
 * Locks the corrected behavior:
 *   1. Configured standings tie-breakers execute in their configured order
 *      (points → games/sets/goal difference → games/sets/goals → head-to-head).
 *   2. games_won/games_lost and sets_won/sets_lost derive ONLY from reliable
 *      match-result scoring evidence (never match counts, never invented).
 *   3. Legacy rule sets with missing configuration keep the historical
 *      fallback (points DESC → game difference DESC).
 *   4. Unsupported/incomplete tie-breaker configurations fail closed (throw).
 */

interface MatchShape {
  player1_id: number;
  player2_id: number;
  winner_id: number | null;
  status: string;
  standingsOutcome?: 'win' | 'draw' | 'no_result';
  standingsPoints?: { win: number; draw: number; loss: number };
  matchScore?: ReliableMatchScore | null;
}

function wm(p1: number, p2: number, winner: number, overrides: Partial<MatchShape> = {}): MatchShape {
  return {
    player1_id: p1,
    player2_id: p2,
    winner_id: winner,
    status: 'completed',
    standingsOutcome: 'win',
    standingsPoints: { win: 3, draw: 1, loss: 0 },
    ...overrides,
  };
}

function dm(p1: number, p2: number, overrides: Partial<MatchShape> = {}): MatchShape {
  return {
    player1_id: p1,
    player2_id: p2,
    winner_id: null,
    status: 'completed',
    standingsOutcome: 'draw',
    standingsPoints: { win: 3, draw: 1, loss: 0 },
    ...overrides,
  };
}

function setsScore(...sets: Array<[number, number]>): ReliableMatchScore {
  return { structure: 'sets', sets: sets.map(([home, away]) => ({ home, away })) };
}

function goalsScore(homeGoals: number, awayGoals: number): ReliableMatchScore {
  return { structure: 'goals', homeGoals, awayGoals };
}

function ids(standings: Array<{ registration_id: number }>): number[] {
  return standings.map((s) => s.registration_id);
}

describe('computeStandings — Phase 1 configured tie-breakers execute in configured order', () => {
  it('points → games_difference (desc) in configured order', () => {
    const matches = [
      wm(1, 2, 1, { matchScore: setsScore([6, 4], [6, 4]) }),
      wm(2, 3, 2, { matchScore: setsScore([6, 1], [6, 1]) }),
      wm(3, 1, 3, { matchScore: setsScore([6, 2], [6, 2]) }),
    ];
    // points all 3; game difference: p2 +6 > p3 -2 > p1 -4
    const standings = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'games_difference', direction: 'desc' },
      ],
    });
    expect(ids(standings)).toEqual([2, 3, 1]);
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(1)).toMatchObject({ games_won: 16, games_lost: 20 });
    expect(byId.get(2)).toMatchObject({ games_won: 20, games_lost: 14 });
    expect(byId.get(3)).toMatchObject({ games_won: 14, games_lost: 16 });
  });

  it('respects an asc direction and games_won as an independent second-level tie-breaker', () => {
    const matches = [
      wm(1, 2, 1, { matchScore: setsScore([6, 4], [6, 4]) }),
      wm(2, 3, 2, { matchScore: setsScore([6, 1], [6, 1]) }),
      wm(3, 1, 3, { matchScore: setsScore([6, 2], [6, 2]) }),
    ];
    // games_difference asc → p1 (-4), p3 (-2), p2 (+6)
    const ascDiff = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'games_difference', direction: 'asc' },
      ],
    });
    expect(ids(ascDiff)).toEqual([1, 3, 2]);

    // exact order matters: counted LAST (games_won desc, not the diff) flips ranking
    const byGamesWon = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'games_won', direction: 'desc' },
      ],
    });
    expect(ids(byGamesWon)).toEqual([2, 1, 3]);
  });

  it('applies sets_difference and sets_won as configured tie-breakers', () => {
    const matches = [
      wm(1, 2, 1, { matchScore: setsScore([6, 4], [6, 3]) }),
      wm(2, 3, 2, { matchScore: setsScore([6, 2], [6, 2]) }),
      wm(3, 1, 3, { matchScore: setsScore([6, 4], [4, 6], [6, 4]) }),
    ];
    // sets: p1 sw3 sl2 (+1), p2 sw2 sl2 (0), p3 sw2 sl3 (-1)
    const byDiff = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'sets_difference', direction: 'desc' },
      ],
    });
    expect(ids(byDiff)).toEqual([1, 2, 3]);
    const byId = new Map(byDiff.map((s) => [s.registration_id, s]));
    expect(byId.get(1)).toMatchObject({ sets_won: 3, sets_lost: 2 });
    expect(byId.get(2)).toMatchObject({ sets_won: 2, sets_lost: 2 });
    expect(byId.get(3)).toMatchObject({ sets_won: 2, sets_lost: 3 });
  });

  it('evaluates sets_won (not sets_difference) when configured', () => {
    const matches = [
      wm(1, 2, 1, { matchScore: setsScore([6, 4], [4, 6], [6, 3]) }),
      wm(2, 3, 2, { matchScore: setsScore([6, 2], [6, 2]) }),
      wm(3, 1, 3, { matchScore: setsScore([6, 4], [4, 6], [6, 4]) }),
    ];
    // sets_won: p1 3, p2 3, p3 2 → [1, 2, 3]; sets_difference: p2 +1, p1 0, p3 -1 → [2, 1, 3]
    const bySetsWon = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'sets_won', direction: 'desc' },
      ],
    });
    expect(ids(bySetsWon)).toEqual([1, 2, 3]);

    const bySetsDiff = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'sets_difference', direction: 'desc' },
      ],
    });
    expect(ids(bySetsDiff)).toEqual([2, 1, 3]);
  });

  it('applies goal_difference / goals_for / goals_against (goals stored in the game columns)', () => {
    const matches = [
      wm(1, 2, 1, { matchScore: goalsScore(3, 1) }),
      wm(2, 3, 2, { matchScore: goalsScore(2, 0) }),
      wm(3, 1, 3, { matchScore: goalsScore(1, 0) }),
    ];
    // GF/GA: p1 3/2 (+1), p2 3/3 (0), p3 1/2 (-1)
    const byGd = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'goal_difference', direction: 'desc' },
      ],
    });
    expect(ids(byGd)).toEqual([1, 2, 3]);
    const gdById = new Map(byGd.map((s) => [s.registration_id, s]));
    expect(gdById.get(1)).toMatchObject({ games_won: 3, games_lost: 2 });
    expect(gdById.get(2)).toMatchObject({ games_won: 3, games_lost: 3 });
    expect(gdById.get(3)).toMatchObject({ games_won: 1, games_lost: 2 });

    // goals_for desc then goals_against asc: gf p1 3, p2 3, p3 1 → p3 last;
    // p1 ga 2 < p2 ga 3 → p1 first
    const byGf = computeStandings(matches as any, [1, 2, 3], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'goals_for', direction: 'desc' },
        { field: 'goals_against', direction: 'asc' },
      ],
    });
    expect(ids(byGf)).toEqual([1, 2, 3]);
  });

  it('executes head-to-head against the specific tied opponent and overrides game difference', () => {
    const matches = [
      wm(1, 2, 1, { matchScore: setsScore([6, 4], [6, 4]) }),
      wm(4, 1, 4, { matchScore: setsScore([6, 0], [6, 0]) }),
      wm(2, 3, 2, { matchScore: setsScore([6, 0], [6, 0]) }),
      wm(4, 3, 4, { matchScore: setsScore([6, 1], [6, 1]) }),
    ];
    // points: p4 6, p1 3, p2 3, p3 0. game difference: p2 +8 > p1 -8.
    // head_to_head listed first → p1 beats p2 (p1 beat p2 head to head).
    const byH2h = computeStandings(matches as any, [1, 2, 3, 4], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'head_to_head', direction: 'desc' },
      ],
    });
    expect(ids(byH2h)).toEqual([4, 1, 2, 3]);

    // without head_to_head, game difference places p2 above p1
    const byGames = computeStandings(matches as any, [1, 2, 3, 4], {
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'games_difference', direction: 'desc' },
      ],
    });
    expect(ids(byGames)).toEqual([4, 2, 1, 3]);
  });
});

describe('computeStandings — Phase 1 games/sets derive from reliable scoring only', () => {
  it('counts actual games and sets for a two-set win', () => {
    const standings = computeStandings(
      [wm(10, 11, 10, { matchScore: setsScore([6, 4], [7, 6]) })],
      [10, 11],
    );
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(10)).toMatchObject({ wins: 1, losses: 0, points: 3, games_won: 13, games_lost: 10, sets_won: 2, sets_lost: 0 });
    expect(byId.get(11)).toMatchObject({ wins: 0, losses: 1, points: 0, games_won: 10, games_lost: 13, sets_won: 0, sets_lost: 2 });
  });

  it('counts goals into the game columns for a goal-based win and draw', () => {
    const standings = computeStandings(
      [
        wm(20, 21, 20, { matchScore: goalsScore(3, 1) }),
        dm(22, 23, { matchScore: goalsScore(2, 2) }),
      ],
      [20, 21, 22, 23],
    );
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(20)).toMatchObject({ wins: 1, points: 3, games_won: 3, games_lost: 1 });
    expect(byId.get(21)).toMatchObject({ losses: 1, points: 0, games_won: 1, games_lost: 3 });
    // draw: both sides draw → both score their goals
    expect(byId.get(22)).toMatchObject({ draws: 1, points: 1, games_won: 2, games_lost: 2 });
    expect(byId.get(23)).toMatchObject({ draws: 1, points: 1, games_won: 2, games_lost: 2 });
  });

  it('leaves games/sets at zero when no reliable scoring evidence exists (never invented)', () => {
    // Legacy winner-based row with no result record → zero games, but points still score.
    const standings = computeStandings([wm(30, 31, 30)], [30, 31]);
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(30)).toMatchObject({ wins: 1, points: 3, games_won: 0, games_lost: 0, sets_won: 0, sets_lost: 0 });
    expect(byId.get(31)).toMatchObject({ losses: 1, points: 0, games_won: 0, games_lost: 0, sets_won: 0, sets_lost: 0 });
  });

  it('skips a winner_id that matches neither side (corrupt row — never scores the match)', () => {
    const standings = computeStandings([wm(40, 41, 999)], [40, 41]);
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(40)).toMatchObject({ wins: 0, losses: 0, points: 0, games_won: 0 });
    expect(byId.get(41)).toMatchObject({ wins: 0, losses: 0, points: 0, games_won: 0 });
    expect(ids(standings)).toEqual([40, 41]);
  });

  it('keeps legacy placement: completed matches without a winner are point-neutral', () => {
    const standings = computeStandings(
      [wm(50, 51, 50), { ...wm(52, 53, 52), standingsOutcome: 'no_result' }],
      [50, 51, 52, 53],
    );
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(52)).toMatchObject({ wins: 0, points: 0, games_won: 0 });
    expect(byId.get(53)).toMatchObject({ wins: 0, points: 0, games_won: 0 });
  });
});

describe('computeStandings — legacy compatibility fallback', () => {
  it('falls back to points DESC then game difference DESC when no tiebreakers are configured', () => {
    const standings = computeStandings(
      [
        wm(1, 2, 1, { matchScore: setsScore([6, 4], [6, 3]) }),
        wm(1, 3, 3, { matchScore: setsScore([0, 6], [0, 6]) }),
        wm(2, 3, 2, { matchScore: setsScore([6, 2], [6, 2]) }),
      ],
      [1, 2, 3],
    );
    // points all 3; game difference: p3 +4 > p2 +3 > p1 -7
    expect(ids(standings)).toEqual([3, 2, 1]);
  });

  it('falls back to win=3/draw=0/loss=0 when standingsPoints are absent (legacy rows)', () => {
    const standings = computeStandings([wm(1, 2, 1, { standingsPoints: undefined })], [1, 2]);
    const byId = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byId.get(1)).toMatchObject({ wins: 1, points: 3 });
    expect(byId.get(2)).toMatchObject({ losses: 1, points: 0 });
  });
});

describe('resolveStandingsTiebreakers — validation & fallback', () => {
  it('returns the legacy fallback for missing or empty configuration', () => {
    expect(resolveStandingsTiebreakers(null)).toEqual(LEGACY_TIEBREAKERS);
    expect(resolveStandingsTiebreakers(undefined)).toEqual(LEGACY_TIEBREAKERS);
    expect(resolveStandingsTiebreakers([])).toEqual(LEGACY_TIEBREAKERS);
  });

  it('preserves the configured order of valid entries', () => {
    const config: StandingsTiebreakerRef[] = [
      { field: 'points', direction: 'desc' },
      { field: 'head_to_head', direction: 'desc' },
      { field: 'games_difference', direction: 'asc' },
    ];
    expect(resolveStandingsTiebreakers(config)).toEqual(config);
  });

  it('rejects an unsupported field (fail closed)', () => {
    expect(() => resolveStandingsTiebreakers([{ field: 'goal_average', direction: 'desc' }])).toThrow(
      /Unsupported standings tie-breaker field "goal_average"/,
    );
  });

  it('rejects an invalid direction', () => {
    expect(() => resolveStandingsTiebreakers([{ field: 'points', direction: 'sideways' as any }])).toThrow(
      /Invalid standings tie-breaker direction "sideways" for field "points"/,
    );
  });

  it('rejects duplicate fields', () => {
    expect(() =>
      resolveStandingsTiebreakers([
        { field: 'points', direction: 'desc' },
        { field: 'points', direction: 'desc' },
      ]),
    ).toThrow(/Duplicate standings tie-breaker field "points"/);
  });

  it('rejects a non-array configuration', () => {
    expect(() => resolveStandingsTiebreakers({ field: 'points' })).toThrow(/expected an array of \{ field, direction \}/);
  });

  it('maps legacy string-array tiebreakers into the { field, direction } contract (desc)', () => {
    // `game_difference` (singular) is the historical spelling of the canonical
    // `games_difference` field — mapped unambiguously.
    expect(resolveStandingsTiebreakers(['points', 'game_difference'])).toEqual([
      { field: 'points', direction: 'desc' },
      { field: 'games_difference', direction: 'desc' },
    ]);
    expect(resolveStandingsTiebreakers(['points'])).toEqual([{ field: 'points', direction: 'desc' }]);
  });

  it('maps a mix of legacy strings and object entries, preserving order', () => {
    expect(resolveStandingsTiebreakers(['points', { field: 'head_to_head', direction: 'asc' }, 'games_won'])).toEqual([
      { field: 'points', direction: 'desc' },
      { field: 'head_to_head', direction: 'asc' },
      { field: 'games_won', direction: 'desc' },
    ]);
  });

  it('throws on an unsupported legacy string field (mapping only where unambiguous)', () => {
    expect(() => resolveStandingsTiebreakers(['points', 'sets_average'])).toThrow(
      /Unsupported standings tie-breaker field "sets_average"/,
    );
  });

  it('throws on duplicate fields across legacy strings and objects', () => {
    expect(() => resolveStandingsTiebreakers(['points', 'points'])).toThrow(/Duplicate standings tie-breaker field "points"/);
    expect(() => resolveStandingsTiebreakers(['points', { field: 'points', direction: 'desc' }])).toThrow(
      /Duplicate standings tie-breaker field "points"/,
    );
    // singular legacy spelling collides with the canonical field — same tie-break, duplicate config
    expect(() => resolveStandingsTiebreakers(['game_difference', 'games_difference'])).toThrow(
      /Duplicate standings tie-breaker field "games_difference"/,
    );
  });
});

describe('extractStandingsTiebreakers — reads a raw standings_rules JSON value (string or object)', () => {
  const full = {
    points: { win: 3, draw: 1, loss: 0 },
    tiebreakers: [
      { field: 'points', direction: 'desc' },
      { field: 'games_difference', direction: 'desc' },
      { field: 'games_won', direction: 'desc' },
    ],
  };

  it('extracts .tiebreakers from a parsed standings_rules object', () => {
    expect(extractStandingsTiebreakers(full)).toEqual(full.tiebreakers);
  });

  it('extracts .tiebreakers from a JSON-string standings_rules value (mysql2 return shape)', () => {
    expect(extractStandingsTiebreakers(JSON.stringify(full))).toEqual(full.tiebreakers);
  });

  it('accepts a bare tiebreakers array and a JSON-encoded array (legacy snapshot shapes)', () => {
    expect(extractStandingsTiebreakers(full.tiebreakers)).toEqual(full.tiebreakers);
    expect(extractStandingsTiebreakers(JSON.stringify(full.tiebreakers))).toEqual(full.tiebreakers);
  });

  it('normalizes an embedded legacy string-array tiebreakers value', () => {
    expect(
      extractStandingsTiebreakers({ points: full.points, tiebreakers: ['points', 'game_difference'] }),
    ).toEqual([
      { field: 'points', direction: 'desc' },
      { field: 'games_difference', direction: 'desc' },
    ]);
  });

  it('returns null when the value carries no usable configuration (missing/null/malformed)', () => {
    expect(extractStandingsTiebreakers(null)).toBeNull();
    expect(extractStandingsTiebreakers(undefined)).toBeNull();
    expect(extractStandingsTiebreakers({})).toBeNull();
    expect(extractStandingsTiebreakers({ points: full.points })).toBeNull();
    expect(extractStandingsTiebreakers('{ not json')).toBeNull();
    expect(extractStandingsTiebreakers([])).toBeNull();
    expect(extractStandingsTiebreakers('[]')).toBeNull();
    expect(extractStandingsTiebreakers(42)).toBeNull();
  });

  it('fails closed on invalid content inside a present configuration', () => {
    expect(() => extractStandingsTiebreakers({ tiebreakers: [{ field: 'bogus', direction: 'desc' }] })).toThrow(
      /Unsupported standings tie-breaker field "bogus"/,
    );
    expect(() => extractStandingsTiebreakers(JSON.stringify({ tiebreakers: [{ field: 'points', direction: 'up' }] }))).toThrow(
      /Invalid standings tie-breaker direction "up" for field "points"/,
    );
  });
});

describe('resolveTournamentStandingsTiebreakers — precedence & mixed-snapshot fail-closed', () => {
  const A = [
    { field: 'points', direction: 'desc' },
    { field: 'games_difference', direction: 'desc' },
  ];
  const B = [
    { field: 'points', direction: 'desc' },
    { field: 'games_won', direction: 'desc' },
  ];

  it('uses the tournament-level rule set config and ignores snapshot differences', () => {
    expect(resolveTournamentStandingsTiebreakers({ tiebreakers: A }, [B, A, null], 1)).toEqual(A);
    // JSON-string tournament-level value (mysql2 returns JSON as strings)
    expect(resolveTournamentStandingsTiebreakers(JSON.stringify({ tiebreakers: A }), [B], 1)).toEqual(A);
  });

  it('falls back to the contributing match snapshots when the tournament has no rule set', () => {
    expect(resolveTournamentStandingsTiebreakers(null, [A, A], 2)).toEqual(A);
    // Legacy string-array snapshot normalizes to the same config as the object form — not "mixed"
    expect(resolveTournamentStandingsTiebreakers(null, [A, ['points', 'game_difference']], 3)).toEqual(A);
  });

  it('fails closed on mixed non-null snapshot configurations when the tournament rule set is unavailable', () => {
    expect(() => resolveTournamentStandingsTiebreakers(null, [A, B], 4)).toThrow(/Mixed standings tie-breaker configuration in tournament 4/);
    expect(() => resolveTournamentStandingsTiebreakers(undefined, [A, null, B], 5)).toThrow(/Mixed standings tie-breaker configuration in tournament 5/);
  });

  it('ignores missing/null/malformed snapshots and still fails on real disagreements', () => {
    expect(resolveTournamentStandingsTiebreakers(null, [null, undefined, A, A], 6)).toEqual(A);
    expect(() => resolveTournamentStandingsTiebreakers(null, [null, A, '{ not json', B], 7)).toThrow(
      /Mixed standings tie-breaker configuration in tournament 7/,
    );
  });

  it('falls back to the legacy default when no tournament config and no snapshot config exists', () => {
    expect(resolveTournamentStandingsTiebreakers(null, [], 8)).toEqual(LEGACY_TIEBREAKERS);
    expect(resolveTournamentStandingsTiebreakers(null, [null, undefined, 'not-json'], 9)).toEqual(LEGACY_TIEBREAKERS);
  });
});

describe('parseReliableMatchScore — reliability contract', () => {
  it('parses a valid sets structure', () => {
    expect(parseReliableMatchScore({ score: { sets: [{ home: 6, away: 4 }, { home: 7, away: 6 }] } }, { score_structure: 'sets' })).toEqual({
      structure: 'sets',
      sets: [{ home: 6, away: 4 }, { home: 7, away: 6 }],
    });
  });

  it('parses a valid goals structure and never folds penalties into goals', () => {
    const parsed = parseReliableMatchScore(
      { score: { homeGoals: 2, awayGoals: 2, penalties: { home: 4, away: 3 } } },
      { score_structure: 'goals' },
    );
    expect(parsed).toEqual({ structure: 'goals', homeGoals: 2, awayGoals: 2 });
  });

  it('returns null for missing/unknown structure, scores or rules', () => {
    expect(parseReliableMatchScore(null, null)).toBeNull();
    expect(parseReliableMatchScore({}, { score_structure: 'sets' })).toBeNull();
    expect(parseReliableMatchScore({ score: null }, { score_structure: 'sets' })).toBeNull();
    expect(parseReliableMatchScore({ score: { sets: [{ home: 6, away: 4 }] } }, {})).toBeNull();
    expect(parseReliableMatchScore({ score: { sets: [{ home: 6, away: 4 }] } }, { score_structure: 'whatevs' })).toBeNull();
  });

  it('rejects malformed scoring (whole match returns null — no partial counts)', () => {
    expect(parseReliableMatchScore({ score: { sets: [{ home: 6, away: -1 }] } }, { score_structure: 'sets' })).toBeNull();
    expect(parseReliableMatchScore({ score: { sets: [{ home: 6.5, away: 4 }] } }, { score_structure: 'sets' })).toBeNull();
    expect(parseReliableMatchScore({ score: { sets: [] } }, { score_structure: 'sets' })).toBeNull();
    expect(parseReliableMatchScore({ score: { sets: [{ home: 6, away: 4 }, { home: -1, away: 2 }] } }, { score_structure: 'sets' })).toBeNull();
    expect(parseReliableMatchScore({ score: { homeGoals: 2.5, awayGoals: 1 } }, { score_structure: 'goals' })).toBeNull();
    expect(parseReliableMatchScore({ score: { homeGoals: 2, awayGoals: -1 } }, { score_structure: 'goals' })).toBeNull();
  });
});