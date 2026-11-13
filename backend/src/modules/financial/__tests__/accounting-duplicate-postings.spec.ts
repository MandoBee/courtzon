import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * P5-07 — no duplicate accounting postings (idempotency), OFFLINE.
 *
 * Complements `accounting-posting-idempotency.spec.ts` (P4-07/P4-08, sequential
 * skip + ER_DUP_ENTRY + B35 characterization) with the parts that task did not
 * cover:
 *   1. a REAL concurrent duplicate race — both callers pass the application
 *      pre-check (`hasPosting` false) and the durable unique key decides;
 *   2. the exact scope of the posting identity (no over-skip of legitimate
 *      distinct postings);
 *   3. retry semantics after a hard failure, and no re-post after a duplicate;
 *   4. duplicate DELIVERY of the settlement/gateway-reversal domain events.
 *
 * The listener + `postAccountingEvent` are the REAL implementation. Only the
 * persistence/engine boundaries are mocked — no database, no network.
 */

type Handler = (data: any) => Promise<void>;

const state = {
  handlers: {} as Record<string, Handler>,
  /** Keys already committed to the fake ledger (source_type:source_id:event_type). */
  posted: new Set<string>(),
  /** event types actually written (one entry per successful createEntries call). */
  writes: [] as string[],
  emitted: [] as string[],
  subscriptions: [] as string[],
  commits: 0,
  rollbacks: 0,
  hasPostingCalls: [] as Array<[string, number, string]>,
  organisationIds: [] as Array<Record<string, number | null> | undefined>,
  failNextWith: null as Error | null,
};

function key(eventType: string, sourceType: string, sourceId: number) {
  return `${sourceType}:${sourceId}:${eventType}`;
}

vi.mock('../../../database/mysql.js', () => {
  const conn = {
    beginTransaction: async () => { /* transaction started */ },
    commit: async () => { state.commits++; },
    rollback: async () => { state.rollbacks++; },
    release: () => { /* released */ },
    execute: async () => [{}, []],
    query: async () => [[], []],
  };
  return {
    getPool: () => ({
      getConnection: async () => conn,
      execute: async () => [{}, []],
      query: async () => [[], []],
    }),
  };
});

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    on: (name: string, handler: Handler) => { state.handlers[name] = handler; },
    subscribe: (registration: any) => { state.subscriptions.push(registration.eventName); },
    getInMemoryHandlers: () => [],
    emit: (name: string) => { state.emitted.push(name); },
  },
}));

vi.mock('../application/booking-accounting.service.js', () => ({
  bookingAccounting: {
    resolveBookingEconomics: vi.fn(async () => null),
    resolveCoachPayable: vi.fn(async () => null),
    computeRefundEconomics: vi.fn(async () => null),
  },
}));

/**
 * Persistence fake with REAL unique-key semantics: `createEntries` refuses a
 * key that is already committed, even when the caller's `hasPosting` pre-check
 * was false (the concurrent-race condition).
 */
vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: {
    hasPosting: vi.fn(async (sourceType: string, sourceId: number, eventType: string) => {
      state.hasPostingCalls.push([sourceType, sourceId, eventType]);
      return state.posted.has(key(eventType, sourceType, sourceId));
    }),
    createEntries: vi.fn(async (entries: Array<{ eventType?: string; sourceType: string; sourceId: number }>) => {
      if (state.failNextWith) {
        const err = state.failNextWith;
        state.failNextWith = null;
        throw err;
      }
      const entry = entries[0];
      const k = key(String(entry.eventType), entry.sourceType, entry.sourceId);
      if (state.posted.has(k)) {
        throw Object.assign(new Error(`Duplicate entry '${k}' for key 'uk_dedup'`), { code: 'ER_DUP_ENTRY' });
      }
      state.posted.add(k);
      state.writes.push(String(entry.eventType));
      return entries.map((_e, i) => i + 1);
    }),
  },
}));

vi.mock('../application/gl-projection.service.js', () => ({
  glProjectionService: {
    resolvePeriod: vi.fn(async () => 9),
    validateOpenPeriod: vi.fn(async () => undefined),
    projectEntries: vi.fn(async () => undefined),
  },
}));

