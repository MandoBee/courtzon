import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the post-COMMIT finance realtime signal:
 *   - `accounting:entry-recorded` fires ONLY after the self-committing
 *     transaction successfully commits;
 *   - outer-transaction callers participate silently (they announce after
 *     their own commit — see subscription-activation.service);
 *   - idempotent skips never announce a fresh entry.
 * Routing to ADMIN_ROOM/'finance' rooms is covered in
 * realtime/__tests__/socket-event-mapper.spec.ts; frontend invalidation keys
 * in frontend/src/realtime/useRealtimeCacheUpdates.test.ts.
 */

const callOrder: string[] = [];
const emitted: Array<{ name: string; payload: any }> = [];

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    getConnection: async () => ({
      beginTransaction: async () => { callOrder.push('begin'); },
      commit: async () => { callOrder.push('commit'); },
      rollback: async () => { callOrder.push('rollback'); },
      release: () => { callOrder.push('release'); },
      execute: async () => [{}, []],
      query: async () => [[], []],
    }),
  }),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    emit: vi.fn(async (name: string, payload: any) => {
      callOrder.push(`emit:${name}`);
      emitted.push({ name, payload });
    }),
    on: vi.fn(),
  },
}));
vi.mock('../application/accounting-engine.service.js', () => ({
  accountingEngineService: {
    resolveMapping: vi.fn(async () => [
      { concept: 'cash_bank', accountId: 11 },
      { concept: 'revenue', accountId: 22 },
    ]),
    validateAccounts: vi.fn(async () => undefined),
    buildLedgerLines: vi.fn(() => [
      { accountId: 11, side: 'debit', amount: 100 },
      { accountId: 22, side: 'credit', amount: 100 },
    ]),
    validateBalance: vi.fn(() => true),
  },
}));
vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: {
    hasPosting: vi.fn(async () => false),
    createEntries: vi.fn(async () => [101, 102]),
  },
}));
vi.mock('../application/gl-projection.service.js', () => ({
  glProjectionService: {
    resolvePeriod: vi.fn(async () => 7),
    validateOpenPeriod: vi.fn(async () => undefined),
    projectEntries: vi.fn(async () => undefined),
  },
}));

import { postAccountingEvent } from '../application/accounting-event.listener.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';

const BASE_ARGS = [
  'subscription_cash_payment',
  'subscription' as const,
  33,
  12,
  { cash_bank: 500, revenue: 500 },
  'EGP',
  'unit test posting',
] as const;

describe('postAccountingEvent → accounting:entry-recorded placement', () => {
  beforeEach(() => {
    callOrder.length = 0;
    emitted.length = 0;
    vi.mocked(ledgerRepository.hasPosting).mockClear().mockResolvedValue(false);
  });

  it('emits AFTER commit on the self-committing path, exactly once, with source payload', async () => {
    await postAccountingEvent(...BASE_ARGS);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].name).toBe('accounting:entry-recorded');
    expect(emitted[0].payload).toEqual({
      eventType: 'subscription_cash_payment',
      sourceType: 'subscription',
      sourceId: 33,
      organisationId: 12,
    });

    const commitIdx = callOrder.indexOf('commit');
    const emitIdx = callOrder.findIndex((c) => c.startsWith('emit:'));
    expect(commitIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeGreaterThan(commitIdx); // strictly post-COMMIT
    expect(callOrder.indexOf('release')).toBeGreaterThan(emitIdx);
  });

  it('does NOT emit when joining an outer transaction (caller announces post-commit)', async () => {
    const fakeConn = {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      execute: async () => [{}, []],
      query: async () => [[], []],
    } as any;

    await postAccountingEvent(...BASE_ARGS, fakeConn);

    expect(emitted).toHaveLength(0);
    // Ledger rows were still written through the caller's connection
    expect(vi.mocked(ledgerRepository.hasPosting)).toHaveBeenCalledTimes(1);
  });

  it('idempotent pre-check skip emits nothing', async () => {
    vi.mocked(ledgerRepository.hasPosting).mockResolvedValue(true);
    await postAccountingEvent(...BASE_ARGS);
    expect(emitted).toHaveLength(0);
    expect(callOrder).not.toContain('commit');
  });
});
