import { describe, it, expect } from 'vitest';
import { canRevokeSession } from '../domain/security-aggregate.js';

describe('Security Aggregate', () => {
  it('allows revoking an active session', () => {
    expect(canRevokeSession({ id: 1, user_id: 1, is_revoked: false, expires_at: '2026-07-25', suspicious: false })).toBe(true);
  });

  it('rejects revoking an already revoked session', () => {
    expect(canRevokeSession({ id: 1, user_id: 1, is_revoked: true, expires_at: '2026-07-25', suspicious: false })).toBe(false);
  });
});