vi.mock('../application/accounting-engine.service.js', () => ({
  CONCEPT_ACCOUNT_CODE_DEFAULTS: {},
  accountingEngineService: {
    resolveMapping: vi.fn(async () => [
      { concept: 'cash_bank', accountId: 101 },
      { concept: 'merchant_payable', accountId: 202 },
    ]),
    validateAccounts: vi.fn(async () => undefined),
    buildLedgerLines: vi.fn((_eventType: string, _mapping: unknown, amounts: Record<string, number>, conceptOrganisations?: Record<string, number | null>) => {
      state.organisationIds.push(conceptOrganisations);
      const total = Object.values(amounts).reduce((s, n) => s + Number(n || 0), 0);
      const amount = total > 0 ? total : 1;
      return [
        { concept: '', side: 'debit', accountId: 101, amount },
        { concept: '', side: 'credit', accountId: 202, amount },
      ];
    }),
    validateBalance: vi.fn(() => undefined),
  },
}));

import { postAccountingEvent, registerAccountingEventListeners, registerAccountingReplaySubscribers } from '../application/accounting-event.listener.js';
import { registerRefundAccountingListeners } from '../application/refund-accounting.listener.js';
import { glProjectionService } from '../application/gl-projection.service.js';

const BASE_ARGS = [
  'booking_card_payment',
  'booking' as const,
  4242,
  77,
  { payment_clearing: 100, merchant_payable: 100 },
  'EGP',
  'P5-07 duplicate-posting test',
] as const;

function reset(clearHandlers = false) {
  state.posted.clear();
  state.writes.length = 0;
  state.emitted.length = 0;
  state.commits = 0;
  state.rollbacks = 0;
  state.hasPostingCalls.length = 0;
  state.organisationIds.length = 0;
  state.failNextWith = null;
  if (clearHandlers) state.handlers = {};
  vi.clearAllMocks();
}

describe('P5-07 postAccountingEvent — concurrent duplicate race', () => {
  beforeEach(() => reset());

  it('two simultaneous postings of the same key produce ONE journal (loser rolls back)', async () => {
    // Both callers see no posting (the real race: pre-checks run before either insert).
    const results = await Promise.all([
      postAccountingEvent(...BASE_ARGS),
      postAccountingEvent(...BASE_ARGS),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((r) => r === false)).toHaveLength(1);
    expect(state.writes).toEqual(['booking_card_payment']);
    expect(state.commits).toBe(1);
    expect(state.rollbacks).toBe(1);
    expect(state.emitted).toEqual(['accounting:entry-recorded']);
  });

  it('four simultaneous duplicates still produce exactly one journal and one realtime signal', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => postAccountingEvent(...BASE_ARGS)));

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state.writes).toHaveLength(1);
    expect(state.emitted).toHaveLength(1);
    expect(state.commits).toBe(1);
    expect(state.rollbacks).toBe(3);
    // The DB constraint — not the pre-check — is what stopped the losers.
    expect(state.posted.size).toBe(1);
  });

  it('a duplicate write does not project to the GL (no partial journal)', async () => {
    await Promise.all([
      postAccountingEvent(...BASE_ARGS),
      postAccountingEvent(...BASE_ARGS),
    ]);

    expect(vi.mocked(glProjectionService.projectEntries)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(glProjectionService.validateOpenPeriod)).toHaveBeenCalledTimes(2);
  });

  it('after the winner committed, a later identical call is skipped without a transaction', async () => {
    await postAccountingEvent(...BASE_ARGS);
    const commitsAfterFirst = state.commits;
    const rollbacksAfterFirst = state.rollbacks;

    const second = await postAccountingEvent(...BASE_ARGS);

    expect(second).toBe(false);
    expect(state.commits).toBe(commitsAfterFirst);
    expect(state.rollbacks).toBe(rollbacksAfterFirst);
    expect(state.writes).toHaveLength(1);
    expect(state.emitted).toHaveLength(1);
  });
});

