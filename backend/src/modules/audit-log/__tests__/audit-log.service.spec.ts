import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../infrastructure/audit-log.repository.js', () => ({
  auditLogRepository: repo,
}));

import { recordAudit } from '../application/audit-log.service.js';

const ENTRY = {
  actorId: 42,
  action: 'tournament.registration.paid',
  entityType: 'tournament_registration',
  entityId: 7,
};

const conn = { query: vi.fn(), execute: vi.fn() } as any;

beforeEach(() => {
  vi.clearAllMocks();
  repo.create.mockResolvedValue(undefined);
});

describe('recordAudit transaction contract', () => {
  it('preserves the default fire-and-forget behavior (audit failure is logged, not thrown)', async () => {
    repo.create.mockRejectedValueOnce(new Error('audit db down'));

    await expect(recordAudit(ENTRY)).resolves.toBeUndefined();
    expect(repo.create).toHaveBeenCalledWith(ENTRY, undefined);
  });

  it('binds the audit insert to the transaction connection', async () => {
    await recordAudit(ENTRY, { conn });

    expect(repo.create).toHaveBeenCalledWith(ENTRY, conn);
  });

  it('rethrows on opt-in so the caller transaction can roll back and retry', async () => {
    repo.create.mockRejectedValueOnce(new Error('audit db down'));

    await expect(recordAudit(ENTRY, { conn, throwOnError: true }))
      .rejects.toThrow('audit db down');
    expect(repo.create).toHaveBeenCalledWith(ENTRY, conn);
  });
});
