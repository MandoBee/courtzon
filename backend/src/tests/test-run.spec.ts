import { describe, it, expect } from 'vitest';

import {
  createTestNumericId,
  createTestRunMarker,
  testEmail,
  testPhoneFromId,
} from './helpers/test-run.js';

/** Pure tests for the unique integration-test identity helpers (no DB). */
describe('integration test-run helpers', () => {
  it('creates unique, filesystem/DB-safe run markers', () => {
    const a = createTestRunMarker('Payment Run');
    const b = createTestRunMarker('payment run');
    expect(a).toMatch(/^cztest-payment-run-\d+-[0-9a-f]{6}$/);
    expect(b).toMatch(/^cztest-payment-run-\d+-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
  });

  it('creates numeric ids in the high test range', () => {
    for (let i = 0; i < 5; i++) {
      const id = createTestNumericId();
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(700_000_000);
      expect(id).toBeLessThan(790_000_000);
    }
  });

  it('derives a valid 11-digit phone number from an id', () => {
    for (const id of [700_000_001, 712_345_678, 789_999_999]) {
      const phone = testPhoneFromId(id);
      expect(phone).toMatch(/^010\d{8}$/);
      expect(phone).toHaveLength(11);
    }
  });

  it('builds unique emails from the local part and run marker', () => {
    const marker = createTestRunMarker('email');
    expect(testEmail('player', marker)).toBe(`player-${marker}@courtzon.test`);
  });
});
