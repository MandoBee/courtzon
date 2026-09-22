import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Group 3A — Payment → Accounting Isolation regression.
 *
 * Group 3 routed Tournament registration payments through the SHARED Payment
 * capability and added an early-return guard in the accounting listener:
 *
 *   if (referenceType === 'tournament') return;
 *
 * Tournament accounting/settlement is intentionally NOT designed yet, so a
 * Tournament payment:succeeded must never reach the generic accounting
 * fallthrough (which would post a full-gross `card_payment` entry with
 * source_type='tournament' as CourtZon revenue — wrong custody model).
 *
 * This spec proves at the REAL accounting boundary (the ledger repository that
 * writes `ledger_entries`) that:
 *
 *   1. Tournament → NO posting is attempted (no hasPosting check, no ledger
 *      entries created, no `accounting:entry-recorded`).
 *   2. Booking / Marketplace-order / Academy / Subscription → the accounting
 *      boundary IS still reached exactly as before (hasPosting invoked), i.e.
 *      the guard is scoped strictly to 'tournament' and does not affect any
 *      existing consumer.
 *
 * The observable boundary used is the existing implementation's own:
 * `postAccountingEvent` → `ledgerRepository.hasPosting` / `createEntries`
 * (the ONLY path that inserts `ledger_entries`). No fake accounting
 * abstraction is introduced.
 */

const emitted: Array<{ name: string; payload: any }> = [];

const poolRowsBySql: Array<{ match: (sql: string) => boolean; rows: any[] }> = [];

function fakeConn() {
  return {
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(),
    execute: vi.fn(async () => [[], []]),
    query: vi.fn(async () => [[], []]),
  };
}

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: vi.fn(async (sql: string) => {
      for (const rule of poolRowsBySql) {
        if (rule.match(sql)) return [rule.rows, []];
      }
      return [[], []];
    }),
    query: vi.fn(async () => [[], []]),
    getConnection: vi.fn(async () => fakeConn()),
  }),
}));

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    on: vi.fn(),
    emit: vi.fn(async (name: string, payload: any) => {
      emitted.push({ name, payload });
    }),
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

vi.mock('../application/booking-accounting.service.js', () => ({
  bookingAccounting: {
    resolveBookingEconomics: vi.fn(async () => ({
      bookingId: 1,
      organisationId: 6,
      grossAmount: 200,
      taxAmount: 0,
      commissionAmount: 20,
      coachAmount: 0,
      orgAmount: 180,
      paymentMethod: 'card',
      currency: 'EGP',
    })),
    resolveCoachPayable: vi.fn(async () => null),
    computeRefundEconomics: vi.fn(async () => null),
  },
}));

vi.mock('../../academy/infrastructure/repositories/academy-payment.repository.js', () => ({
  academyPaymentRepository: {
    getSnapshotByEnrollment: vi.fn(async () => ({
      id: 88,
      enrollment_id: 88,
      program_id: 5,
      group_id: null,
      organisation_id: 6,
      branch_id: null,
      player_id: 42,
      status: 'authorized',
      gross_amount: 200,
      currency: 'EGP',
      program_price: 200,
      price_type: 'FIXED',
      session_count: 4,
      court_rental_amount: 0,
      court_rental_currency: null,
      commission_rate: 10,
      commission_amount: 20,
      organization_earning_amount: 180,
      coach_comp_type: null,
      coach_comp_value: null,
      coach_comp_amount: 0,
      collector: 'courtzon',
      payment_method: 'card',
      cancellation_window_minutes: null,
      payment_transaction_id: 900,
      created_by: null,
    })),
  },
}));

import {
  registerAccountingEventListeners,
  resetAccountingEventListenersForTest,
} from '../application/accounting-event.listener.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';

function capturePaymentSucceededHandler() {
  const handlers: Record<string, (data: any) => Promise<void> | void> = {};
  for (const call of (eventBusV2.on as any).mock.calls) {
    handlers[call[0] as string] = call[1];
  }
  return handlers['payment:succeeded'];
}

const PAID = (overrides: Record<string, unknown> = {}) => ({
  paymentId: 7,
  referenceType: 'tournament',
  referenceId: 99,
  amount: 250,
  metadata: { paymentMethod: 'card', currency: 'AED', userId: 42 },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  emitted.length = 0;
  poolRowsBySql.length = 0;
  resetAccountingEventListenersForTest();
  registerAccountingEventListeners();
});

