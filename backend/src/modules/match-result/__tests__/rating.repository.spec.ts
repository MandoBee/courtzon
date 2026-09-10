import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const executed = vi.hoisted(() => [] as string[]);
const params = vi.hoisted(() => [] as any[][]);

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async (sql: string, p: any[] = []) => {
      executed.push(sql);
      params.push(p);
      return [[], []];
    },
    getConnection: async () => ({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: async () => [[], []],
    }),
  }),
}));

import { ratingRepository } from '../infrastructure/rating.repository.js';

beforeEach(() => {
  executed.length = 0;
  params.length = 0;
});

describe('Round 2 Item 1 — setEvidenceActive', () => {
  it('flips meta.active via UPDATE without deleting the evidence row', async () => {
    await ratingRepository.setEvidenceActive('match_result', 42, false);
    const sql = executed[0];
    expect(sql.startsWith('UPDATE rating_evidence')).toBe(true);
    expect(sql).toContain('JSON_SET');
    expect(sql).toContain('WHERE source = ? AND source_ref_id = ?');
    expect(sql).not.toContain('DELETE');
    expect(params[0]).toEqual([0, 'match_result', 42]);
  });

  it('reactivation writes active true', async () => {
    await ratingRepository.setEvidenceActive('match_result', 42, true);
    expect(params[0][0]).toBe(1);
  });
});

describe('Round 2 Item 2 — self-declared sport queries', () => {
  it('getSelfDeclaredSportIds filters by self_declared evidence', async () => {
    await ratingRepository.getSelfDeclaredSportIds(5);
    const sql = executed[0];
    expect(sql).toContain('DISTINCT sport_id');
    expect(sql).toContain("evidence_type = 'self_declared'");
    expect(params[0][0]).toBe(5);
  });

  it('getMainSportId reads player_profiles.main_sport_id', async () => {
    await ratingRepository.getMainSportId(5);
    const sql = executed[0];
    expect(sql).toContain('SELECT main_sport_id FROM player_profiles');
  });
});