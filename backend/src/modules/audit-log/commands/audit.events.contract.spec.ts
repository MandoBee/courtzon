import { describe, it, expect, vi } from 'vitest';
import { recordAuditHandler } from './record-audit.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/audit-log.repository.js', () => ({
  AuditLogRepository: vi.fn(),
  auditLogRepository: { create: vi.fn() },
}));

describe('Event contract: audit.recorded', () => {
  it('emits correct event name', () => {
    const events = recordAuditHandler.events!(
      { commandId: 'ec1', commandType: 'RecordAudit', aggregateType: 'audit', aggregateId: '0', payload: { action: 'USER.LOGIN', entityType: 'user' } } as Command,
      { recorded: true },
    );
    expect(events[0].eventName).toBe('audit.recorded');
  });

  it('contains required fields', () => {
    const events = recordAuditHandler.events!(
      { commandId: 'ec2', commandType: 'RecordAudit', aggregateType: 'audit', aggregateId: '0', payload: { action: 'USER.LOGIN', entityType: 'user' }, correlationId: 'corr-1' } as Command,
      { recorded: true },
    );
    expect(events[0].payload).toHaveProperty('action', 'USER.LOGIN');
    expect(events[0].payload).toHaveProperty('recorded', true);
    expect(events[0].context).toHaveProperty('correlationId', 'corr-1');
  });
});