describe('Group 3A — Tournament payment:succeeded → accounting isolation', () => {
  it('a Tournament payment:succeeded creates NO accounting posting (no ledger entry, no journal, no event)', async () => {
    const handler = capturePaymentSucceededHandler();
    expect(handler).toBeDefined();

    await handler(PAID());

    // The accounting boundary is the ledger repository (writes ledger_entries).
    // For tournament the handler must return before ANY posting is attempted.
    expect(ledgerRepository.hasPosting).not.toHaveBeenCalled();
    expect(ledgerRepository.createEntries).not.toHaveBeenCalled();
    // No post-COMMIT finance realtime signal either.
    expect(emitted.some((e) => e.name === 'accounting:entry-recorded')).toBe(false);
  });

  it('a Tournament cash payment:succeeded is equally isolated (no posting)', async () => {
    const handler = capturePaymentSucceededHandler();
    await handler(PAID({ referenceId: 100, metadata: { paymentMethod: 'cash', currency: 'AED', userId: 42 } }));

    expect(ledgerRepository.hasPosting).not.toHaveBeenCalled();
    expect(ledgerRepository.createEntries).not.toHaveBeenCalled();
    expect(emitted.some((e) => e.name === 'accounting:entry-recorded')).toBe(false);
  });

  it('an unknown referenceType WITHOUT the guard path still reaches the generic fallthrough — proving only "tournament" is intercepted', async () => {
    // A generic referenceType (not tournament, not a dedicated branch) MUST
    // still reach the generic accounting fallthrough (hasPosting). This proves
    // the guard is scoped strictly to 'tournament' and nothing else.
    const handler = capturePaymentSucceededHandler();
    await handler(PAID({ referenceType: 'gift_card', referenceId: 55 }));

    expect(ledgerRepository.hasPosting).toHaveBeenCalled();
  });
});

describe('Group 3A — existing payment consumers still reach the accounting boundary', () => {
  it('Booking payment:succeeded → booking accounting boundary is reached (hasPosting invoked)', async () => {
    const handler = capturePaymentSucceededHandler();
    await handler(PAID({ referenceType: 'booking', referenceId: 1, amount: 200, metadata: { paymentMethod: 'card', currency: 'EGP' } }));

    expect(ledgerRepository.hasPosting).toHaveBeenCalled();
    expect(ledgerRepository.createEntries).toHaveBeenCalled();
  });

  it('Marketplace order payment:succeeded → order accounting boundary is reached', async () => {
    // Route the internal order-economics reads so the marketplace branch resolves.
    poolRowsBySql.push(
      { match: (sql) => sql.includes('checkout_group_id FROM orders'), rows: [{ checkout_group_id: null }] },
      { match: (sql) => sql.includes('o.subtotal'), rows: [{ id: 50, subtotal: 200, discount_amount: 0, shipping_cost: 0, total: 200, tax_amount: 0, commission_amount: 20, courtzon_fee: 20, payment_method: 'card', cash_holder: 'courtzon' }] },
      { match: (sql) => sql.includes('DISTINCT seller_id FROM order_items'), rows: [{ seller_id: 500 }] },
    );

    const handler = capturePaymentSucceededHandler();
    await handler(PAID({ referenceType: 'order', referenceId: 50, amount: 200, metadata: { paymentMethod: 'card', currency: 'EGP' } }));

    expect(ledgerRepository.hasPosting).toHaveBeenCalled();
    expect(ledgerRepository.createEntries).toHaveBeenCalled();
  });

  it('Academy payment:succeeded → academy accounting boundary is reached', async () => {
    const handler = capturePaymentSucceededHandler();
    await handler(PAID({ referenceType: 'academy', referenceId: 88, amount: 200, metadata: { paymentMethod: 'card', currency: 'EGP' } }));

    expect(ledgerRepository.hasPosting).toHaveBeenCalled();
    expect(ledgerRepository.createEntries).toHaveBeenCalled();
  });

  it('Subscription payment:succeeded → subscription accounting boundary is reached', async () => {
    const handler = capturePaymentSucceededHandler();
    await handler(PAID({ referenceType: 'subscription', referenceId: 12, amount: 500, metadata: { paymentMethod: 'card', currency: 'EGP' } }));

    expect(ledgerRepository.hasPosting).toHaveBeenCalled();
    expect(ledgerRepository.createEntries).toHaveBeenCalled();
  });
});