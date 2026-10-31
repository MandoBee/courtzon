import { describe, it, expect, vi } from 'vitest';

import {
  APPROVED_TEST_DATABASE,
  DESTRUCTIVE_CLEANUP_CONFIRMATION,
  assertApprovedTestTarget,
  assertDestructiveCleanupAuthorized,
  isApprovedTestDatabase,
  isApprovedTestTarget,
  isDestructiveCleanupAuthorized,
  runSafeCleanup,
  type DestructiveCleanupAuthorization,
} from '../../../e2e/helpers/cleanup-guard.js';

/**
 * Phase 1 safety gates (user-approved strategy: existing `courtzon_v3` only).
 *
 * These tests use only pure validation and mock connections: no MySQL driver,
 * network, database, or environment configuration is touched.
 */

const validTarget = { host: '127.0.0.1', port: 3307, database: APPROVED_TEST_DATABASE };

const validAuthorization: DestructiveCleanupAuthorization = {
  database: APPROVED_TEST_DATABASE,
  campaign: 'cztest-2026-10-26-final',
  confirmation: DESTRUCTIVE_CLEANUP_CONFIRMATION,
};

describe('test database target guard', () => {
  it('accepts the approved local target (courtzon_v3 on loopback:3307)', () => {
    expect(isApprovedTestTarget(validTarget)).toBe(true);
    expect(() => assertApprovedTestTarget(validTarget)).not.toThrow();
    expect(isApprovedTestDatabase('courtzon_v3')).toBe(true);
  });

  it('rejects any other database name (including the rejected _e2e proposal)', () => {
    for (const database of ['courtzon_v2', 'courtzon_v3_e2e', 'courtzon_v3_test', 'test', '', '   ']) {
      const target = { ...validTarget, database };
      expect(isApprovedTestTarget(target)).toBe(false);
      expect(() => assertApprovedTestTarget(target)).toThrow(/refused/i);
    }
  });

  it('rejects invalid database names before any connection', () => {
    for (const database of ['courtzon_v3;DROP', 'courtzon-v3', 'courtzon_v3`']) {
      expect(() => assertApprovedTestTarget({ ...validTarget, database })).toThrow(
        /invalid database name/i,
      );
    }
  });

  it('rejects non-loopback hosts to prevent remote/production targeting', () => {
    for (const host of ['10.0.0.5', 'db.internal', 'mysql', '0.0.0.0', '']) {
      const target = { ...validTarget, host };
      expect(isApprovedTestTarget(target)).toBe(false);
      expect(() => assertApprovedTestTarget(target)).toThrow(/loopback/i);
    }
  });

  it('rejects every port except the local Docker test port 3307', () => {
    for (const port of [3306, 3000, 3308, 0, Number.NaN]) {
      const target = { ...validTarget, port };
      expect(isApprovedTestTarget(target)).toBe(false);
      expect(() => assertApprovedTestTarget(target)).toThrow(/port/i);
    }
  });
});

describe('destructive cleanup authorization guard', () => {
  it('refuses cleanup without explicit authorization', () => {
    expect(isDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, undefined)).toBe(false);
    expect(() => assertDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, undefined)).toThrow(
      /authorization is required/i,
    );
  });

  it('refuses a wrong confirmation token', () => {
    const authorization = { ...validAuthorization, confirmation: 'YES' as never };
    expect(isDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, authorization)).toBe(false);
    expect(() =>
      assertDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, authorization),
    ).toThrow(/confirmation token/i);
  });

  it('refuses a missing/empty campaign identifier', () => {
    for (const campaign of ['', '   ']) {
      const authorization = { ...validAuthorization, campaign };
      expect(() => assertDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, authorization)).toThrow(
        /campaign identifier/i,
      );
    }
  });

  it('refuses an authorization that targets a different database', () => {
    const authorization = { ...validAuthorization, database: 'courtzon_v2' as never };
    expect(() => assertDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, authorization)).toThrow(
      /authorization targets/i,
    );
  });

  it('refuses destructive cleanup for any database other than courtzon_v3', () => {
    expect(() =>
      assertDestructiveCleanupAuthorized('courtzon_v3_e2e', validAuthorization),
    ).toThrow(/not the approved test database/i);
  });

  it('accepts the exact authorization for the approved database', () => {
    expect(isDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, validAuthorization)).toBe(true);
    expect(() =>
      assertDestructiveCleanupAuthorized(APPROVED_TEST_DATABASE, validAuthorization),
    ).not.toThrow();
  });
});

describe('runSafeCleanup', () => {
  it('refuses an unauthorized cleanup before connecting or running SQL', async () => {
    const query = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ query }));

    await expect(runSafeCleanup(APPROVED_TEST_DATABASE, undefined, connect, ['users'])).rejects.toThrow(
      /authorization is required/i,
    );

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses an unexpected database before connecting', async () => {
    const query = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ query }));

    await expect(
      runSafeCleanup('courtzon_v2', validAuthorization, connect, ['users']),
    ).rejects.toThrow(/not the approved test database/i);

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('runs the destructive flow only with the exact authorization (mock connection)', async () => {
    const query = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ query }));

    await runSafeCleanup(APPROVED_TEST_DATABASE, validAuthorization, connect, ['users']);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      'SET FOREIGN_KEY_CHECKS = 0',
      'TRUNCATE TABLE `users`',
      'SET FOREIGN_KEY_CHECKS = 1',
    ]);
  });
});
