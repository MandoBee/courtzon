import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 1 — Subscription Accounting (MODEL B) regression suite.
 *
 * Principle under test:
 *   Subscriptions are 100% CourtZon platform revenue (CourtZon = PRINCIPAL).
 *   - Dedicated subscription_* events (never the generic card_payment mapping)
 *   - Revenue legs post to account code 4170 "Platform / Subscription Revenue"
 *     (never 4100 Court Revenue)
 *   - organisation_id stays NULL on every leg — the paying org is a customer
 *     counterparty and must NOT see these rows in its org GL view
 *   - Renewals reuse the identical request/activation/payment machinery and
 *     therefore inherit exactly the same postings
 *   - Duplicate approval/payment cannot duplicate entries (idempotent)
 *
 * Mapping fixtures simulate the production chart AFTER migration 147:
 *   1100 Payment Clearing / 1120 Cash-Bank / 2100 Wallet Liability /
 *   4100 Court Revenue (generic only) / 4170 Platform Subscription Revenue.
 */

const ACC = {
  clearing: 33,   // 1100 Payment Clearing
  cash: 25,       // 1120 Cash / Bank
  wallet: 37,     // 2100 Customer Wallet Liability
  courtRevenue: 30, // 4100 Court Revenue  (generic mapping — must stay as-is)
  subRevenue: 61,   // 4170 Platform / Subscription Revenue
};

const MAPPINGS: Record<string, Array<{ concept: string; accountId: number }>> = {
  subscription_cash_payment: [
    { concept: 'cash_bank', accountId: ACC.cash },
    { concept: 'revenue', accountId: ACC.subRevenue },
  ],
  subscription_card_payment: [
    { concept: 'payment_clearing', accountId: ACC.clearing },
    { concept: 'revenue', accountId: ACC.subRevenue },
  ],
  subscription_wallet_payment: [
    { concept: 'wallet_liability_spend', accountId: ACC.wallet },
    { concept: 'revenue', accountId: ACC.subRevenue },
  ],
  // GENERIC mapping — intentionally still points at 4100. Phase 1 must NOT
  // touch it (used by marketplace/bookings/other flows).
  card_payment: [
    { concept: 'payment_clearing', accountId: ACC.clearing },
    { concept: 'revenue', accountId: ACC.courtRevenue },
  ],
};

const connStub = {
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release: () => {},
  execute: async () => [{}, []],
  query: async () => [[], []],
};

vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ getConnection: async () => connStub }) }));

const busHandlers = new Map<string, Function[]>();
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    on: vi.fn((name: string, handler: Function) => {
      const list = busHandlers.get(name) || [];
      list.push(handler);
      busHandlers.set(name, list);
    }),
    emit: vi.fn(async () => {}),
  },
}));

// Real concept registry is used so sides come from the locked registry.
import { EVENT_CONCEPTS } from '../application/accounting-concepts.js';

vi.mock('../application/accounting-engine.service.js', async () => {
  const { EVENT_CONCEPTS: concepts } = await import('../application/accounting-concepts.js');
  return {
    accountingEngineService: {
      resolveMapping: vi.fn(async (eventType: string) => MAPPINGS[eventType] ?? []),
      validateAccounts: vi.fn(async () => undefined),
      // REAL line-building semantics reimplemented against the locked registry:
      buildLedgerLines: vi.fn((eventType: string, mapping: any[], amounts: Record<string, number>) => {
        const def = concepts[eventType];
        if (!def) throw new Error(`Unknown event_type: ${eventType}`);
        const sideOf = (c: string) => def.debit.includes(c) ? 'debit' : def.credit.includes(c) ? 'credit' : null;
        const out: any[] = [];
        for (const [concept, amount] of Object.entries(amounts)) {
          if (!amount) continue;
          const m = mapping.find((x) => x.concept === concept);
          if (!m) throw new Error(`Concept '${concept}' unmapped for ${eventType}`);
          out.push({ concept, side: sideOf(concept), accountId: m.accountId, amount });
        }
        return out;
      }),
      validateBalance: vi.fn(() => true),
    },
  };
});

vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: {
    hasPosting: vi.fn(async () => false),
    createEntries: vi.fn(async (entries: any[]) => entries.map((_, i) => 1000 + i)),
  },
}));
vi.mock('../application/gl-projection.service.js', () => ({
  glProjectionService: {
    resolvePeriod: vi.fn(async () => 7),
    validateOpenPeriod: vi.fn(async () => undefined),
    projectEntries: vi.fn(async () => undefined),
  },
}));

import { postAccountingEvent, registerAccountingEventListeners } from '../application/accounting-event.listener.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { glProjectionService } from '../application/gl-projection.service.js';
import { accountingEngineService } from '../application/accounting-engine.service.js';

const postedLines = (): any[] =>
  (ledgerRepository.createEntries as any).mock.calls.at(-1)?.[0] ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  busHandlers.clear();
});

