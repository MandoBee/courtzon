// ============================================================================
// Academy G4 — isAcademyGroupStarted (real helper, mocked DB)
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
});

const poolState = vi.hoisted(() => ({ rows: [] as any[], calls: 0 }));
const fakePool = vi.hoisted(() => ({
  query: async () => {
    poolState.calls += 1;
    return [poolState.rows, []];
  },
  execute: async () => [{ affectedRows: 0 }],
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));

import { isAcademyGroupStarted } from '../application/academy-start.js';

beforeEach(() => {
  poolState.rows = [];
  poolState.calls = 0;
});

describe('G4 isAcademyGroupStarted', () => {
  it('mock pool is used (calls recorded)', async () => {
    poolState.rows = [{}];
    await isAcademyGroupStarted(2);
    expect(poolState.calls).toBeGreaterThan(0);
  });
  it('no sessions -> not started', async () => {
    poolState.rows = [{}];
    expect(await isAcademyGroupStarted(2)).toBe(false);
  });

  it('earliest future session -> not started', async () => {
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');
    poolState.rows = [{ any_started: 0, earliest_utc: future, earliest_date: null }];
    expect(await isAcademyGroupStarted(2)).toBe(false);
  });

  it('earliest session begun (utc <= now) -> started', async () => {
    const past = new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' ');
    poolState.rows = [{ any_started: 0, earliest_utc: past, earliest_date: null }];
    expect(await isAcademyGroupStarted(2)).toBe(true);
  });

  it('in_progress session -> started', async () => {
    poolState.rows = [{ any_started: 1, earliest_utc: null, earliest_date: null }];
    expect(await isAcademyGroupStarted(2)).toBe(true);
  });

  it('completed earliest session -> started', async () => {
    poolState.rows = [{ any_started: 1, earliest_utc: null, earliest_date: null }];
    expect(await isAcademyGroupStarted(2)).toBe(true);
  });

  it('legacy session without utc with past date -> started', async () => {
    poolState.rows = [{ any_started: 0, earliest_utc: null, earliest_date: '2020-01-01' }];
    expect(await isAcademyGroupStarted(2)).toBe(true);
  });
});