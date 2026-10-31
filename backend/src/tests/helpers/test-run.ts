import { randomBytes } from 'node:crypto';

/**
 * Helpers for unique integration-test identities.
 *
 * The approved test strategy uses the existing `courtzon_v3` database, so test
 * rows must be identifiable per run and must not collide with other tests or
 * previous interrupted runs. These helpers are pure (no DB access).
 */

const ID_BASE = 700_000_000;
const ID_SPAN = 90_000_000;

/** Unique run marker, e.g. `cztest-payment-1729900000000-a1b2c3`. */
export function createTestRunMarker(label: string): string {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `cztest-${safeLabel}-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** Random numeric id in a high range that normal fixtures do not use. */
export function createTestNumericId(): number {
  return ID_BASE + Math.floor(Math.random() * ID_SPAN);
}

/** Deterministic 11-digit phone number derived from a test id. */
export function testPhoneFromId(id: number): string {
  return `010${String(id).padStart(8, '0').slice(-8)}`;
}

/** Unique test email built from a local part and the run marker. */
export function testEmail(localPart: string, runMarker: string): string {
  return `${localPart}-${runMarker}@courtzon.test`;
}
