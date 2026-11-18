// ============================================================================
// UR-03/UR-07 — canonical active-role predicate.
//
// Role resolution must never surface an expired assignment or a disabled /
// soft-deleted role. This is the same predicate used by checkRole(),
// checkPermission() and the organisation-access guards.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakes = vi.hoisted(() => ({
  poolExecute: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: fakes.poolExecute }),
}));

import { RBACRepository } from '../infrastructure/repositories/rbac.repository.js';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.poolExecute.mockResolvedValue([[], []]);
});

describe('RBACRepository.getUserRoles — active role predicate', () => {
  it('requires active, unexpired assignments and active, non-deleted roles', async () => {
    const repo = new RBACRepository();
    await repo.getUserRoles(42);

    const [sql] = fakes.poolExecute.mock.calls[0];
    const query = String(sql);
    expect(query).toContain('ur.is_active = TRUE');
    expect(query).toContain('(ur.expires_at IS NULL OR ur.expires_at > NOW())');
    expect(query).toContain('r.is_active = TRUE');
    expect(query).toContain('r.deleted_at IS NULL');
  });
});
