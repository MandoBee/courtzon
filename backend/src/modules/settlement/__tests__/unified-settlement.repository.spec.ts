import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pure unit tests for the settlement → entitlement linking contract. No DB is
// opened: the caller's connection (`conn`) is a scripted stub and the global
// pool is spied so any accidental pool access fails the test.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const { unifiedSettlementRepository } = await import(
  '../infrastructure/repositories/unified-settlement.repository.js'
);
const { getPool } = await import('../../../database/mysql.js');

type ExecuteResult = [any, any];

/**
 * Scripts the CALLER'S connection in call order:
 *   1) reservation check (financial_entitlements.settlement_id)
 *   2) active-link conflict probe
 *   3) INSERT IGNORE
 *   4) completeness count
 */
function scriptConn(results: ExecuteResult[]) {
  const conn = {
    execute: vi.fn(async () => {
      const next = results.shift();
      if (!next) throw new Error('unexpected execute call');
      return next;
    }),
  };
  return conn as any;
}

function reserved(ids: number[], settlementId: number | null): ExecuteResult {
  return [ids.map((id) => ({ id, settlement_id: settlementId })), []];
}

function countResult(count: number): ExecuteResult {
  return [[{ cnt: count }], []];
}

describe('unifiedSettlementRepository.linkEntitlements — no silent partial linking', () => {
  let poolExecute: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Fail loudly if the repository bypasses the transaction connection.
    poolExecute = vi.spyOn(getPool(), 'execute');
  });

  it('no-ops (and touches nothing) when no entitlements are supplied', async () => {
    const conn = scriptConn([]);
    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [], conn),
    ).resolves.toBeUndefined();
    expect(conn.execute).not.toHaveBeenCalled();
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it('links the pairs through the caller connection and verifies completeness', async () => {
    const conn = scriptConn([
      reserved([101, 102], 55),
      [[], []], // no active conflict
      [{ affectedRows: 2 }, []], // insert
      countResult(2), // completeness proof
    ]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101, 102], conn),
    ).resolves.toBeUndefined();

    expect(conn.execute).toHaveBeenCalledTimes(4);
    expect(poolExecute).not.toHaveBeenCalled();

    const insertSql = String(conn.execute.mock.calls[2][0]);
    expect(insertSql).toContain('INSERT IGNORE INTO settlement_entitlements');
    expect(conn.execute.mock.calls[2][1]).toEqual([55, 101, 55, 102]);
  });

  it('is idempotent for the same settlement/entitlement pair', async () => {
    const conn = scriptConn([
      reserved([101, 102], 55),
      [[], []],
      [{ affectedRows: 0 }, []], // already linked
      countResult(2),
    ]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101, 102], conn),
    ).resolves.toBeUndefined();
  });

  it('deduplicates repeated ids before validating and inserting', async () => {
    const conn = scriptConn([
      reserved([101, 102], 55),
      [[], []],
      [{ affectedRows: 2 }, []],
      countResult(2),
    ]);

    await unifiedSettlementRepository.linkEntitlements(55, [101, 101, 102], conn);

    // Reservation lookup and insert both receive the deduplicated id set.
    expect(conn.execute.mock.calls[0][1]).toEqual([101, 102]);
    expect(conn.execute.mock.calls[2][1]).toEqual([55, 101, 55, 102]);
  });

  it('refuses an entitlement reserved by a DIFFERENT settlement', async () => {
    const conn = scriptConn([reserved([101], 44)]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101], conn),
    ).rejects.toThrow(/1 entitlement\(s\) are not reserved for this settlement/);

    // No conflict probe and no insert on a reservation mismatch.
    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  it('refuses an entitlement with no active reservation (settlement_id NULL)', async () => {
    const conn = scriptConn([reserved([101], null)]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101], conn),
    ).rejects.toThrow(/not reserved for this settlement/);

    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  it('refuses a partially existing entitlement set (missing row)', async () => {
    const conn = scriptConn([reserved([101], 55)]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101, 102], conn),
    ).rejects.toThrow(/1 entitlement\(s\) not found/);

    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  it('refuses an entitlement still actively linked to another settlement', async () => {
    const conn = scriptConn([
      reserved([101], 55),
      [[{ entitlement_id: 101, settlement_id: 44 }], []],
    ]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101], conn),
    ).rejects.toThrow(/still linked to another active settlement/);

    // No INSERT is attempted on a conflict.
    expect(conn.execute).toHaveBeenCalledTimes(2);
  });

  it('excludes HISTORICAL links from the conflict probe (only active links conflict)', async () => {
    const conn = scriptConn([
      reserved([101], 55),
      [[], []],
      [{ affectedRows: 1 }, []],
      countResult(1),
    ]);

    await unifiedSettlementRepository.linkEntitlements(55, [101], conn);

    const conflictSql = String(conn.execute.mock.calls[1][0]);
    // Historical links are those whose entitlement is no longer reserved by the
    // linked settlement; the predicate below is what makes re-use possible.
    expect(conflictSql).toContain('se.settlement_id <> ?');
    expect(conflictSql).toContain('fe.settlement_id = se.settlement_id');
  });

  it('throws (so the caller rolls back) when the insert produced a shortfall', async () => {
    const conn = scriptConn([
      reserved([101, 102], 55),
      [[], []],
      [{ affectedRows: 1 }, []],
      countResult(1), // only one of two pairs landed
    ]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(55, [101, 102], conn),
    ).rejects.toThrow(/missing entitlement links \(expected 2, linked 1\)/);
  });

  it('reports the settlement id in the shortfall error', async () => {
    const conn = scriptConn([
      reserved([101], 3777),
      [[], []],
      [{ affectedRows: 0 }, []],
      countResult(0),
    ]);

    await expect(
      unifiedSettlementRepository.linkEntitlements(3777, [101], conn),
    ).rejects.toThrow(/Settlement 3777 is missing entitlement links/);
  });
});