describe('P5-07 posting identity scope — distinct postings are never over-skipped', () => {
  beforeEach(() => reset());

  it('queries hasPosting with exactly (sourceType, sourceId, eventType)', async () => {
    await postAccountingEvent(...BASE_ARGS);

    expect(state.hasPostingCalls[0]).toEqual(['booking', 4242, 'booking_card_payment']);
  });

  it('a different event type on the same source posts independently', async () => {
    const payment = await postAccountingEvent(...BASE_ARGS);
    const refund = await postAccountingEvent(
      'booking_refund', 'booking', 4242, 77,
      { payment_clearing: 100, merchant_payable: 100 }, 'EGP', 'refund for the same booking',
    );

    expect([payment, refund]).toEqual([true, true]);
    expect(state.writes).toEqual(['booking_card_payment', 'booking_refund']);
  });

  it('a different source id posts independently', async () => {
    await postAccountingEvent(...BASE_ARGS);
    await postAccountingEvent(
      'booking_card_payment', 'booking', 4243, 77,
      { payment_clearing: 100, merchant_payable: 100 }, 'EGP', 'another booking',
    );

    expect(state.writes).toEqual(['booking_card_payment', 'booking_card_payment']);
    expect(state.posted.size).toBe(2);
  });

  it('a different source type posts independently', async () => {
    await postAccountingEvent(...BASE_ARGS);
    await postAccountingEvent(
      'booking_card_payment', 'marketplace_order' as any, 4242, 77,
      { payment_clearing: 100, merchant_payable: 100 }, 'EGP', 'same id, different source type',
    );

    expect(state.writes).toHaveLength(2);
    expect(state.posted.has('marketplace_order:4242:booking_card_payment')).toBe(true);
  });
});

describe('P5-07 retry semantics after failure', () => {
  beforeEach(() => reset());

  it('a hard failure throws, claims nothing, and the retry posts exactly once', async () => {
    state.failNextWith = new Error('connection lost');

    await expect(postAccountingEvent(...BASE_ARGS)).rejects.toThrow(/connection lost/);
    expect(state.posted.size).toBe(0);
    expect(state.writes).toHaveLength(0);
    expect(state.emitted).toHaveLength(0);
    expect(state.commits).toBe(0);
    expect(state.rollbacks).toBe(1);

    const retried = await postAccountingEvent(...BASE_ARGS);

    expect(retried).toBe(true);
    expect(state.writes).toEqual(['booking_card_payment']);
    expect(state.commits).toBe(1);
    expect(state.emitted).toEqual(['accounting:entry-recorded']);
  });

  it('a duplicate rejection is not retried into a second journal', async () => {
    // First call commits.
    await postAccountingEvent(...BASE_ARGS);
    // Simulate a stale pre-check (as in the race) on the retry path: force
    // hasPosting to report false once so the insert must be rejected by the key.
    const realHasPosting = vi.mocked((await import('../infrastructure/repositories/ledger.repository.js')).ledgerRepository.hasPosting);
    realHasPosting.mockResolvedValueOnce(false);

    const retry = await postAccountingEvent(...BASE_ARGS);

    expect(retry).toBe(false);
    expect(state.writes).toHaveLength(1);
    expect(state.rollbacks).toBe(1);
    expect(state.emitted).toHaveLength(1);
  });
});

