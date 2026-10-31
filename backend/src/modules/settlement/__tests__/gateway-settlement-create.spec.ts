import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P5-09 — gateway settlement creation: duplicate protection and batch totals (OFFLINE).
 *
 * Drives the REAL `gatewaySettlementService.create()` against a scripted
 * transaction connection. Pins:
 *   - header gross/fee/net = Σ of the computed line snapshots (to the cent);
 *   - the clearing→bank journal is posted ONCE, inside the same transaction;
 *   - a duplicate settlement (already linked, or an ACTIVE line, or a lost
 *     guarded UPDATE) fails with ConflictError and posts NOTHING;
 *   - a mid-batch failure rolls back before the accounting call.
 *
 * No database, no network.
 */

type Row = Record<string, any>;

const state = {
  payments: new Map<number, Row>(),
  activeLines: new Map<number, Row[]>(),
  /** Simulates the guarded `UPDATE … WHERE gateway_settlement_id IS NULL` result. */
  updateAffected: new Map<number, number>(),
  inserts: [] as Array<{ table: string; params: any[] }>,
  accountingCalls: [] as any[],
  began: 0,
  committed: 0,
  rolledBack: 0,
  released: 0,
  // reverse() state
  settlementStatus: 'completed',
  reversalLines: [] as Row[],
  reversalLineAffected: 1,
  reversalMarks: [] as Array<{ params: any[] }>,
};

const postAccounting = vi.fn();
const postReversal = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    getConnection: async () => conn,
    execute: async (sql: string, params?: any[]) => {
      if (/FROM gateway_settlements gs/.test(sql)) {
        return [[{ id: Number(params?.[0]), gross_amount: 100, gateway_fee_amount: 2.5, net_amount: 97.5 }], []];
      }
      if (/FROM gateway_settlement_transactions gst/.test(sql)) {
        return [[{ id: 1, gateway_settlement_id: Number(params?.[0]) }], []];
      }
      return [[], []];
    },
    query: async () => [[], []],
  }),
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn(), on: vi.fn() },
}));

vi.mock('../../financial/application/accounting-event.listener.js', () => ({
  postGatewaySettlementAccounting: (...args: any[]) => {
    state.accountingCalls.push(args);
    return postAccounting(...args);
  },
  postGatewaySettlementReversalAccounting: (...args: any[]) => postReversal(...args),
}));

import { gatewaySettlementService } from '../application/gateway-settlement.service.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

let conn: any;

function buildConn() {
  conn = {
    beginTransaction: vi.fn(async () => { state.began++; }),
    commit: vi.fn(async () => { state.committed++; }),
    rollback: vi.fn(async () => { state.rolledBack++; }),
    release: vi.fn(() => { state.released++; }),
    execute: vi.fn(async (sql: string, params?: any[]) => {
      // ── reverse() ──────────────────────────────────────────────────────
      if (/SELECT id, batch_code, settlement_status, gross_amount/.test(sql)) {
        return [[{
          id: Number(params?.[0]), batch_code: 'GWS-TEST', settlement_status: state.settlementStatus,
          gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, currency: 'EGP',
        }], []];
      }
      if (/SELECT gst\.id AS line_id, gst\.payment_transaction_id/.test(sql)) {
        return [state.reversalLines, []];
      }
      if (/SET gateway_settlement_id = NULL/.test(sql)) {
        return [{ affectedRows: state.reversalLineAffected }, []];
      }
      if (/UPDATE gateway_settlement_transactions/.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/UPDATE gateway_settlements\s+SET settlement_status = 'reversed'/.test(sql)) {
        state.reversalMarks.push({ params: params ?? [] });
        return [{ affectedRows: 1 }, []];
      }
      // ── create() ───────────────────────────────────────────────────────
      if (/INSERT INTO gateway_settlements/.test(sql)) {
        state.inserts.push({ table: 'gateway_settlements', params: params ?? [] });
        return [{ insertId: 77, affectedRows: 1 }, []];
      }
      if (/INSERT INTO gateway_settlement_transactions/.test(sql)) {
        state.inserts.push({ table: 'gateway_settlement_transactions', params: params ?? [] });
        return [{ insertId: state.inserts.length, affectedRows: 1 }, []];
      }
      if (/UPDATE payment_transactions/.test(sql)) {
        const id = Number(params?.[1]);
        const affected = state.updateAffected.get(id) ?? 1;
        return [{ affectedRows: affected }, []];
      }
      if (/FROM gateway_settlement_transactions gst/.test(sql)) {
        const id = Number(params?.[0]);
        return [state.activeLines.get(id) ?? [], []];
      }
      if (/FROM payment_transactions pt/.test(sql) && /FOR UPDATE/.test(sql)) {
        const id = Number(params?.[0]);
        const row = state.payments.get(id);
        return [row ? [row] : [], []];
      }
      return [[], []];
    }),
  };
}

