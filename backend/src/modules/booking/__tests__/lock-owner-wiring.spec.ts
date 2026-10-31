import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * P4-03 — lock-ownership wiring guard.
 *
 * The Redis lock release is a compare-and-delete on the owner token. Every
 * acquisition must therefore use a token unique to THAT acquisition; a shared
 * per-user token lets a stale release (after TTL expiry) delete a newer lock.
 * These assertions fail against the pre-fix sources, which used
 * `user:${userId}` / `tournament:${userId}:${matchId}` / `scheduling:${userId}:${now}`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const backendSrc = resolve(here, '../../../../');

const FILES = [
  'src/modules/booking/application/booking.service.ts',
  'src/modules/booking/application/court-reservation.service.ts',
  'src/modules/scheduling/application/scheduling-booking.service.ts',
];

describe('booking lock ownership tokens', () => {
  it.each(FILES)('%s derives every lock owner from createLockOwner(...)', (rel) => {
    const source = readFileSync(resolve(backendSrc, rel), 'utf8');
    const assignments = [...source.matchAll(/const lockOwner = ([^\n;]+);/g)].map((m) => m[1]);

    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) {
      expect(value, `${rel} => ${value}`).toContain('createLockOwner(');
    }
    // No shared (per-user / per-match / timestamp) owner tokens remain.
    expect(source).not.toMatch(/lockOwner = `(user|tournament|scheduling):/);
  });
});
