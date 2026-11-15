import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Query-shape regression for the admin user detail read model.
 *
 * `RBACRepository.getUserById` previously ran `SELECT u.*`, which included
 * `users.password_hash`. The fix selects an explicit column list. This suite
 * pins the SQL so a future `u.*` (or any direct credential column) cannot be
 * reintroduced silently.
 */

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mockExecute }),
}));

import { RBACRepository } from '../infrastructure/repositories/rbac.repository.js';

describe('RBACRepository.getUserById query shape', () => {
  let repo: RBACRepository;

  beforeEach(() => {
    mockExecute.mockReset();
    repo = new RBACRepository();
  });

  it('does not select every users column', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 1 }], []]);
    await repo.getUserById(1);

    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).not.toMatch(/\bu\.\*/);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
  });

  it('never selects the password_hash (or other credential) columns', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 1 }], []]);
    await repo.getUserById(1);

    const sql = String(mockExecute.mock.calls[0][0]).toLowerCase();
    for (const column of [
      'password_hash',
      'refresh_token',
      'session_token',
      'remember_token',
      'reset_token',
      'two_factor_secret',
      'mfa_secret',
      'api_key',
      'api_secret',
    ]) {
      expect(sql).not.toContain(column);
    }
  });

  it('still returns the fields the admin detail screen needs', async () => {
    mockExecute.mockResolvedValueOnce([
      [{ id: 7, email: 'a@b.c', account_status: 'active', country_name: 'Egypt', roles: [] }],
      [],
    ]);
    const row = await repo.getUserById(7);

    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).toContain('u.public_id');
    expect(sql).toContain('u.account_status');
    expect(sql).toContain('u.last_login_at');
    expect(sql).toContain('u.has_activated_selling');
    expect(sql).toContain('country_name');
    expect(sql).toContain('coach_status');
    expect(row).toMatchObject({ id: 7, email: 'a@b.c', account_status: 'active' });
  });

  it('returns null when the user does not exist', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    await expect(repo.getUserById(404)).resolves.toBeNull();
  });
});