function payment(id: number, overrides: Row = {}): Row {
  return {
    id,
    payment_status: 'paid',
    payment_method: 'card',
    currency: 'EGP',
    amount: 100,
    gateway_settlement_id: null,
    payment_method_id: 3,
    processing_fee_pct: 2.5,
    processing_fee_fixed: 0,
    ...overrides,
  };
}

function batchHeader() {
  return state.inserts.find((i) => i.table === 'gateway_settlements')!.params;
}

beforeEach(() => {
  state.payments.clear();
  state.activeLines.clear();
  state.updateAffected.clear();
  state.inserts.length = 0;
  state.accountingCalls.length = 0;
  state.began = 0;
  state.committed = 0;
  state.rolledBack = 0;
  state.released = 0;
  state.settlementStatus = 'completed';
  state.reversalLines = [];
  state.reversalLineAffected = 1;
  state.reversalMarks.length = 0;
  vi.clearAllMocks();
  postAccounting.mockResolvedValue(undefined);
  postReversal.mockResolvedValue(undefined);
  buildConn();
});

describe('P5-09 gateway settlement create — totals and posting', () => {
  it('creates the batch with header gross/fee/net equal to the computed line snapshot', async () => {
    state.payments.set(101, payment(101));

    await gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 });

    const [batchCode, gross, fee, net, currency, count] = batchHeader();
    expect(batchCode).toMatch(/^GWS-\d{4}-\d{2}-\d{2}-\d+$/);
    expect(gross).toBe(100);
    expect(fee).toBe(2.5);
    expect(net).toBe(97.5);
    expect(currency).toBe('EGP');
    expect(count).toBe(1);

    const line = state.inserts.find((i) => i.table === 'gateway_settlement_transactions')!.params;
    expect(line).toEqual([77, 101, 101, 3, 100, 2.5, 0, 2.5, 97.5, 'EGP']);
  });

  it('posts the clearing→bank journal once, with the batch totals, inside the transaction', async () => {
    state.payments.set(101, payment(101));

    await gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 });

    expect(state.accountingCalls).toEqual([[77, 100, 97.5, 2.5, 'EGP', conn]]);
    expect(state.began).toBe(1);
    expect(state.committed).toBe(1);
    expect(state.rolledBack).toBe(0);
  });

  it('aggregates multiple lines and reconciles gross = fee + net to the cent', async () => {
    state.payments.set(101, payment(101, { amount: 33.33, processing_fee_pct: 3, processing_fee_fixed: 0 }));
    state.payments.set(102, payment(102, { amount: 33.33, processing_fee_pct: 3, processing_fee_fixed: 0 }));

    await gatewaySettlementService.create({ paymentTransactionIds: [101, 102], settledBy: 9 });

    const [, gross, fee, net, , count] = batchHeader();
    expect(gross).toBe(66.66);
    expect(fee).toBe(2); // 1.00 per line (0.9999 rounded)
    expect(net).toBe(64.66);
    expect(count).toBe(2);
    expect(state.accountingCalls[0][1]).toBe(gross);
    expect(state.accountingCalls[0][2]).toBe(net);
    expect(state.accountingCalls[0][3]).toBe(fee);
  });

  it('deduplicates repeated ids in the request (one line per payment)', async () => {
    state.payments.set(101, payment(101));

    await gatewaySettlementService.create({ paymentTransactionIds: [101, 101, 101], settledBy: 9 });

    expect(state.inserts.filter((i) => i.table === 'gateway_settlement_transactions')).toHaveLength(1);
    expect(batchHeader()[5]).toBe(1);
  });
});

