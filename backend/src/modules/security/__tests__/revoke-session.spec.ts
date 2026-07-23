import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revokeSessionHandler } from '../commands/revoke-session.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const mockSession = { id: 1, user_id: 1, is_revoked: false, expires_at: '2026-07-25', suspicious: false };

vi.mock('../infrastructure/security.repository.js', () => ({
  SecurityRepository: vi.fn(),
  securityRepository: { getSessionById: vi.fn(), revokeSession: vi.fn() },
}));

const { securityRepository } = await import('../infrastructure/security.repository.js');

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'sec-test-1',
    commandType: 'RevokeSession',
    aggregateType: 'session',
    aggregateId: '1',
    payload: { sessionId: 1, ...overrides },
    correlationId: 'corr-1',
  };
}

describe('RevokeSession command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    await expect(revokeSessionHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing sessionId', async () => {
    await expect(revokeSessionHandler.validate(makeCommand({ sessionId: 0 }))).rejects.toThrow('sessionId is required');
  });

  it('revokes an active session', async () => {
    vi.mocked(securityRepository.getSessionById).mockResolvedValue(mockSession);

    const result = await revokeSessionHandler.execute(makeCommand(), {} as any);
    expect(result.sessionId).toBe(1);
    expect(result.revoked).toBe(true);
    expect(securityRepository.revokeSession).toHaveBeenCalledWith(1);
  });

  it('skips if already revoked', async () => {
    vi.mocked(securityRepository.getSessionById).mockResolvedValue({ ...mockSession, is_revoked: true });

    const result = await revokeSessionHandler.execute(makeCommand(), {} as any);
    expect(result.revoked).toBe(false);
    expect(securityRepository.revokeSession).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for unknown session', async () => {
    vi.mocked(securityRepository.getSessionById).mockResolvedValue(null);
    await expect(revokeSessionHandler.execute(makeCommand(), {} as any)).rejects.toThrow();
  });

  it('emits session.revoked event on success', () => {
    const events = revokeSessionHandler.events!(makeCommand(), { sessionId: 1, revoked: true });
    expect(events[0].eventName).toBe('session.revoked');
    expect(events[0].context.aggregateType).toBe('session');
  });
});
