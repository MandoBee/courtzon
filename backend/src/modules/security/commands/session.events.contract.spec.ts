import { describe, it, expect, vi } from 'vitest';
import { revokeSessionHandler } from './revoke-session.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/security.repository.js', () => ({
  SecurityRepository: vi.fn(),
  securityRepository: { getSessionById: vi.fn(), revokeSession: vi.fn() },
}));

describe('Event contract: session.revoked', () => {
  it('emits correct event name', () => {
    const events = revokeSessionHandler.events!(
      { commandId: 'ec1', commandType: 'RevokeSession', aggregateType: 'session', aggregateId: '1', payload: { sessionId: 1 } } as Command,
      { sessionId: 1, revoked: true },
    );
    expect(events[0].eventName).toBe('session.revoked');
  });

  it('contains required fields', () => {
    const events = revokeSessionHandler.events!(
      { commandId: 'ec2', commandType: 'RevokeSession', aggregateType: 'session', aggregateId: '1', payload: { sessionId: 1 }, correlationId: 'corr-1' } as Command,
      { sessionId: 1, revoked: true },
    );
    expect(events[0].payload).toHaveProperty('sessionId', 1);
    expect(events[0].payload).toHaveProperty('revoked', true);
    expect(events[0].context).toHaveProperty('aggregateType', 'session');
    expect(events[0].context).toHaveProperty('correlationId', 'corr-1');
  });
});
