import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-05 — B27: channel failover/preference resolution.
 * Real `failover.service` against a mocked pool; corrupted preference JSON must
 * never break dispatch.
 */

const pool = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

import {
  getChannelPreferences,
  getEffectiveChannels,
  getFailoverChain,
} from '../application/failover.service.js';

function rowsFor(pref: Record<string, unknown> | null) {
  pool.execute.mockResolvedValue([pref ? [pref] : []]);
}

describe('notification channel preferences / failover', () => {
  beforeEach(() => pool.execute.mockReset());

  it('defaults to in_app when the user has no preference row', async () => {
    rowsFor(null);
    await expect(getChannelPreferences(1, 'bookings')).resolves.toEqual({
      channels: ['in_app'], failoverEnabled: false, failoverChain: null,
    });
    await expect(getEffectiveChannels(1, 'bookings')).resolves.toEqual(['in_app']);
    await expect(getFailoverChain(1, 'bookings')).resolves.toBeNull();
  });

  it('returns the configured channels when failover is disabled', async () => {
    rowsFor({ channels: '["email","sms"]', failover_enabled: 0, failover_chain: '["in_app"]' });
    await expect(getEffectiveChannels(1, 'bookings')).resolves.toEqual(['email', 'sms']);
    await expect(getFailoverChain(1, 'bookings')).resolves.toBeNull();
  });

  it('merges the failover chain into the effective channels (deduplicated)', async () => {
    rowsFor({ channels: '["email"]', failover_enabled: 1, failover_chain: '["in_app","push","email"]' });
    await expect(getFailoverChain(1, 'bookings')).resolves.toEqual(['in_app', 'push', 'email']);
    await expect(getEffectiveChannels(1, 'bookings')).resolves.toEqual(['email', 'in_app', 'push']);
  });

  it('accepts an already-parsed JSON array from the driver', async () => {
    rowsFor({ channels: ['push'], failover_enabled: 1, failover_chain: ['sms'] });
    await expect(getEffectiveChannels(1, 'bookings')).resolves.toEqual(['push', 'sms']);
  });

  it('falls back to in_app when the stored channels JSON is corrupted', async () => {
    rowsFor({ channels: '{not-json', failover_enabled: 0, failover_chain: null });
    await expect(getChannelPreferences(1, 'bookings')).resolves.toEqual({
      channels: ['in_app'], failoverEnabled: false, failoverChain: null,
    });
  });

  it('ignores a corrupted failover chain instead of throwing', async () => {
    rowsFor({ channels: '["email"]', failover_enabled: 1, failover_chain: '{broken' });
    await expect(getFailoverChain(1, 'bookings')).resolves.toBeNull();
    await expect(getEffectiveChannels(1, 'bookings')).resolves.toEqual(['email']);
  });
});
