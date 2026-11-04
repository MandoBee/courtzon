import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  createMatchInvalidationCoalescer,
  invalidateMatchKeys,
  MATCH_INVALIDATION_COALESCE_MS,
  MATCH_INVALIDATION_MAX_WAIT_MS,
} from './useRealtimeCacheUpdates';

/**
 * Trailing-coalescing contract for match invalidations.
 *
 * A single public-match lifecycle emits several socket signals back-to-back and
 * `match.available` is broadcast to the player room. Before coalescing, each
 * signal invalidated nine query roots immediately (plus per-match keys), so a
 * burst produced hundreds of refetches and could drain the per-IP API budget.
 * These tests pin the two properties that matter:
 *   1. a burst yields ONE flush of the unchanged roots;
 *   2. the last event of a burst is never lost — the window re-arms and the
 *      final flush still carries its match id.
 */

function createHarness(delayMs: number = MATCH_INVALIDATION_COALESCE_MS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const coalescer = createMatchInvalidationCoalescer(qc, delayMs);
  const keys = (): string[] =>
    spy.mock.calls.map((call: any) => JSON.stringify(call[0]?.queryKey));
  const countKey = (queryKey: unknown): number =>
    keys().filter((key) => key === JSON.stringify(queryKey)).length;
  return { qc, spy, coalescer, keys, countKey };
}

