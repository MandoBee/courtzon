import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-02 — session revocation edge case.
 *
 * `POST /auth/logout` is a public route (no authMiddleware), so `request.userId`
 * is never set there. `{ allDevices: true }` must therefore resolve the user from
 * the refresh-token session before revoking every session; otherwise the flag is a
 * silent no-op and other devices stay signed in.
 */

const sessionRepo = vi.hoisted(() => ({
  findByRefreshTokenHash: vi.fn(),
  revoke: vi.fn(async () => undefined),
  revokeAllForUser: vi.fn(async () => undefined),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })) }));
vi.mock('../infrastructure/repositories/session.repository.js', () => ({ sessionRepository: sessionRepo }));
vi.mock('../infrastructure/repositories/user.repository.js', () => ({ userRepository: {} }));
vi.mock('../infrastructure/repositories/device.repository.js', () => ({ DeviceRepository: class {} }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: {} }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: {} }));

import { authService } from '../application/auth.service.js';

const USER_ID = 42;
const SESSION_ID = 5;
const REFRESH = 'refresh-token-value';

describe('AuthService.logout — all-device revocation from a public route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRepo.findByRefreshTokenHash.mockResolvedValue({
      id: SESSION_ID,
      user_id: USER_ID,
      is_revoked: false,
      expires_at: new Date(Date.now() + 3600_000),
      refresh_token_expires_at: new Date(Date.now() + 86_400_000),
    });
  });

  it('revokes every session for the token owner when allDevices is requested without request.userId', async () => {
    await authService.logout(REFRESH, true, undefined);
    expect(sessionRepo.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
  });

  it('revokes only the presented session for a normal logout', async () => {
    await authService.logout(REFRESH, false, undefined);
    expect(sessionRepo.revoke).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});
