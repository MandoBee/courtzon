// ============================================================================
// R4 — getAssignableOrgRole must resolve the GLOBAL template only.
// Unit-only: `getPool` is mocked; no DB connection is opened.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute }),
}));

const { getAssignableOrgRole } = await import('../infrastructure/repositories/org-portal.repository.js');

describe('getAssignableOrgRole — global template resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries ONLY global, non-deleted roles and never an organisation clone', async () => {
    execute.mockResolvedValueOnce([
      [{ id: 900, slug: 'accountant', name: 'Accountant', organisation_id: null }],
      [],
    ]);

    const role = await getAssignableOrgRole('accountant');

    expect(role).toMatchObject({ id: 900, slug: 'accountant', organisation_id: null });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('organisation_id IS NULL');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('slug = ?');
    expect(params).toEqual(['accountant']);
  });

  it('returns null for a slug outside the approved assignable list', async () => {
    const role = await getAssignableOrgRole('finance-manager');
    expect(role).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});