describe('createMatchInvalidationCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces a burst into a single flush of the unchanged roots', () => {
    const { coalescer, countKey, keys } = createHarness();

    // Five match signals inside the same window (one lifecycle + fan-out).
    for (let matchId = 101; matchId <= 105; matchId += 1) {
      coalescer.schedule({ matchId });
      // Simulate the events arriving a few milliseconds apart.
      vi.advanceTimersByTime(10);
    }

    // Nothing is invalidated while the window is still open.
    expect(countKey(['public-matches'])).toBe(0);

    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS);
    vi.runOnlyPendingTimers();

    // The shared list roots are flushed exactly once …
    expect(countKey(['public-matches'])).toBe(1);
    expect(countKey(['matches', 'upcoming'])).toBe(1);
    expect(countKey(['my-matches'])).toBe(1);
    // … and every match that appeared in the burst keeps its detail/result keys.
    for (let matchId = 101; matchId <= 105; matchId += 1) {
      expect(keys()).toContain(JSON.stringify(['match', matchId]));
      expect(keys()).toContain(JSON.stringify(['match-result', matchId]));
    }
  });

  it('never loses the final event when the window re-arms', () => {
    const { coalescer, countKey, keys } = createHarness();

    coalescer.schedule({ matchId: 201 });
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS - 50); // 50 ms left
    expect(countKey(['public-matches'])).toBe(0);

    // A late event re-arms the trailing window instead of flushing early.
    coalescer.schedule({ matchId: 202 });
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS - 50);
    expect(countKey(['public-matches'])).toBe(0);

    vi.advanceTimersByTime(50);
    vi.runOnlyPendingTimers();

    expect(countKey(['public-matches'])).toBe(1);
    expect(keys()).toContain(JSON.stringify(['match', 201]));
    expect(keys()).toContain(JSON.stringify(['match', 202]));
  });

  it('flushes queued work early via flush() without waiting for the window', () => {
    const { coalescer, countKey, keys } = createHarness();

    coalescer.schedule({ matchId: 301, bookingId: 401 }, { applicants: true });
    coalescer.flush();

    expect(countKey(['public-matches'])).toBe(1);
    expect(countKey(['match-applicants'])).toBe(1);
    expect(keys()).toContain(JSON.stringify(['match-applicants', 401]));
    expect(keys()).toContain(JSON.stringify(['match', 301]));

    // A second flush with nothing pending is a no-op.
    coalescer.flush();
    expect(countKey(['public-matches'])).toBe(1);
  });

  it('routes reconnect reconciliation through the same coalescer once', () => {
    const { coalescer, countKey } = createHarness();

    coalescer.scheduleReconcile();
    coalescer.scheduleReconcile();
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS);
    vi.runOnlyPendingTimers();

    // Reconnect roots (including non-match surfaces) flush exactly once.
    expect(countKey(['public-matches'])).toBe(1);
    expect(countKey(['tournaments'])).toBe(1);
    expect(countKey(['my', 'academy', 'enrollments'])).toBe(1);
  });

  it('drops queued work on cancel()', () => {
    const { coalescer, countKey } = createHarness();

    coalescer.schedule({ matchId: 501 });
    coalescer.cancel();
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS * 2);
    vi.runOnlyPendingTimers();

    expect(countKey(['public-matches'])).toBe(0);
  });

  it('flushes within the max wait even while events keep arriving', () => {
    const { coalescer, countKey, keys } = createHarness();

    coalescer.schedule({ matchId: 601 });
    // A continuous stream: one event every 200 ms for 2.2 s, each one re-arming
    // the 750 ms trailing window.
    for (let i = 1; i <= 11; i += 1) {
      vi.advanceTimersByTime(200);
      coalescer.schedule({ matchId: 600 + i });
    }

    // 2 200 ms in: trailing debounce alone would still be queued.
    expect(countKey(['public-matches'])).toBe(0);

    // The remainder of the max-wait ceiling forces the flush at 2 500 ms.
    vi.advanceTimersByTime(MATCH_INVALIDATION_MAX_WAIT_MS - 2_200);
    expect(countKey(['public-matches'])).toBe(1);
    // Every id that arrived before the flush is included.
    expect(keys()).toContain(JSON.stringify(['match', 601]));
    expect(keys()).toContain(JSON.stringify(['match', 611]));

    // A fresh event after the forced flush opens a new window.
    coalescer.schedule({ matchId: 700 });
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS - 1);
    expect(countKey(['public-matches'])).toBe(1);
    vi.advanceTimersByTime(1);
    expect(countKey(['public-matches'])).toBe(2);
  });

  it('covers all nine base roots exactly once per flush (dedupe by id)', () => {
    const baseRoots: ReadonlyArray<readonly (string | number)[]> = [
      ['public-matches'],
      ['my-matches'],
      ['home-upcoming-matches'],
      ['matches', 'upcoming'],
      ['match-result'],
      ['admin-matches'],
      ['org-matches'],
      ['admin-match-results'],
      ['org-match-results'],
    ];
    const { coalescer, countKey, keys } = createHarness();

    coalescer.schedule({ matchId: 801 });
    coalescer.schedule({ matchId: 801 }); // duplicate id must not duplicate keys
    coalescer.schedule({ matchId: 802 });
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS);

    for (const root of baseRoots) {
      expect(countKey(root)).toBe(1);
    }
    expect(countKey(['match', 801])).toBe(1);
    expect(countKey(['match', '801'])).toBe(1);
    expect(countKey(['match', 802])).toBe(1);
    expect(keys().filter((key) => key === JSON.stringify(['match', 801]))).toHaveLength(1);
  });

  it('applies the reconnect reconciliation and the burst ids in the same window', () => {
    const { coalescer, countKey, keys } = createHarness();

    coalescer.scheduleReconcile();
    coalescer.schedule({ matchId: 901 });
    vi.advanceTimersByTime(MATCH_INVALIDATION_COALESCE_MS);

    // Reconnect roots flush once …
    expect(countKey(['tournaments'])).toBe(1);
    expect(countKey(['public-matches'])).toBe(1);
    // … and the match id that arrived in the same window is still refreshed.
    expect(keys()).toContain(JSON.stringify(['match', 901]));
  });
});

describe('invalidateMatchKeys — numeric and string ids', () => {
  it('refreshes both key shapes once for a numeric id', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    invalidateMatchKeys(qc as any, { matchId: 15 });

    const keys = spy.mock.calls.map((call: any) => JSON.stringify(call[0]?.queryKey));
    expect(keys.filter((key) => key === JSON.stringify(['match', 15]))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(['match', '15']))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(['match-result', 15]))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(['match-result', '15']))).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it('refreshes both key shapes once for a string id ("15")', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    invalidateMatchKeys(qc as any, { matchId: '15' });

    const keys = spy.mock.calls.map((call: any) => JSON.stringify(call[0]?.queryKey));
    // Both shapes are covered — no numeric key is lost for a string payload …
    expect(keys.filter((key) => key === JSON.stringify(['match', 15]))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(['match', '15']))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(['match-result', 15]))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(['match-result', '15']))).toHaveLength(1);
    // … and nothing is emitted twice.
    expect(new Set(keys).size).toBe(keys.length);
    vi.restoreAllMocks();
  });
});
