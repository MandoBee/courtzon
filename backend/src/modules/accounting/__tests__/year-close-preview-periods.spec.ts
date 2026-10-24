import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

/**
 * CZ-F23 — year-close preview must return a clear domain conflict (not a 500)
 * when the fiscal year does not contain the required 12 accounting periods.
 * Fully mocked: no database, no application bootstrap.
 */

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'test';
  const pool = { execute: vi.fn(async () => [[], []]) };
  return { pool };
});

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => mocks.pool,
  createPool: vi.fn(),
  acquireConnection: vi.fn(),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() },
}));
vi.mock('../../financial/application/accounting-engine.service.js', () => ({
  accountingEngineService: { resolveMapping: vi.fn(async () => [{ accountId: 7, concept: 'retained_earnings' }]) },
}));
vi.mock('../../financial/application/coa-validator.service.js', () => ({
  coaValidator: { validatePostable: vi.fn(async () => undefined) },
}));

import { yearClosingService } from '../application/year-closing.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('yearClosingService.previewClose (CZ-F23)', () => {
  it('throws a 409 ConflictError with PERIOD_NOT_FOUND when periods are missing', async () => {
    mocks.pool.execute.mockResolvedValue([[], []]); // no accounting_periods rows

    await expect(yearClosingService.previewClose(2026, 35)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      code: ErrorCodes.PERIOD_NOT_FOUND,
    });
  });

  it('succeeds when the fiscal year has 12 periods', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      period_number: i + 1,
      status: i + 1 <= 11 ? 'closed' : 'open',
    }));
    mocks.pool.execute.mockImplementation(async (sql: unknown) =>
      String(sql).includes('FROM accounting_periods') ? [twelve, []] : [[], []]);

    const preview = await yearClosingService.previewClose(2026, 35);
    expect(preview.fiscalYear).toBe(2026);
    expect(preview.periodsStatus).toContain('P1:closed');
    expect(preview.periodsStatus).toContain('P12:open');
  });
});