describe('P5-07 duplicate domain-event delivery', () => {
  beforeAll(() => {
    registerAccountingEventListeners();
    registerRefundAccountingListeners();
  });

  // NOTE: handlers must survive the per-test reset (registration is one-shot).
  beforeEach(() => reset());

  it('settlement:paid delivered twice posts the platform payout and the org receipt once each', async () => {
    const handler = state.handlers['settlement:paid'];
    expect(handler).toBeTypeOf('function');

    const payload = {
      settlementId: 900,
      amount: 250,
      direction: 'courtzon_to_org',
      organisationId: 55,
      currency: 'EGP',
    };

    await handler(payload);
    const afterFirst = [...state.writes];
    const emittedAfterFirst = state.emitted.length;

    await handler(payload);

    // CourtZon payout (org NULL) + org receipt (org 55) — two independent dedup keys.
    expect(afterFirst).toEqual(['settlement_paid', 'settlement_org_receipt']);
    expect(state.writes).toEqual(afterFirst);
    expect(state.emitted.length).toBe(emittedAfterFirst);
    expect(state.rollbacks).toBe(0); // second delivery skipped before any transaction
  });

  it('payment:gateway-settled delivered twice posts the clearing→bank journal once', async () => {
    const handler = state.handlers['payment:gateway-settled'];
    expect(handler).toBeTypeOf('function');

    const payload = { settlementId: 901, gross: 300, net: 290, fee: 10, currency: 'EGP' };

    await handler(payload);
    await handler(payload);

    expect(state.writes).toEqual(['payment_gateway_settlement']);
    expect(state.emitted).toHaveLength(1);
  });

  it('gateway settlement + its reversal are distinct postings, each once', async () => {
    const settled = state.handlers['payment:gateway-settled'];
    const reversed = state.handlers['payment:gateway-settlement-reversed'];
    const payload = { settlementId: 902, gross: 300, net: 300, fee: 0, currency: 'EGP' };

    await settled(payload);
    await settled(payload);
    await reversed(payload);
    await reversed(payload);

    expect(state.writes).toEqual([
      'payment_gateway_settlement',
      'payment_gateway_settlement_reversal',
    ]);
    expect(state.emitted).toHaveLength(2);
  });

  it('an unknown/zero settlement id is ignored (no posting, no throw)', async () => {
    const handler = state.handlers['payment:gateway-settled'];

    await expect(handler({ settlementId: 0, gross: 300 })).resolves.toBeUndefined();
    await expect(handler({ settlementId: 903, gross: 0 })).resolves.toBeUndefined();

    expect(state.writes).toHaveLength(0);
    expect(state.hasPostingCalls).toHaveLength(0);
  });
});

describe('Refund Engine accounting replay — institution-scoped liability/payout', () => {
  beforeEach(() => reset());

  const approval = (overrides: Record<string, unknown> = {}) => ({
    caseId: 77,
    publicId: 'refund-77',
    organisationId: 7,
    amountCents: 6000,
    currency: 'EGP',
    ...overrides,
  });

  const payout = (overrides: Record<string, unknown> = {}) => ({
    caseId: 77,
    payoutId: 55,
    publicId: 'refund-77',
    organisationId: 7,
    amountCents: 2000,
    currency: 'EGP',
    method: 'bank_transfer',
    ...overrides,
  });

  it('re-throws a transient approval failure so the durable replay can retry', async () => {
    const handler = state.handlers['refund:case-approved'];
    state.failNextWith = new Error('transient accounting outage');

    await expect(handler(approval())).rejects.toThrow('transient accounting outage');
    expect(state.writes).toHaveLength(0);

    await handler(approval());
    expect(state.writes).toEqual(['refund_case_approved']);
    expect(state.organisationIds[0]).toEqual({ refund_expense: 7, refund_payable: 7 });
  });

  it('replays the same approval idempotently with no duplicate journal', async () => {
    const handler = state.handlers['refund:case-approved'];

    await handler(approval());
    await handler(approval());

    expect(state.writes).toEqual(['refund_case_approved']);
    expect(state.emitted).toHaveLength(1);
  });

  it('posts one payout journal per payout id (partial payouts are not collapsed)', async () => {
    const handler = state.handlers['refund:payout-confirmed'];

    await handler(payout({ payoutId: 55, amountCents: 2000 }));
    await handler(payout({ payoutId: 56, amountCents: 4000 }));

    expect(state.writes).toEqual(['refund_case_payout', 'refund_case_payout']);
    expect(state.organisationIds).toEqual([
      { refund_payable: 7, cash_bank: 7 },
      { refund_payable: 7, cash_bank: 7 },
    ]);
  });

  it('keeps each organisation on its own ledger and replay is safe across orgs', async () => {
    const handler = state.handlers['refund:case-approved'];

    await handler(approval({ caseId: 77, organisationId: 7 }));
    await handler(approval({ caseId: 88, organisationId: 8 }));
    await handler(approval({ caseId: 77, organisationId: 7 }));

    expect(state.writes).toEqual(['refund_case_approved', 'refund_case_approved']);
    expect(state.organisationIds).toEqual([
      { refund_expense: 7, refund_payable: 7 },
      { refund_expense: 8, refund_payable: 8 },
    ]);
  });

  it('registers both refund events on the durable accounting-replay subscriber', () => {
    state.subscriptions.length = 0;
    registerAccountingReplaySubscribers();

    expect(state.subscriptions).toContain('refund:case-approved');
    expect(state.subscriptions).toContain('refund:payout-confirmed');
  });
});
