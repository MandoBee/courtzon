import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mockExecute }),
}));

import { RBACRepository } from '../infrastructure/repositories/rbac.repository.js';

const cloneRow = (id: number, name: string, slug: string, organisationId: number | null) => ({
  id,
  name,
  slug,
  is_system: false,
  is_active: true,
  organisation_id: organisationId,
  deleted_at: null,
  organisation_name: null,
  permission_count: 0,
});

describe('RBACRepository.getRoles scope filtering', () => {
  let repo: RBACRepository;

  beforeEach(() => {
    mockExecute.mockReset();
    repo = new RBACRepository();
  });

  it('returns all roles (including org-scoped clones) when no scope is requested', async () => {
    const rows = [
      cloneRow(3, 'Org Admin', 'org-admin', null),
      cloneRow(1052, 'Org Admin', 'org-admin', 6),
    ];
    mockExecute.mockResolvedValueOnce([rows, []]);

    const result = await repo.getRoles(null, false);

    expect(result).toHaveLength(2);
    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).not.toContain('r.organisation_id IS NULL');
  });

  it('filters to global template roles only when scope=global — duplicate source rows cannot produce duplicate selector entries', async () => {
    const rows = [cloneRow(3, 'Org Admin', 'org-admin', null)];
    mockExecute.mockResolvedValueOnce([rows, []]);

    const result = await repo.getRoles(null, false, 'global');

    expect(result).toHaveLength(1);
    expect(result[0].organisation_id).toBeNull();
    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).toContain('AND r.organisation_id IS NULL');
  });

  it('combines scope=global with an organisation filter (org sees its own + system templates)', async () => {
    mockExecute.mockResolvedValueOnce([[cloneRow(3, 'Org Admin', 'org-admin', null)], []]);

    await repo.getRoles(6, false, 'global');

    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).toContain('AND r.organisation_id IS NULL');
    expect(sql).toContain('(r.organisation_id = ? OR (r.organisation_id IS NULL AND r.is_system = TRUE))');
    expect(mockExecute.mock.calls[0][1]).toEqual([6]);
  });

  it('still excludes soft-deleted roles unless includeDeleted is set', async () => {
    mockExecute.mockResolvedValueOnce([[cloneRow(3, 'Org Admin', 'org-admin', null)], []]);

    await repo.getRoles(null, true, 'global');

    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).not.toContain('deleted_at IS NULL');
  });
});
