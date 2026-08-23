import { describe, it, expect } from 'vitest';
import { normalizeSportInterests } from '../domain/sport-interests.js';

/**
 * Regression coverage for the main-sport / sport-interests invariant:
 *   1. the main sport always appears in interests;
 *   2. it can never be duplicated (UI prevents selecting it as secondary);
 *   3. changing the main sport moves the auto-managed entry;
 *   4. explicit secondary selections are preserved;
 *   5. no duplicates are created when the interest already exists.
 */
describe('normalizeSportInterests', () => {
  it('adds the main sport to the saved interests (registration without explicit interest)', () => {
    expect(normalizeSportInterests(2, [])).toEqual([2]);
    expect(normalizeSportInterests(2, undefined)).toEqual([2]);
  });

  it('keeps secondary sports after the main sport and preserves their order', () => {
    expect(normalizeSportInterests(2, [5, 9])).toEqual([2, 5, 9]);
  });

  it('does not duplicate the main sport if it was already selected', () => {
    expect(normalizeSportInterests(2, [7, 2])).toEqual([2, 7]);
    expect(normalizeSportInterests(2, [2])).toEqual([2]);
  });

  it('drops the previous main sport and adds the new one on change', () => {
    expect(normalizeSportInterests(4, [2, 5], 2)).toEqual([4, 5]);
  });

  it('is a no-op when the main sport is unchanged', () => {
    expect(normalizeSportInterests(2, [2, 5, 9], 2)).toEqual([2, 5, 9]);
  });

  it('removes the previous main sport even when only the main sport is updated (no interests payload)', () => {
    // Profile save that changes only the main sport: provided list is empty,
    // but the previous auto-managed entry must not survive.
    expect(normalizeSportInterests(6, [], 3)).toEqual([6]);
  });

  it('ignores invalid ids and dedupes the payload', () => {
    expect(normalizeSportInterests(1, [0, -2, 3, 3, Number.NaN])).toEqual([1, 3]);
    expect(normalizeSportInterests(null, [3, 3])).toEqual([3]);
  });
});