describe('P5-09 gateway settlement create — duplicate protection', () => {
  it('rejects a payment already linked to a settlement before inserting anything', async () => {
    state.payments.set(101, payment(101, { gateway_settlement_id: 5 }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(/already included in a gateway settlement/);

    expect(state.inserts).toHaveLength(0);
    expect(state.accountingCalls).toHaveLength(0);
    expect(state.rolledBack).toBe(1);
  });

  it('rejects a payment that already owns an ACTIVE settlement line (tampered linkage)', async () => {
    state.payments.set(101, payment(101));
    state.activeLines.set(101, [{ id: 4, gateway_settlement_id: 6 }]);

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(/already an ACTIVE line of gateway settlement 6/);

    expect(state.inserts).toHaveLength(0);
    expect(state.accountingCalls).toHaveLength(0);
    expect(state.rolledBack).toBe(1);
  });

  it('rolls back with NO posting when the guarded payment UPDATE loses a concurrent race', async () => {
    state.payments.set(101, payment(101)); // stale read: column still NULL
    state.updateAffected.set(101, 0);       // another transaction already claimed it

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(ConflictError);

    expect(state.accountingCalls).toHaveLength(0); // never post for a lost claim
    expect(state.committed).toBe(0);
    expect(state.rolledBack).toBe(1);
    expect(state.released).toBe(1);
  });

  it('rejects an empty selection without opening a transaction', async () => {
    await expect(gatewaySettlementService.create({ paymentTransactionIds: [], settledBy: 9 }))
      .rejects.toThrow(/No eligible payment transactions/);

    expect(state.began).toBe(0);
    expect(state.inserts).toHaveLength(0);
  });
});

describe('P5-09 gateway settlement reverse — stored amounts and idempotency', () => {
  function armReversal(overrides: { status?: string; lineAffected?: number } = {}) {
    state.settlementStatus = overrides.status ?? 'completed';
    state.reversalLineAffected = overrides.lineAffected ?? 1;
    state.reversalLines = [{ line_id: 11, payment_transaction_id: 101 }];
  }

  it('posts the exact inverse from the STORED batch amounts and marks the batch reversed', async () => {
    armReversal();

    await gatewaySettlementService.reverse({ settlementId: 77, reversedBy: 9, reason: 'bank mismatch' });

    expect(postReversal).toHaveBeenCalledTimes(1);
    expect(postReversal.mock.calls[0].slice(0, 5)).toEqual([77, 300, 291, 9, 'EGP']);
    expect(state.reversalMarks).toHaveLength(1);
    expect(state.reversalMarks[0].params[0]).toBe(9);            // reversedBy
    expect(state.reversalMarks[0].params[1]).toBe('bank mismatch');
    expect(state.reversalMarks[0].params[3]).toBe(77);
    expect(state.committed).toBe(1);
    expect(state.rolledBack).toBe(0);
  });

  it('refuses to reverse an already-reversed batch (no second journal)', async () => {
    armReversal({ status: 'reversed' });

    await expect(gatewaySettlementService.reverse({ settlementId: 77, reversedBy: 9, reason: 'again' }))
      .rejects.toThrow(/already reversed/);

    expect(postReversal).not.toHaveBeenCalled();
    expect(state.rolledBack).toBe(1);
    expect(state.committed).toBe(0);
  });

  it('aborts the whole reversal when a payment linkage changed concurrently (no commit)', async () => {
    armReversal({ lineAffected: 0 });

    await expect(gatewaySettlementService.reverse({ settlementId: 77, reversedBy: 9, reason: 'race' }))
      .rejects.toThrow(/linkage changed concurrently/);

    expect(state.committed).toBe(0);
    expect(state.rolledBack).toBe(1);
    expect(state.reversalMarks).toHaveLength(0);
  });

  it('requires a reason and a valid id before opening a transaction', async () => {
    await expect(gatewaySettlementService.reverse({ settlementId: 0, reversedBy: 9, reason: 'x' }))
      .rejects.toThrow(/Invalid gateway settlement id/);
    await expect(gatewaySettlementService.reverse({ settlementId: 77, reversedBy: 9, reason: '   ' }))
      .rejects.toThrow(/reversal reason is required/);

    expect(state.began).toBe(0);
  });
});

describe('P5-09 / B42 — single-currency settlement guard', () => {
  it('rejects a mixed EGP/USD selection BEFORE any insert or accounting posting', async () => {
    // Regression for B42: the header/journal are single-currency, so summing an
    // EGP and a USD line would produce a balanced but meaningless batch.
    state.payments.set(101, payment(101, { amount: 100, currency: 'EGP' }));
    state.payments.set(102, payment(102, { amount: 200, currency: 'USD' }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101, 102], settledBy: 9 }))
      .rejects.toThrow(/must share the same currency \(selected: EGP, USD\)/);

    // No partial batch, no journal, no committed transaction.
    expect(state.inserts).toHaveLength(0);
    expect(state.accountingCalls).toHaveLength(0);
    expect(state.committed).toBe(0);
    expect(state.rolledBack).toBe(1);
    expect(state.released).toBe(1);
  });

  it('rejects a mixed selection regardless of which currency comes first', async () => {
    state.payments.set(101, payment(101, { amount: 100, currency: 'USD' }));
    state.payments.set(102, payment(102, { amount: 200, currency: 'EGP' }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101, 102], settledBy: 9 }))
      .rejects.toThrow(/must share the same currency/);

    expect(state.inserts).toHaveLength(0);
    expect(state.accountingCalls).toHaveLength(0);
  });

  it('still creates a normal single-currency batch (EGP + EGP)', async () => {
    state.payments.set(101, payment(101, { amount: 100, currency: 'EGP' }));
    state.payments.set(102, payment(102, { amount: 200, currency: 'EGP' }));

    await gatewaySettlementService.create({ paymentTransactionIds: [101, 102], settledBy: 9 });

    const [, gross, fee, net, currency, count] = batchHeader();
    expect(currency).toBe('EGP');
    expect(gross).toBe(300);
    expect(fee).toBe(7.5);
    expect(net).toBe(292.5);
    expect(count).toBe(2);
    expect(state.accountingCalls).toHaveLength(1);
    expect(state.accountingCalls[0].slice(1)).toEqual([300, 292.5, 7.5, 'EGP', conn]);
    expect(state.committed).toBe(1);
  });

  it('still creates a normal single-currency batch (USD + USD)', async () => {
    state.payments.set(101, payment(101, { amount: 100, currency: 'USD' }));
    state.payments.set(102, payment(102, { amount: 200, currency: 'USD' }));

    await gatewaySettlementService.create({ paymentTransactionIds: [101, 102], settledBy: 9 });

    const [, gross, , , currency] = batchHeader();
    expect(currency).toBe('USD');
    expect(gross).toBe(300);
  });
});

