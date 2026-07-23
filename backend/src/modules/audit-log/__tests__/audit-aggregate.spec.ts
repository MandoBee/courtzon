import { describe, it, expect } from 'vitest';
import { createAuditEntry } from '../domain/audit-log-aggregate.js';

describe('Audit Aggregate', () => {
  it('creates a valid audit entry', () => {
    const entry = createAuditEntry({ actorId: 1, action: 'USER.LOGIN', entityType: 'user' });
    expect(entry.action).toBe('USER.LOGIN');
    expect(entry.entityType).toBe('user');
  });

  it('rejects missing action', () => {
    expect(() => createAuditEntry({ actorId: 1, action: '', entityType: 'user' })).toThrow('action is required');
  });

  it('rejects missing entityType', () => {
    expect(() => createAuditEntry({ actorId: 1, action: 'USER.LOGIN', entityType: '' })).toThrow('entityType is required');
  });
});