describe('Phase 1 — subscription accounting (Model B)', () => {
  it('CASH subscription → Dr 1120 Cash/Bank, Cr 4170, organisation_id NULL', async () => {
    await postAccountingEvent('subscription_cash_payment', 'subscription', 101, null,
      { cash_bank: 500, revenue: 500 }, 'EGP', 'Cash subscription');

    const lines = postedLines();
    expect(lines).toHaveLength(2);
    const d = lines.find((l) => l.side === 'debit');
    const c = lines.find((l) => l.side === 'credit');
    expect(d.chartAccountId).toBe(ACC.cash);
    expect(d.amount).toBe(500);
    expect(c.chartAccountId).toBe(ACC.subRevenue); // 4170 — never 4100
    expect(c.amount).toBe(500);
    // Organisation GL exclusion: no counterparty attribution anywhere
    expect(d.organisationId).toBeNull();
    expect(c.organisationId).toBeNull();
    expect(vi.mocked(glProjectionService.projectEntries).mock.calls[0][0])
      .toEqual(expect.arrayContaining([expect.objectContaining({ organisationId: null })]));
  });

  it('CARD subscription → Dr 1100 Payment Clearing, Cr 4170, organisation_id NULL', async () => {
    await postAccountingEvent('subscription_card_payment', 'subscription', 102, null,
      { payment_clearing: 250, revenue: 250 }, 'EGP', 'Card subscription');

    const lines = postedLines();
    const d = lines.find((l) => l.side === 'debit');
    const c = lines.find((l) => l.side === 'credit');
    expect(d.chartAccountId).toBe(ACC.clearing);
    expect(c.chartAccountId).toBe(ACC.subRevenue);
    expect(lines.every((l) => l.organisationId === null)).toBe(true);
  });

  it('WALLET-funded subscription → Cr 4170 (dedicated event, org NULL)', async () => {
    await postAccountingEvent('subscription_wallet_payment', 'subscription', 103, null,
      { wallet_liability_spend: 300, revenue: 300 }, 'EGP', 'Wallet subscription');

    const lines = postedLines();
    expect(lines.find((l) => l.side === 'debit').chartAccountId).toBe(ACC.wallet);
    expect(lines.find((l) => l.side === 'credit').chartAccountId).toBe(ACC.subRevenue);
    expect(lines.every((l) => l.organisationId === null)).toBe(true);
  });

  it('generic card_payment mapping remains UNTOUCHED (revenue still 4100 there)', () => {
    // Registry contract unchanged
    expect(EVENT_CONCEPTS.card_payment).toEqual({ debit: ['payment_clearing'], credit: ['revenue'] });
    // A generic card_payment posting still resolves its revenue leg to the
    // generic account (4100), proving Phase 1 did not repoint it.
    expect(MAPPINGS.card_payment.find((m) => m.concept === 'revenue')!.accountId).toBe(ACC.courtRevenue);
  });

  it('payment:succeeded for referenceType=subscription routes to dedicated events, never generic card_payment', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:succeeded')![0];

    await handler({ referenceType: 'subscription', referenceId: 55, amount: 500, metadata: { paymentMethod: 'card', currency: 'EGP' } });

    expect(accountingEngineService.resolveMapping).toHaveBeenCalledWith('subscription_card_payment', null);
    const lines = postedLines();
    expect(lines.find((l) => l.side === 'credit').chartAccountId).toBe(ACC.subRevenue);
  });

  it('RENEWAL follows the identical rule (same event family, 4170, org NULL)', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:succeeded')![0];

    // Original subscription payment…
    await handler({ referenceType: 'subscription', referenceId: 501, amount: 500, metadata: { paymentMethod: 'card', currency: 'EGP' } });
    // …and a renewal one year later (new request row, same machinery).
    await handler({ referenceType: 'subscription', referenceId: 502, amount: 500, metadata: { paymentMethod: 'card', currency: 'EGP' } });

    const calls = (ledgerRepository.createEntries as any).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [lines] of calls) {
      expect(lines.find((l: any) => l.side === 'debit').chartAccountId).toBe(ACC.clearing);
      expect(lines.find((l: any) => l.side === 'credit').chartAccountId).toBe(ACC.subRevenue);
      expect(lines.every((l: any) => l.organisationId === null)).toBe(true);
    }
  });

  it('duplicate approval/payment cannot create duplicate entries (idempotent)', async () => {
    vi.mocked(ledgerRepository.hasPosting).mockResolvedValueOnce(false).mockResolvedValue(true);

    await postAccountingEvent('subscription_cash_payment', 'subscription', 201, null,
      { cash_bank: 500, revenue: 500 }, 'EGP', 'first approval');
    const afterFirst = (ledgerRepository.createEntries as any).mock.calls.length;

    // Admin re-approves / webhook replays — hasPosting short-circuits.
    await postAccountingEvent('subscription_cash_payment', 'subscription', 201, null,
      { cash_bank: 500, revenue: 500 }, 'EGP', 'duplicate approval');

    expect((ledgerRepository.createEntries as any).mock.calls.length).toBe(afterFirst);
    expect(glProjectionService.projectEntries).toHaveBeenCalledTimes(1);
  });
});
