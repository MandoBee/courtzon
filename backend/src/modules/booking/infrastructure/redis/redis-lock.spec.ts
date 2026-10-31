import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-03 — Redis booking-lock primitive (previously untested).
 *
 * Deterministic fake Redis implementing exactly the commands the lock uses:
 * `SET key value PX ttl NX`, `GET`, `DEL`, and the two Lua scripts
 * (compare-and-delete release, prepare acquire/refresh). No real Redis, no DB.
 *
 * What is proven here: key isolation per court/date/slot, 15s create TTL and
 * 10min prepare TTL, ownership-safe release, partial-acquisition rollback and
 * the per-acquisition ownership token (a stale holder must never delete a newer
 * holder's lock — the defect class fixed in P4-03).
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('../../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: () => holder.client,
}));

import { RedisLock, createLockOwner } from './redis-lock.js';

interface Entry {
  value: string;
  expiresAt: number;
}

class FakeRedis {
  private store = new Map<string, Entry>();
  now = 0;
  setCalls: Array<[string, string, string, number, string]> = [];
  evalCalls: Array<{ key: string; args: Array<string | number> }> = [];

  async set(key: string, value: string, mode: string, ttl: number, nx: string): Promise<'OK' | null> {
    this.setCalls.push([key, value, mode, ttl, nx]);
    if (nx === 'NX' && this.current(key) !== null) return null;
    this.store.set(key, { value, expiresAt: this.now + ttl });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.current(key);
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async eval(script: string, numKeys: number, key: string, ...args: Array<string | number>): Promise<unknown> {
    void numKeys;
    this.evalCalls.push({ key, args });
    const current = this.current(key);
    if (script.includes('redis.call("set"')) {
      const [owner, ttl] = args;
      if (current === null || current === owner) {
        this.store.set(key, { value: String(owner), expiresAt: this.now + Number(ttl) });
        return 'OK';
      }
      return null;
    }
    if (current !== null && current === args[0]) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }

  private current(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
}

const DATE = '2027-03-15';
let fake: FakeRedis;
let lock: RedisLock;

beforeEach(() => {
  fake = new FakeRedis();
  holder.client = fake;
  lock = new RedisLock();
});

describe('RedisLock — key isolation', () => {
  it('uses one key per court/date/slot and never shares keys across courts, dates or slots', () => {
    const keys = new Set([
      lock.lockKey(7, DATE, '10:00'),
      lock.lockKey(8, DATE, '10:00'),
      lock.lockKey(7, '2027-03-16', '10:00'),
      lock.lockKey(7, DATE, '11:00'),
    ]);
    expect(keys.size).toBe(4);
    expect(lock.lockKey(7, DATE, '10:00')).toBe('booking:lock:7:2027-03-15:10:00');
  });

  it('keeps coach locks in a separate namespace from court locks', () => {
    expect(lock.coachLockKey(7, DATE, '10:00')).not.toBe(lock.lockKey(7, DATE, '10:00'));
  });
});

describe('RedisLock — acquire/TTL/ownership', () => {
  it('acquires with SET NX PX 15000 and rejects a second holder', async () => {
    expect(await lock.acquire(7, DATE, '10:00', 'owner-a')).toBe(true);
    expect(fake.setCalls[0]).toEqual(['booking:lock:7:2027-03-15:10:00', 'owner-a', 'PX', 15000, 'NX']);
    expect(await lock.acquire(7, DATE, '10:00', 'owner-b')).toBe(false);
  });

  it('allows a new holder after the 15s TTL expires', async () => {
    await lock.acquire(7, DATE, '10:00', 'owner-a');
    fake.now += 15001;
    expect(await lock.acquire(7, DATE, '10:00', 'owner-b')).toBe(true);
  });

  it('acquires the prepare lock with a 10-minute TTL and refreshes it for the same owner', async () => {
    expect(await lock.acquireForPrepare(7, DATE, '10:00', 'prep-owner')).toBe(true);
    expect(fake.evalCalls[0]).toEqual({ key: 'booking:lock:7:2027-03-15:10:00', args: ['prep-owner', 600000] });
    expect(await lock.acquireForPrepare(7, DATE, '10:00', 'prep-owner')).toBe(true);
    expect(await lock.acquireForPrepare(7, DATE, '10:00', 'other')).toBe(false);
  });

  it('releases only when the caller owns the lock (compare-and-delete)', async () => {
    await lock.acquire(7, DATE, '10:00', 'owner-a');
    await lock.release(7, DATE, '10:00', 'owner-b');
    expect(await fake.get(lock.lockKey(7, DATE, '10:00'))).toBe('owner-a');
    expect(await lock.acquire(7, DATE, '10:00', 'owner-c')).toBe(false);

    await lock.release(7, DATE, '10:00', 'owner-a');
    expect(await fake.get(lock.lockKey(7, DATE, '10:00'))).toBeNull();
  });
});

describe('RedisLock — lock acquisition rollback', () => {
  it('releases already-acquired slots when a later slot is taken', async () => {
    await lock.acquire(8, DATE, '10:00', 'other-user');
    const acquired = await lock.acquireAll(
      [
        { resourceId: 7, date: DATE, slotStart: '09:00' },
        { resourceId: 8, date: DATE, slotStart: '10:00' },
      ],
      'owner-x',
    );
    expect(acquired).toBe(false);
    expect(await fake.get(lock.lockKey(7, DATE, '09:00'))).toBeNull();
    expect(await fake.get(lock.lockKey(8, DATE, '10:00'))).toBe('other-user');
  });

  it('returns false without acquiring anything when the budget is already spent', async () => {
    const acquired = await lock.acquireAll([{ resourceId: 7, date: DATE, slotStart: '09:00' }], 'owner-x', -1);
    expect(acquired).toBe(false);
    expect(fake.setCalls).toHaveLength(0);
  });

  it('acquires every slot then releases them all', async () => {
    const slots = [
      { resourceId: 7, date: DATE, slotStart: '09:00' },
      { resourceId: 7, date: DATE, slotStart: '10:00' },
    ];
    expect(await lock.acquireAll(slots, 'owner-x')).toBe(true);
    await lock.releaseAll(slots, 'owner-x');
    expect(await fake.get(lock.lockKey(7, DATE, '09:00'))).toBeNull();
    expect(await fake.get(lock.lockKey(7, DATE, '10:00'))).toBeNull();
  });

  it('rolls back partial prepare acquisitions too', async () => {
    await lock.acquireForPrepare(8, DATE, '10:00', 'other-user');
    const acquired = await lock.acquireAllForPrepare(
      [
        { resourceId: 7, date: DATE, slotStart: '09:00' },
        { resourceId: 8, date: DATE, slotStart: '10:00' },
      ],
      'owner-x',
    );
    expect(acquired).toBe(false);
    expect(await fake.get(lock.lockKey(7, DATE, '09:00'))).toBeNull();
  });
});

describe('RedisLock — per-acquisition ownership token (P4-03 fix)', () => {
  it('generates a distinct token per acquisition, keeping the scope readable', () => {
    const a = createLockOwner('user:42');
    const b = createLockOwner('user:42');
    expect(a).not.toBe(b);
    expect(a.startsWith('user:42:')).toBe(true);
    expect(b.startsWith('user:42:')).toBe(true);
  });

  it('demonstrates the defect class: a shared legacy token lets a stale release delete the newer lock', async () => {
    const legacyOwner = 'user:42'; // pre-P4-03 form: identical for every request of the user
    await lock.acquire(7, DATE, '10:00', legacyOwner);
    fake.now += 15001; // first request outlives the TTL (e.g. slow gateway call)
    expect(await lock.acquire(7, DATE, '10:00', legacyOwner)).toBe(true);
    await lock.release(7, DATE, '10:00', legacyOwner); // stale request releases the new holder
    expect(await fake.get(lock.lockKey(7, DATE, '10:00'))).toBeNull();
  });

  it('unique tokens prevent the stale release from deleting the newer lock', async () => {
    const first = createLockOwner('user:42');
    const second = createLockOwner('user:42');
    await lock.acquire(7, DATE, '10:00', first);
    fake.now += 15001;
    expect(await lock.acquire(7, DATE, '10:00', second)).toBe(true);
    await lock.release(7, DATE, '10:00', first);
    expect(await fake.get(lock.lockKey(7, DATE, '10:00'))).toBe(second);
  });
});
