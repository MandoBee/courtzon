import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-12 — Subscription refund accounting (Model B principal revenue reversal).
 *
 * Subscriptions are 100% CourtZon platform revenue recognized to 4170 (MODEL B).
 * A refund must reverse that revenue leg (4170) and the custody leg
 * (payment_clearing 1100 for card, wallet_liability 2100 for wallet, cash_bank
 * 1120 for cash), with organisation_id NULL — NOT the generic revenue_contra
 * (4300) path used by marketplace/booking refunds.
 *
 * Previously a manual subscription refund emitted referenceId=null (subscription
 * payments have reference_id, not order_id/booking_id), so the payment:refunded
 * handler returned early and posted NO accounting at all — a silent omission.
 */

const ACC = {
  clearing: 33,      // 1100 Payment Clearing
  cash: 25,          // 1120 Cash / Bank
  wallet: 37,        // 2100 Customer Wallet Liability
  subRevenue: 61,    // 4170 Platform / Subscription Revenue
};

const MAPPINGS: Record<string, Array<{ concept: string; accountId: number }>> = {
  subscription_card_refund: [
    { concept: 'revenue', accountId: ACC.subRevenue },
    { concept: 'payment_clearing', accountId: ACC.clearing },
  ],
  subscription_wallet_refund: [
    { concept: 'revenue', accountId: ACC.subRevenue },
    { concept: 'wallet_liability', accountId: ACC.wallet },
  ],
  subscription_cash_refund: [
    { concept: 'revenue', accountId: ACC.subRevenue },
    { concept: 'cash_bank', accountId: ACC.cash },
  ],
  // Generic refunds must remain on the generic path.
  card_refund: [
    { concept: 'revenue_contra', accountId: 99 },
    { concept: 'payment_clearing', accountId: ACC.clearing },
  ],
  wallet_refund: [
    { concept: 'revenue_contra', accountId: 99 },
    { concept: 'wallet_liability', accountId: ACC.wallet },
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

import { EVENT_CONCEPTS } from '../application/accounting-concepts.js';

vi.mock('../application/accounting-engine.service.js', async () => {
  const { EVENT_CONCEPTS: concepts } = await import('../application/accounting-concepts.js');
  return {
    accountingEngineService: {
      resolveMapping: vi.fn(async (eventType: string, orgId?: any) => MAPPINGS[eventType] ?? []),
      validateAccounts: vi.fn(async () => undefined),
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

import { registerAccountingEventListeners } from '../application/accounting-event.listener.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { accountingEngineService } from '../application/accounting-engine.service.js';

const postedLines = (): any[] =>
  (ledgerRepository.createEntries as any).mock.calls.at(-1)?.[0] ?? [];

beforeEach(() => {
  vi.resetAllMocks();
  busHandlers.clear();
  // Re-establish the default mocks after resetAllMocks clears implementations.
  (ledgerRepository.hasPosting as any).mockImplementation(async () => false);
  (ledgerRepository.createEntries as any).mockImplementation(async (entries: any[]) => entries.map((_, i) => 1000 + i));
  (accountingEngineService.resolveMapping as any).mockImplementation(async (eventType: string, orgId?: any) => MAPPINGS[eventType] ?? []);
  (accountingEngineService.validateAccounts as any).mockImplementation(async () => undefined);
  (accountingEngineService.buildLedgerLines as any).mockImplementation((eventType: string, mapping: any[], amounts: Record<string, number>) => {
    const def = EVENT_CONCEPTS[eventType];
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
  });
  (accountingEngineService.validateBalance as any).mockImplementation(() => true);
});

describe('F-12 — subscription refund accounting (Model B reversal)', () => {
  it('payment:refunded for subscription card routes to subscription_card_refund (Dr 4170 / Cr 1100, org NULL)', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:refunded')![0];

    await handler({ referenceType: 'subscription', referenceId: 55, amount: 500, metadata: { paymentMethod: 'card', currency: 'EGP' } });

    expect(accountingEngineService.resolveMapping).toHaveBeenCalledWith('subscription_card_refund', null);
    const lines = postedLines();
    const d = lines.find((l) => l.side === 'debit');
    const c = lines.find((l) => l.side === 'credit');
    expect(d.chartAccountId).toBe(ACC.subRevenue); // 4170 revenue reversed
    expect(c.chartAccountId).toBe(ACC.clearing);   // 1100 custody reversed
    expect(d.amount).toBe(500);
    expect(c.amount).toBe(500);
    expect(lines.every((l) => l.organisationId === null)).toBe(true);
  });

  it('subscription wallet refund → Dr 4170 / Cr 2100 (wallet credit)', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:refunded')![0];

    await handler({ referenceType: 'subscription', referenceId: 56, amount: 300, metadata: { paymentMethod: 'wallet', currency: 'EGP' } });

    expect(accountingEngineService.resolveMapping).toHaveBeenCalledWith('subscription_wallet_refund', null);
    const lines = postedLines();
    expect(lines.find((l) => l.side === 'debit').chartAccountId).toBe(ACC.subRevenue);
    expect(lines.find((l) => l.side === 'credit').chartAccountId).toBe(ACC.wallet);
    expect(lines.every((l) => l.organisationId === null)).toBe(true);
  });

  it('subscription cash refund → Dr 4170 / Cr 1120', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:refunded')![0];

    await handler({ referenceType: 'subscription', referenceId: 57, amount: 200, metadata: { paymentMethod: 'cash', currency: 'EGP' } });

    expect(accountingEngineService.resolveMapping).toHaveBeenCalledWith('subscription_cash_refund', null);
    const lines = postedLines();
    expect(lines.find((l) => l.side === 'debit').chartAccountId).toBe(ACC.subRevenue);
    expect(lines.find((l) => l.side === 'credit').chartAccountId).toBe(ACC.cash);
  });

  it('debit equals credit for every subscription refund', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:refunded')![0];

    for (const [pm, amt] of [['card', 100], ['wallet', 100], ['cash', 100]] as const) {
      await handler({ referenceType: 'subscription', referenceId: Number(amt), amount: amt, metadata: { paymentMethod: pm, currency: 'EGP' } });
      const lines = postedLines();
      const debit = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0);
      const credit = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0);
      expect(debit).toBe(amt);
      expect(credit).toBe(amt);
    }
  });

  it('subscription refund is idempotent (hasPosting short-circuits a retry)', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:refunded')![0];

    vi.mocked(ledgerRepository.hasPosting).mockResolvedValueOnce(false).mockResolvedValue(true);

    await handler({ referenceType: 'subscription', referenceId: 71, amount: 400, metadata: { paymentMethod: 'card', currency: 'EGP' } });
    const afterFirst = (ledgerRepository.createEntries as any).mock.calls.length;

    // Retry of the same refund — hasPosting returns true → no second posting.
    await handler({ referenceType: 'subscription', referenceId: 71, amount: 400, metadata: { paymentMethod: 'card', currency: 'EGP' } });

    expect((ledgerRepository.createEntries as any).mock.calls.length).toBe(afterFirst);
  });

  it('generic card/wallet refund path is UNTOUCHED for non-subscription reference types', async () => {
    registerAccountingEventListeners();
    const handler = busHandlers.get('payment:refunded')![0];

    // A marketplace "order" refund must still use the marketplace path (not tested here),
    // and an unknown generic reference must still use wallet_refund/card_refund.
    await handler({ referenceType: 'something_else', referenceId: 88, amount: 50, metadata: { paymentMethod: 'card', currency: 'EGP' } });

    expect(accountingEngineService.resolveMapping).toHaveBeenCalledWith('card_refund', null);
  });
});