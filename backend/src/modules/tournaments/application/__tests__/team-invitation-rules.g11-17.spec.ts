import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import { isExpired, invitationTtlMs, isReinvitable, normalizeInvitePhone, reinvitableStatus } from '../team-invitation.service.js';

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

/**
 * Phase 3 — the increments layered on top of G11.17: forming-team creation,
 * phone-number invitations, cancellation and safe re-invitation. The pure rules
 * are unit-tested here; the DB-backed flows live in
 * `tournament-team-invitation-lifecycle.phase3.integration.spec.ts`.
 */
describe('Phase 3 invitation lifecycle rules', () => {
  describe('normalizeInvitePhone', () => {
    it('keeps a leading + and strips every non-digit character', () => {
      expect(normalizeInvitePhone('+20 101 234 5678')).toBe('+201012345678');
      expect(normalizeInvitePhone('+20-101-234-5678')).toBe('+201012345678');
    });

    it('drops the + when the input has no leading plus (local form)', () => {
      expect(normalizeInvitePhone('0101 234 5678')).toBe('01012345678');
      expect(normalizeInvitePhone('(010) 1234-5678')).toBe('01012345678');
    });

    it('is defensive against empty / nullish input', () => {
      expect(normalizeInvitePhone('')).toBe('');
      expect(normalizeInvitePhone(null as unknown as string)).toBe('');
      expect(normalizeInvitePhone(undefined as unknown as string)).toBe('');
    });
  });

  describe('reinvitableStatus', () => {
    it('only rejected and expired invitations may be safely re-invited', () => {
      expect(reinvitableStatus('rejected')).toBe(true);
      expect(reinvitableStatus('expired')).toBe(true);
    });

    it('a pending invitation already stands and an accepted one means membership', () => {
      expect(reinvitableStatus('pending')).toBe(false);
      expect(reinvitableStatus('accepted')).toBe(false);
    });
  });

  describe('isReinvitable (F2 — an overdue pending invitation may be re-invited)', () => {
    const base: any = { id: 1, status: 'pending', expires_at: null };
    const future = () => new Date(Date.now() + 60_000).toISOString();
    const past = () => new Date(Date.now() - 1).toISOString();

    it('rejected and expired rows are re-invitable', () => {
      expect(isReinvitable({ ...base, status: 'rejected', expires_at: future() })).toBe(true);
      expect(isReinvitable({ ...base, status: 'expired', expires_at: past() })).toBe(true);
    });

    it('an OVERDUE pending row is re-invitable even without a prior lazy expiry', () => {
      // Regression (F2): expires_at is in the past while status is still
      // 'pending' because expiry is applied lazily on read/accept/reject.
      expect(isReinvitable({ ...base, status: 'pending', expires_at: past() })).toBe(true);
    });

    it('a non-overdue pending row is still rejected as a duplicate', () => {
      expect(isReinvitable({ ...base, status: 'pending', expires_at: future() })).toBe(false);
      expect(isReinvitable({ ...base, status: 'pending', expires_at: null })).toBe(false);
    });

    it('an accepted row is never re-invitable', () => {
      expect(isReinvitable({ ...base, status: 'accepted', expires_at: past() })).toBe(false);
    });

    it('a missing row is never re-invitable', () => {
      expect(isReinvitable(null)).toBe(false);
      expect(isReinvitable(undefined)).toBe(false);
    });
  });
});