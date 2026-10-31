import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-06 — per-transaction after-commit isolation.
 *
 * Before the fix, after-commit hooks lived in a module-global array with an index
 * snapshot. Two overlapping transactions could therefore flush each other's events:
 * a committed transaction published a still-open (or rolled-back) transaction's
 * events → phantom realtime/notification events.
 */

const acquire = vi.hoisted(() => vi.fn());

vi.mock('../database/mysql.js', () => ({ acquireConnection: acquire }));

import {
  withTransaction,
  runProvidedTransaction,
  onAfterCommit,
  isInTransaction,
} from '../database/database.transaction.js';

function makeConn() {
  return {
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(),
  };
}

const tick = async (n = 8) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

beforeEach(() => acquire.mockReset());

describe('withTransaction — after-commit hook isolation', () => {
  it('never flushes another transaction\'s hooks when one transaction commits', async () => {
    const connA = makeConn();
    const connB = makeConn();
    acquire.mockResolvedValueOnce(connA).mockResolvedValueOnce(connB);

    const published: string[] = [];
    let releaseA: () => void = () => {};
    let releaseB: () => void = () => {};
    const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
    const gateB = new Promise<void>((resolve) => { releaseB = resolve; });

    const a = withTransaction(async () => {
      onAfterCommit(async () => { published.push('A'); });
      await gateA;
      return 'A';
    });
    const b = withTransaction(async () => {
      onAfterCommit(async () => { published.push('B'); });
      await gateB;
      return 'B';
    });

    await tick(); // both transactions have begun and registered their hooks
    releaseA();
    await expect(a).resolves.toBe('A');

    // B is still open: its event must NOT have been published by A's commit.
    expect(published).toEqual(['A']);

    releaseB();
    await expect(b).resolves.toBe('B');
    expect(published).toEqual(['A', 'B']);
  });

  it('discards the hooks of a rolled-back transaction', async () => {
    acquire.mockResolvedValue(makeConn());
    const published: string[] = [];

    await expect(
      withTransaction(async () => {
        onAfterCommit(async () => { published.push('rolled-back'); });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await tick();
    expect(published).toEqual([]);
  });

  it('runs hooks only after commit succeeds', async () => {
    const conn = makeConn();
    acquire.mockResolvedValueOnce(conn);
    const published: string[] = [];

    await withTransaction(async () => {
      onAfterCommit(async () => { published.push('committed'); });
      expect(published).toEqual([]); // still inside the transaction
    });

    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(published).toEqual(['committed']);
  });

  it('exposes isInTransaction only inside the callback', async () => {
    acquire.mockResolvedValue(makeConn());
    let inside = false;
    await withTransaction(async () => { inside = isInTransaction(); });
    expect(inside).toBe(true);
    expect(isInTransaction()).toBe(false);
  });
});

describe('runProvidedTransaction — same isolation guarantees', () => {
  it('flushes only its own hooks and discards them on rollback', async () => {
    const conn = makeConn();
    const published: string[] = [];

    await runProvidedTransaction(conn, async () => {
      onAfterCommit(async () => { published.push('provided'); });
      expect(isInTransaction()).toBe(true);
    });
    expect(published).toEqual(['provided']);

    const failing = makeConn();
    await expect(
      runProvidedTransaction(failing, async () => {
        onAfterCommit(async () => { published.push('discarded'); });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(published).toEqual(['provided']);
  });
});

describe('onAfterCommit outside a transaction', () => {
  it('runs the hook immediately instead of buffering it forever', async () => {
    const calls: string[] = [];
    onAfterCommit(async () => { calls.push('immediate'); });
    await tick();
    expect(calls).toEqual(['immediate']);
  });
});
