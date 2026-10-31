import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * P4-07 — posting idempotency + failure-window regression coverage.
 *
 * Audit finding (B34): `postBookingRefundAccounting` advanced the cumulative
 * recovery counters (`bookings.coach_recovered_amount` /
 * `org_recovered_amount`) even when `postAccountingEvent` idempotently SKIPPED
 * the posting. A booking refund legitimately triggers accounting from two domain
 * events (`payment:refunded` and `booking:refunded`); the first posts, the second
 * is skipped by the durable `hasPosting` / `ledger_entries.uk_dedup` guard — but
 * before the fix the skipped delivery still consumed recovery capacity, so a
 * later legitimate refund could no longer recover the settled economics and the
 * ledger/payable relationship drifted (counter without a journal entry).
 *
 * Fix: `postAccountingEvent` returns `boolean` (true = this call wrote the
 * journal, false = idempotent skip / DB duplicate) and the recovery counter
 * updates are gated on that boolean.
 *
 * These tests exercise the REAL listener orchestration with the persistence
 * layer mocked, so the idempotency contract and the recovery gating are proven
 * without a database.
 */

type Handler = (data: any) => Promise<void>;

const state: {
  handlers: Record<string, Handler>;
  posted: Set<string>;
  updates: Array<{ sql: string; params: any[] }>;
  createdEvents: string[];
  emitted: string[];
  callOrder: string[];
  lastEventType: string;
} = {
  handlers: {},
  posted: new Set(),
  updates: [],
  createdEvents: [],
  emitted: [],
  callOrder: [],
  lastEventType: '',
};

const refundEconomics = () => ({
  bookingId: 501,
  organisationId: 77,
  refundedAmount: 50,
  refundRatio: 0.5,
  orgAmount: 45,
  commissionAmount: 5,
  taxAmount: 0,
  coachAmount: 15,
  paymentAmount: 50,
  paymentMethod: 'card',
  currency: 'EGP',
  coachSettled: 15,
  coachUnsettled: 0,
  orgSettled: 45,
  orgUnsettled: 0,
});

vi.mock('../../../database/mysql.js', () => {
  const conn = {
    beginTransaction: async () => { state.callOrder.push('begin'); },
    commit: async () => { state.callOrder.push('commit'); },
    rollback: async () => { state.callOrder.push('rollback'); },
    release: () => { state.callOrder.push('release'); },
    execute: async () => [{}, []],
    query: async () => [[], []],
  };
  return {
    getPool: () => ({
      getConnection: async () => conn,
      execute: async (sql: string, params: any[]) => {
        if (/UPDATE\s+bookings\s+SET\s+(coach|org)_recovered_amount/i.test(sql)) {
          state.updates.push({ sql, params });
        }
        return [{}, []];
      },
      query: async () => [[], []],
    }),
  };
});

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    on: (name: string, handler: Handler) => { state.handlers[name] = handler; },
    emit: (name: string) => { state.emitted.push(name); },
  },
}));

vi.mock('../application/booking-accounting.service.js', () => {
  const computeRefundEconomics = vi.fn(async () => refundEconomics());
  return {
    bookingAccounting: {
      resolveBookingEconomics: vi.fn(async () => null),
      resolveCoachPayable: vi.fn(async () => null),
      computeRefundEconomics,
    },
  };
});

vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: {
    hasPosting: vi.fn(async (sourceType: string, sourceId: number, eventType: string) =>
      state.posted.has(`${sourceType}:${sourceId}:${eventType}`)),
    createEntries: vi.fn(async (entries: Array<{ sourceType: string; sourceId: number; eventType?: string }>) => {
      const entry = entries[0];
      state.posted.add(`${entry.sourceType}:${entry.sourceId}:${entry.eventType}`);
      state.createdEvents.push(String(entry.eventType));
      return [1, 2];
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
      { concept: 'payment_clearing', accountId: 101 },
      { concept: 'merchant_payable', accountId: 202 },
    ]),
    validateAccounts: vi.fn(async () => undefined),
    buildLedgerLines: vi.fn((eventType: string, _mapping: unknown, amounts: Record<string, number>) => {
      state.lastEventType = eventType;
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

import { postAccountingEvent, registerAccountingEventListeners } from '../application/accounting-event.listener.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';

const BASE_ARGS = [
  'booking_card_payment',
  'booking' as const,
  4242,
  77,
  { payment_clearing: 100, merchant_payable: 100 },
  'EGP',
  'idempotency unit test',
] as const;

function resetState() {
  state.posted.clear();
  state.updates.length = 0;
  state.createdEvents.length = 0;
  state.emitted.length = 0;
  state.callOrder.length = 0;
  state.lastEventType = '';
  vi.mocked(ledgerRepository.hasPosting).mockClear();
  vi.mocked(ledgerRepository.createEntries).mockClear();
}

describe('P4-07 postAccountingEvent idempotency contract', () => {
  beforeEach(resetState);

  it('returns TRUE and writes once for a first-time event', async () => {
    const posted = await postAccountingEvent(...BASE_ARGS);
    expect(posted).toBe(true);
    expect(state.createdEvents).toEqual(['booking_card_payment']);
    expect(state.emitted).toEqual(['accounting:entry-recorded']);
    expect(state.callOrder).toContain('commit');
  });

  it('returns FALSE on an application-level hasPosting skip without opening a transaction', async () => {
    state.posted.add('booking:4242:booking_card_payment');
    const posted = await postAccountingEvent(...BASE_ARGS);
    expect(posted).toBe(false);
    expect(state.createdEvents).toEqual([]);
    expect(state.callOrder).toEqual([]); // no connection, no transaction, no release
    expect(state.emitted).toEqual([]); // no realtime signal for a skipped posting
  });

  it('returns FALSE and rolls back when the DB unique key rejects a concurrent duplicate', async () => {
    vi.mocked(ledgerRepository.createEntries).mockRejectedValueOnce(
      Object.assign(new Error('Duplicate entry for key uk_dedup'), { code: 'ER_DUP_ENTRY' }),
    );

    const posted = await postAccountingEvent(...BASE_ARGS);

    expect(posted).toBe(false);
    expect(state.callOrder).toContain('rollback');
    expect(state.callOrder).not.toContain('commit');
    expect(state.emitted).toEqual([]);
    // Still recorded as posted for the entity so callers can gate side effects.
    expect(state.posted.has('booking:4242:booking_card_payment')).toBe(false);
  });

  it('a failed posting does not claim the event (next retry can still post)', async () => {
    vi.mocked(ledgerRepository.createEntries).mockRejectedValueOnce(new Error('connection lost'));
    await expect(postAccountingEvent(...BASE_ARGS)).rejects.toThrow(/connection lost/);
    expect(state.posted.size).toBe(0);

    const retried = await postAccountingEvent(...BASE_ARGS);
    expect(retried).toBe(true);
    expect(state.createdEvents).toEqual(['booking_card_payment']);
  });
});

describe('P4-07 booking refund recovery counters follow the journal (B34)', () => {
  beforeAll(() => {
    registerAccountingEventListeners();
  });

  beforeEach(() => {
    resetState();
  });

  it('a duplicated refund event posts once and advances each recovery counter exactly once', async () => {
    const handler = state.handlers['booking:refunded'];
    expect(handler).toBeTypeOf('function');

    await handler({ bookingId: 501, refundAmount: 50, currency: 'EGP' });
    const eventsAfterFirst = [...state.createdEvents];
    const updatesAfterFirst = [...state.updates];

    await handler({ bookingId: 501, refundAmount: 50, currency: 'EGP' });

    // Every distinct accounting event of the refund posted exactly once …
    expect(eventsAfterFirst).toEqual([
      'booking_refund',
      'booking_org_receivable_reversal',
      'booking_coach_recovery',
      'booking_org_recovery',
    ]);
    expect(state.createdEvents).toEqual(eventsAfterFirst);

    // … and the recovery counters advanced only for the postings that were
    // actually written. The second (skipped) delivery must not consume capacity.
    expect(state.updates).toHaveLength(2);
    expect(state.updates).toEqual(updatesAfterFirst);

    const coach = state.updates.find((u) => /coach_recovered_amount/i.test(u.sql))!;
    const org = state.updates.find((u) => /org_recovered_amount/i.test(u.sql))!;
    expect(coach.params).toEqual([15, 501, 15]);
    expect(org.params).toEqual([45, 501, 45]);

    // Realtime signal fired only for the four real postings.
    expect(state.emitted).toHaveLength(4);
  });

  it('a refund with no settled portion never touches the recovery counters', async () => {
    // Coach/org entirely unsettled: payable reversal only, no recovery posting.
    const { bookingAccounting } = await import('../application/booking-accounting.service.js');
    const compute = vi.mocked(bookingAccounting.computeRefundEconomics);
    compute.mockResolvedValue({
      ...refundEconomics(),
      coachSettled: 0,
      coachUnsettled: 15,
      orgSettled: 0,
      orgUnsettled: 45,
    });

    try {
      await state.handlers['booking:refunded']({ bookingId: 502, refundAmount: 50, currency: 'EGP' });

      expect(state.createdEvents).toContain('booking_coach_reversal');
      expect(state.updates).toEqual([]);
    } finally {
      compute.mockResolvedValue(refundEconomics());
    }
  });
});

/**
 * P4-08 — characterization of the two B35 accounting residuals that cannot be
 * closed without a schema/bus change. These tests pin today's behaviour so a
 * future fix (occurrence identity / handler replay) is a deliberate decision.
 */
describe('P4-08 B35 residuals — posting identity and failure recovery', () => {
  beforeAll(() => {
    registerAccountingEventListeners();
  });

  beforeEach(() => {
    resetState();
  });

  it('skips a second posting of the same (source, event) even when the amount differs — identity has no occurrence ordinal', async () => {
    const first = await postAccountingEvent(
      'booking_refund', 'booking', 777, 77,
      { payment_clearing: 50, merchant_payable: 50 }, 'EGP', 'first partial refund',
    );
    const second = await postAccountingEvent(
      'booking_refund', 'booking', 777, 77,
      { payment_clearing: 100, merchant_payable: 100 }, 'EGP', 'second partial refund',
    );

    expect(first).toBe(true);
    expect(second).toBe(false); // B35: a genuine second occurrence cannot post
    expect(state.createdEvents).toEqual(['booking_refund']);
  });

  it('a hard database failure aborts the refund journal and the handler swallows it (no automatic retry)', async () => {
    vi.mocked(ledgerRepository.createEntries).mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      state.handlers['booking:refunded']({ bookingId: 601, refundAmount: 50, currency: 'EGP' }),
    ).resolves.toBeUndefined();

    // The first posting failed, so the remaining refund postings were never
    // attempted; the handler logged and completed (B35: no DLQ/replay for it).
    expect(state.createdEvents).toEqual([]);
    expect(state.emitted).toEqual([]);
    expect(state.updates).toEqual([]);
    expect(state.callOrder).toContain('rollback');
  });

  it('a manual re-delivery after the failure posts every leg and advances recovery exactly once', async () => {
    vi.mocked(ledgerRepository.createEntries).mockRejectedValueOnce(new Error('database unavailable'));
    await state.handlers['booking:refunded']({ bookingId: 602, refundAmount: 50, currency: 'EGP' });

    await state.handlers['booking:refunded']({ bookingId: 602, refundAmount: 50, currency: 'EGP' });

    expect(state.createdEvents).toEqual([
      'booking_refund',
      'booking_org_receivable_reversal',
      'booking_coach_recovery',
      'booking_org_recovery',
    ]);
    expect(state.updates).toHaveLength(2);
    expect(state.emitted).toHaveLength(4);
  });
});