describe('P5-09 gateway settlement create — eligibility and fee guards', () => {
  it('rejects an unpaid payment', async () => {
    state.payments.set(101, payment(101, { payment_status: 'pending' }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(/is not paid/);
    expect(state.inserts).toHaveLength(0);
  });

  it('rejects a non-gateway payment method (cash)', async () => {
    state.payments.set(101, payment(101, { payment_method: 'cash' }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(/is not a gateway payment/);
  });

  it('rejects a gateway payment with no fee configuration instead of recording a 0% fee', async () => {
    state.payments.set(101, payment(101, {
      payment_method_id: null, processing_fee_pct: null, processing_fee_fixed: null,
    }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(/fee configuration is missing/);
    expect(state.inserts).toHaveLength(0);
    expect(state.accountingCalls).toHaveLength(0);
  });

  it('rejects a zero/negative gross amount', async () => {
    state.payments.set(101, payment(101, { amount: 0 }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101], settledBy: 9 }))
      .rejects.toThrow(/invalid amount/);
  });

  it('does not post accounting when a LATER line in the batch is ineligible (no partial journal)', async () => {
    state.payments.set(101, payment(101));
    state.payments.set(102, payment(102, { payment_status: 'failed' }));

    await expect(gatewaySettlementService.create({ paymentTransactionIds: [101, 102], settledBy: 9 }))
      .rejects.toThrow(/not paid/);

    expect(state.inserts).toHaveLength(0);
    expect(state.accountingCalls).toHaveLength(0);
    expect(state.committed).toBe(0);
    expect(state.rolledBack).toBe(1);
  });
});
