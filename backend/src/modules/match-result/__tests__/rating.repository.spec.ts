import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// Stateful mock pool: rating_evidence rows keyed by id, UPDATE rewrites meta.
const store = vi.hoisted(() => [] as Array<{ id: number; meta: any }>);
const executed = vi.hoisted(() => [] as string[]);
const params = vi.hoisted(() => [] as any[][]);

function seedStore(rows: Array<{ id: number; meta: any }>) {
  store.length = 0;
  for (const r of rows) store.push({ id: r.id, meta: r.meta });
}

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async (sql: string, p: any[] = []) => {
      executed.push(sql);
      params.push(p);
      if (sql.startsWith('SELECT id, meta FROM rating_evidence')) {
        return [store.map((r) => ({ id: r.id, meta: r.meta })), []];
      }
      if (sql.startsWith('UPDATE rating_evidence SET meta')) {
        const next = JSON.parse(p[0]);
        const target = store.find((r) => r.id === p[1]);
        if (target) target.meta = next;
        return [[], []];
      }
      return [[], []];
    },
    getConnection: async () => ({
      beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: async () => [[], []],
    }),
  }),
}));

import { ratingRepository } from '../infrastructure/rating.repository.js';

beforeEach(() => {
  executed.length = 0;
  params.length = 0;
  store.length = 0;
});

describe('Round 4 — multi-interval validity history (setEvidenceActive)', () => {
  it('appends transitions rather than overwriting historical validity', async () => {
    seedStore([{ id: 1, meta: { active: true } }]);
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-10T12:00:00.000Z');
    await ratingRepository.setEvidenceActive('match_result', 42, true, '2026-09-15T00:00:00.000Z');
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-20T00:00:00.000Z');
    await ratingRepository.setEvidenceActive('match_result', 42, true, '2026-09-25T00:00:00.000Z');
    expect(store[0].meta.validity_history).toEqual([
      { active: false, at: '2026-09-10T12:00:00.000Z' },
      { active: true, at: '2026-09-15T00:00:00.000Z' },
      { active: false, at: '2026-09-20T00:00:00.000Z' },
      { active: true, at: '2026-09-25T00:00:00.000Z' },
    ]);
    expect(store[0].meta.active).toBe(true);
    // never deletes the row
    expect(executed.some((sql) => sql.includes('DELETE'))).toBe(false);
  });

  it('TEST 6 — idempotent: repeated same-state transitions append nothing', async () => {
    seedStore([{ id: 1, meta: { active: true } }]);
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-10T12:00:00.000Z');
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-10T12:00:00.000Z');
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-11T00:00:00.000Z');
    expect(store[0].meta.validity_history).toEqual([
      { active: false, at: '2026-09-10T12:00:00.000Z' },
    ]);
    expect(store[0].meta.active).toBe(false);
  });

  it('TEST 7 — Round-3 single-cycle evidence remains preserved (no history added unless state changes)', async () => {
    seedStore([{ id: 1, meta: { active: false, invalidated_at: '2026-09-10T12:00:00.000Z', reactivated_at: '2026-09-15T00:00:00.000Z' } }]);
    // same current state (inactive) → no new transition, existing fields untouched
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-20T00:00:00.000Z');
    expect(store[0].meta.validity_history).toBeUndefined();
    expect(store[0].meta.invalidated_at).toBe('2026-09-10T12:00:00.000Z');
  });

  it('reactivates a Round-3 row by appending an active transition', async () => {
    seedStore([{ id: 1, meta: { active: false, invalidated_at: '2026-09-10T12:00:00.000Z' } }]);
    await ratingRepository.setEvidenceActive('match_result', 42, true, '2026-09-15T00:00:00.000Z');
    expect(store[0].meta.validity_history).toEqual([{ active: true, at: '2026-09-15T00:00:00.000Z' }]);
    expect(store[0].meta.active).toBe(true);
    expect(store[0].meta.invalidated_at).toBe('2026-09-10T12:00:00.000Z');
  });

  it('no-op when there are no evidence rows for the source', async () => {
    seedStore([]);
    await ratingRepository.setEvidenceActive('match_result', 42, false, '2026-09-10T12:00:00.000Z');
    expect(executed.some((sql) => sql.startsWith('UPDATE rating_evidence'))).toBe(false);
  });
});