// ============================================================================
// P0 — repository atomic-write contract.
//
// Unit-only: mysql pool/connection are fakes. Proves DELETE and INSERT use the
// SAME transaction connection and that a failed INSERT rolls the transaction
// back without committing.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakes = vi.hoisted(() => ({
  poolExecute: vi.fn(),
  acquireConnection: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: fakes.poolExecute }),
  acquireConnection: fakes.acquireConnection,
}));

import { RBACRepository } from '../infrastructure/repositories/rbac.repository.js';
import { withTransaction } from '../../../database/database.transaction.js';

function makeConn() {
  return {
    execute: vi.fn(),
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RBACRepository.setRolePermissions — transaction connection', () => {
  it('sends DELETE and INSERT through the exact same connection', async () => {
    const conn = makeConn();
    conn.execute
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []]);

    const repo = new RBACRepository();
    await repo.setRolePermissions(501, [1, 2], conn as any);

    expect(fakes.poolExecute).not.toHaveBeenCalled();
    expect(conn.execute).toHaveBeenCalledTimes(2);

    const [deleteSql, deleteParams] = conn.execute.mock.calls[0];
    const [insertSql, insertParams] = conn.execute.mock.calls[1];
    expect(String(deleteSql)).toContain('DELETE FROM role_permissions WHERE role_id = ?');
    expect(deleteParams).toEqual([501]);
    expect(String(insertSql)).toContain('INSERT INTO role_permissions');
    expect(insertParams).toEqual(undefined);
    expect(String(insertSql)).toContain('(501, 1)');
    expect(String(insertSql)).toContain('(501, 2)');
  });

  it('rolls back the transaction when the INSERT fails after DELETE', async () => {
    const conn = makeConn();
    conn.execute
      .mockResolvedValueOnce([{}, []])
      .mockRejectedValueOnce(new Error('insert failed'));
    fakes.acquireConnection.mockResolvedValueOnce(conn);

    const repo = new RBACRepository();

    await expect(
      withTransaction(async (transactionConn) =>
        repo.setRolePermissions(501, [1, 2], transactionConn),
      ),
    ).rejects.toThrow('insert failed');

    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
