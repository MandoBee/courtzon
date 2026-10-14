import { describe, it, expect, vi, afterEach } from 'vitest';

// Env bootstrap BEFORE the module graph loads (config/env.ts exits the process on
// invalid env). Mirrors src/modules/accounting/__tests__/journal-entity-scope.spec.ts.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// The service only reaches `getPool()` lazily; a stub keeps this test DB-free.
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    getConnection: async () => { throw new Error('no DB in unit test'); },
    execute: async () => [[], []],
  }),
}));

import { tournamentService } from '../application/tournament.service.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';

/**
 * GSK-3C / Phase 5.5 (D2) — `resolveBracketChampionUserId` must never treat the
 * dedicated THIRD-PLACE slot as the championship final.
 *
 * The third-place slot is persisted with `is_third_place: true` and
 * `target_round/target_bracket_position: null` (see knockout-transition `buildKnockoutMeta`
 * and `withThirdPlaceMatch`), so it satisfies the old "terminal slot" test. Without the
 * `is_third_place` exclusion, a final + third-place bracket produced TWO terminal slots,
 * `finalSlots.length !== 1`, and the champion always resolved to null (no winner
 * notification on operator completion).
 *
 * This mirrors `knockout-placements.isTerminalSlot`, which already excludes third place.
 * Selected rows are built as plain objects and fed through a repository spy — no DB.
 */

let seq = 100;
function mk(p: {
  round: number;
  bp?: number;
  p1?: number | null;
  p2?: number | null;
  winner?: number | null;
  status?: string | null;
  ps?: string | null;
  targetRound?: number | null;
  targetBp?: number | null;
  thirdPlace?: boolean;
}): any {
  seq += 1;
  return {
    id: seq,
    tournament_id: 1,
    competition_id: 1,
    round: p.round,
    bracket_position: p.bp ?? 0,
    participant1_id: p.p1 ?? null,
    participant2_id: p.p2 ?? null,
    player1_id: p.p1 ?? null,
    player2_id: p.p2 ?? null,
    winner_id: p.winner ?? null,
    winner_participant_id: p.winner ?? null,
    status: p.status ?? 'completed',
    progression_state: p.ps ?? 'completed',
    progression_meta: {
      is_bracket: true,
      ...(p.thirdPlace ? { is_third_place: true } : {}),
      target_round: p.targetRound ?? null,
      target_bracket_position: p.targetBp ?? null,
      target_side: 'player1',
    },
  };
}

/** Semis 11>12 and 13>14; final 11>13; third-place 12>14 (completed). */
function fourPlayerWithThird(thirdStatus: string | null = 'completed', thirdPs: string | null = 'completed'): any[] {
  return [
    mk({ round: 1, bp: 0, p1: 11, p2: 12, winner: 11, targetRound: 2, targetBp: 0 }),
    mk({ round: 1, bp: 1, p1: 13, p2: 14, winner: 13, targetRound: 2, targetBp: 0 }),
    mk({ round: 2, bp: 0, p1: 11, p2: 13, winner: 11 }),
    mk({ round: 2, bp: 1, p1: 12, p2: 14, winner: 12, thirdPlace: true, status: thirdStatus, ps: thirdPs }),
  ];
}

/** Legacy bracket: no third-place slot. Final 11>13. */
const CHAMPION = 11;
const THIRD_PLACE_WINNER = 12;

function resolveChampion(rows: any[]): Promise<number | null> {
  vi.spyOn(tournamentRepository, 'findMatches').mockResolvedValue(rows as any);
  return (tournamentService as any).resolveBracketChampionUserId(1);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 5.5 — champion resolution ignores the third-place slot', () => {
  it('resolves the champion from the ACTUAL final when a third-place match exists', async () => {
    const champion = await resolveChampion(fourPlayerWithThird());
    expect(champion).toBe(CHAMPION);
  });

  it('never returns the third-place winner as champion', async () => {
    const champion = await resolveChampion(fourPlayerWithThird());
    expect(champion).not.toBe(THIRD_PLACE_WINNER);
    expect(champion).toBe(CHAMPION);
  });

  it('is unaffected by whether the third-place match is resolved', async () => {
    // Third place still scheduled/unplayed — the final alone decides the champion.
    const champion = await resolveChampion(fourPlayerWithThird('scheduled', 'ready'));
    expect(champion).toBe(CHAMPION);
  });

  it('fails closed (null) when ONLY a third-place slot has completed — never a champion', async () => {
    const rows = [
      mk({ round: 1, bp: 0, p1: 11, p2: 12, winner: 11, targetRound: 2, targetBp: 0 }),
      mk({ round: 1, bp: 1, p1: 13, p2: 14, winner: 13, targetRound: 2, targetBp: 0 }),
      mk({ round: 2, bp: 0, p1: 11, p2: 13, winner: null, status: 'scheduled', ps: 'pending' }),
      mk({ round: 2, bp: 1, p1: 12, p2: 14, winner: 12, thirdPlace: true }),
    ];
    const champion = await resolveChampion(rows);
    expect(champion).toBeNull();
  });

  it('retains legacy behaviour for a bracket WITHOUT a third-place slot', async () => {
    const legacy = [
      mk({ round: 1, bp: 0, p1: 11, p2: 12, winner: 11, targetRound: 2, targetBp: 0 }),
      mk({ round: 1, bp: 1, p1: 13, p2: 14, winner: 13, targetRound: 2, targetBp: 0 }),
      mk({ round: 2, bp: 0, p1: 11, p2: 13, winner: 11 }),
    ];
    const champion = await resolveChampion(legacy);
    expect(champion).toBe(CHAMPION);
  });

  it('still fails closed when the final is unresolved', async () => {
    const rows = fourPlayerWithThird();
    rows[2] = mk({ round: 2, bp: 0, p1: 11, p2: 13, winner: null, status: 'scheduled', ps: 'pending' });
    const champion = await resolveChampion(rows);
    expect(champion).toBeNull();
  });

  it('still fails closed when there are no matches', async () => {
    const champion = await resolveChampion([]);
    expect(champion).toBeNull();
  });
});
