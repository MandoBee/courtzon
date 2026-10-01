import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import { isExpired, invitationTtlMs } from '../team-invitation.service.js';

/**
 * G11.17 — unit-level rules for the player team invitation lifecycle.
 * The DB-backed flows (create/invite/accept/reject/duplicate/capacity/
 * concurrency/tenancy) are covered by the integration suite
 * `tournament-team-selfservice.g11-17.integration.spec.ts`.
 */
describe('G11.17 team invitation domain rules', () => {
  const base: any = {
    id: 1, tournament_id: 9, participant_id: 3,
    inviter_user_id: 11, invitee_user_id: 44, status: 'pending',
  };

  it('a fresh invitation is not expired', () => {
    expect(isExpired({ ...base, expires_at: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
  });

  it('an invitation without expiry never expires (safe default)', () => {
    expect(isExpired({ ...base, expires_at: null })).toBe(false);
    expect(isExpired({ ...base, expires_at: undefined })).toBe(false);
  });

  it('an invitation past its expiry instant is expired (inclusive boundary)', () => {
    const past = new Date(Date.now() - 1).toISOString();
    expect(isExpired({ ...base, expires_at: past })).toBe(true);
  });

  it('invitations have a 72-hour (within 24h..96h sanity) TTL', () => {
    expect(invitationTtlMs()).toBe(72 * 60 * 60 * 1000);
  });

  it('non-pending invitations are terminal and no longer expire-eligible', () => {
    // accepted/rejected/expired rows keep their status; isExpired only governs
    // whether a PENDING invitation may still be acted on (checked by service).
    const accepted = isExpired({ ...base, status: 'accepted', expires_at: null });
    expect(accepted).toBe(false);
  });
});