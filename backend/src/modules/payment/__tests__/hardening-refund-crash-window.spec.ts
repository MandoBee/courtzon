import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

// ── Fake payment gateway with a refund LEDGER (hoisted so the vi.mock factory
//    shares the same object). The ledger mirrors MockGateway semantics: a
//    successful refund() records refunded cents per transaction reference, and
//    getRefundState() reads the ledger. Injection hooks simulate Paymob
//    uncertainty (unknown => fail-closed) and unreachability (throw).
const fakeGateway = vi.hoisted(() => {
  const state: {
    calls: { transactionId: string; amount: number; reason?: string }[];
    failNext: boolean;
    delayMs: number;
    ledger: Map<string, number>;
    injectedState: unknown;
    getRefundStateThrows: boolean;
  } = {
    calls: [],
    failNext: false,
    delayMs: 0,
    ledger: new Map(),
    injectedState: undefined,
    getRefundStateThrows: false,
  };
  return {
    state,
    refund: vi.fn(async (input: { transactionId: string; amount: number; reason?: string }) => {
      if (state.delayMs > 0) await new Promise((r) => setTimeout(r, state.delayMs));
      if (state.failNext) {
        state.failNext = false;
        return { success: false, errorMessage: 'gateway temporarily unavailable' };
      }
      state.calls.push(input);
      const cents = Math.round(input.amount * 100);
      state.ledger.set(input.transactionId, (state.ledger.get(input.transactionId) || 0) + cents);
      return { success: true, refundId: `mref_${state.calls.length}_${Date.now()}` };
    }),
    getRefundState: vi.fn(async (transactionId: string) => {
      if (state.getRefundStateThrows) {
        state.getRefundStateThrows = false;
        throw new Error('paymob service unreachable');
      }
      if (state.injectedState) return state.injectedState;
      const cents = state.ledger.get(transactionId) || 0;
      return cents > 0
        ? { outcome: 'refunded', refundedCents: cents, isFullyRefunded: true }
        : { outcome: 'not_refunded', refundedCents: 0 };
    }),
    charge: vi.fn(async () => ({ success: true, transactionId: `tt_${Date.now()}` })),
  };
});

vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: fakeGateway,
  createPaymentGateway: () => fakeGateway,
}));

// ── Event bus mock. emit() records events; when throwOnRefundedNext is set, a
//    'payment:refunded' emission throws BEFORE being recorded. This replicates a
//    process crash between the gateway refund and the final commit: T3 rolls
//    back (payment stays 'paid', no event), while the T2 arm (executedAt) was
//    already committed — the exact production crash window.
const eventBusMock = vi.hoisted(() => {
  const state: { calls: { name: string; payload: any }[]; throwOnRefundedNext: boolean } = {
    calls: [],
    throwOnRefundedNext: false,
  };
  return {
    state,
    emit: vi.fn(async (name: string, payload: any) => {
      if (name === 'payment:refunded' && state.throwOnRefundedNext) {
        state.throwOnRefundedNext = false;
        throw new Error('simulated crash after gateway success');
      }
      state.calls.push({ name, payload });
    }),
    on: vi.fn(),
    getInMemoryHandlers: vi.fn(() => []),
  };
});
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBusMock }));

/**
 * Hardening — Card refund CRASH WINDOW (approved Option B).
 *
 * Problem (the window): paymentService.refund's card branch calls the gateway
 * and only marks 'refunded' + emits the accounting event in a LATER commit. If
 * the process crashes after Paymob accepted the refund but before that commit,
 * the row stays 'paid'. A retry previously re-called the gateway → the SAME
 * card transaction could be refunded twice (money sent twice, accounting
 * reversed twice).
 *
 * Fix under test: before any external call, a durable refund intent is written
 * to gateway_response JSON and COMMITTED (T1). Immediately before the call it is
 * "armed" (executedAt, attempts) in another committed transaction (T2). The
 * gateway call then runs, and the row is locked and finalized (status +
 * completed intent + event) in one transaction (T3). A retry that finds a fresh
 * arm within the cool-off window refuses to re-call (defers / fails closed);
 * past the window it asks getRefundState() — refunded → finalize WITHOUT a
 * second call; not_refunded → execute once; unknown → fail closed.
 *
 * Real MySQL FOR UPDATE serialization = the real engine behaviour. Gateway is a
 * fake with a live refund ledger (per task: "Gateway = mocks/fakes").
 */
describe('Hardening — card refund crash window (single gateway execution across retries)', () => {
  let pool: mysql.Pool;
  let userId: number;
  const EMAIL = 'hardening-refund-crash-window@courtzon.test';
  const PHONE = '+2010444555666';
  let refSeq = 910000;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0444555666', ?, ?, 'x', 'Refund Crash Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  beforeEach(() => {
    fakeGateway.state.calls = [];
    fakeGateway.state.failNext = false;
    fakeGateway.state.delayMs = 0;
    fakeGateway.state.ledger.clear();
    fakeGateway.state.injectedState = undefined;
    fakeGateway.state.getRefundStateThrows = false;
    eventBusMock.state.calls = [];
    eventBusMock.state.throwOnRefundedNext = false;
  });

  async function insertCardPayment(amount: number, gatewayResponse?: unknown): Promise<number> {
    refSeq += 1;
    const [p] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status, gateway_response, trace_id, paid_at)
       VALUES (?, 'order', ?, 'card', 'mock', ?, ?, 'EGP', 'paid', ?, UUID(), NOW())`,
      [userId, refSeq, `hrc_${refSeq}_${Math.random().toString(36).slice(2, 8)}`, amount,
       gatewayResponse ? JSON.stringify(gatewayResponse) : null],
    );
    return (p as any).insertId;
  }

  async function paymentRow(paymentId: number): Promise<any> {
    const [rows] = await pool.execute<RowData>(`SELECT * FROM payment_transactions WHERE id = ?`, [paymentId]);
    return (rows as any[])[0];
  }

  async function gatewayRefOf(paymentId: number): Promise<string> {
    return String((await paymentRow(paymentId)).gateway_reference);
  }

  async function status(paymentId: number): Promise<string> {
    return (await paymentRow(paymentId)).payment_status;
  }

  async function readGatewayResponse(paymentId: number): Promise<any> {
    const row = await paymentRow(paymentId);
    return row.gateway_response ? JSON.parse(row.gateway_response) : null;
  }

  function emittedRefundedEvents(): number {
    return eventBusMock.state.calls.filter((c: any) => c.name === 'payment:refunded').length;
  }

  function staleIntent(opAmount: number): Record<string, unknown> {
    const now = Date.now();
    return {
      opId: `seed-op-${Math.random().toString(36).slice(2, 8)}`,
      amount: opAmount,
      currency: 'EGP',
      type: opAmount < 1000 ? 'partial' : 'full',
      priorRefundedCents: 0,
      status: 'confirmed',
      attempts: 1,
      executedAt: new Date(now - 2 * 60 * 1000).toISOString(),
      createdAt: new Date(now - 3 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 2 * 60 * 1000).toISOString(),
      gatewayRefundId: null,
    };
  }

  async function backdateExecutedAt(paymentId: number, minutesAgo = 2): Promise<void> {
    const row = await paymentRow(paymentId);
    const parsed = JSON.parse(row.gateway_response);
    parsed.refundIntent.executedAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    parsed.refundIntent.updatedAt = parsed.refundIntent.executedAt;
    await pool.execute(`UPDATE payment_transactions SET gateway_response = ? WHERE id = ?`, [JSON.stringify(parsed), paymentId]);
  }

  it('1. normal FULL refund: gateway called once, payment refunded, intent completed, event emitted once', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);

    const res = await paymentService.refund(paymentId, 1000, 'scenario 1 full');

    expect(res.success).toBe(true);
    expect(res.idempotent).toBeUndefined();
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(fakeGateway.state.calls[0].amount).toBe(1000);
    expect(await status(paymentId)).toBe('refunded');
    expect(emittedRefundedEvents()).toBe(1);

    const gw = await readGatewayResponse(paymentId);
    expect(gw.refundIntent.status).toBe('completed');
    expect(gw.refundIntent.type).toBe('full');
    expect(typeof gw.refundIntent.opId).toBe('string');
    expect(gw.refundIntent.executedAt).toBeTruthy();
    expect(gw.refundIntent.gatewayRefundId).toBeTruthy();
  });

  it('2. normal PARTIAL refund (300 of 1000): gateway called with amount, single-op closes the payment', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);

    const res = await paymentService.refund(paymentId, 300, 'scenario 2 partial');

    expect(res.success).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(fakeGateway.state.calls[0].amount).toBe(300);
    expect(await status(paymentId)).toBe('refunded');
    expect(emittedRefundedEvents()).toBe(1);
    const gw = await readGatewayResponse(paymentId);
    expect(gw.refundIntent.type).toBe('partial');
    expect(gw.refundIntent.amount).toBe(300);
    expect(gw.refundIntent.priorRefundedCents).toBe(0);
  });

  it('3. duplicate refund after success is idempotent — NO second gateway call, NO second event', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(700);

    const first = await paymentService.refund(paymentId, 700, 'scenario 3 first');
    expect(first.success).toBe(true);

    const again = await paymentService.refund(paymentId, 700, 'scenario 3 duplicate');
    expect(again.success).toBe(true);
    expect(again.idempotent).toBe(true);
    expect(again.refundId).toBe(`existing_refund_${paymentId}`);

    expect(fakeGateway.state.calls.length).toBe(1);
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('4. TWO CONCURRENT refunds of the same payment → exactly ONE gateway execution + ONE event', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);
    fakeGateway.state.delayMs = 120;

    const [r1, r2] = await Promise.all([
      paymentService.refund(paymentId, 1000, 'scenario 4 sibling A'),
      paymentService.refund(paymentId, 1000, 'scenario 4 sibling B'),
    ]);
    fakeGateway.state.delayMs = 0;

    expect(fakeGateway.state.calls.length).toBe(1);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const executed = [r1, r2].filter((r: any) => !r.idempotent).length;
    const idempotent = [r1, r2].filter((r: any) => r.idempotent).length;
    expect(executed).toBe(1);
    expect(idempotent).toBe(1);
    expect(emittedRefundedEvents()).toBe(1);
    expect(await status(paymentId)).toBe('refunded');
  });

  it('5. explicit gateway FAILURE clears the arm → retry re-executes immediately and succeeds once', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(900);

    fakeGateway.state.failNext = true;
    const failed = await paymentService.refund(paymentId, 900, 'scenario 5 transient');
    expect(failed.success).toBe(false);
    expect(failed.errorMessage).toBe('gateway temporarily unavailable');
    expect(fakeGateway.state.calls.length).toBe(0);
    expect(await status(paymentId)).toBe('paid');
    // The arm was cleared durably → intent readable and NOT marked executed.
    const gw = await readGatewayResponse(paymentId);
    expect(gw.refundIntent.status).toBe('initiated');
    expect(gw.refundIntent.executedAt).toBeNull();

    const retry = await paymentService.refund(paymentId, 900, 'scenario 5 retry');
    expect(retry.success).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(await status(paymentId)).toBe('refunded');
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('6. CRITICAL crash after gateway success: refund() throws, payment stays paid, NO event, arm is durable', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);

    fakeGateway.state.calls = [];
    eventBusMock.state.throwOnRefundedNext = true;
    await expect(
      paymentService.refund(paymentId, 1000, 'scenario 6 crash'),
    ).rejects.toThrow('simulated crash after gateway success');

    // The gateway refund WENT THROUGH (recorded in the ledger) but the local
    // state was rolled back — the exact production crash window.
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(await status(paymentId)).toBe('paid');
    expect(emittedRefundedEvents()).toBe(0);

    const gw = await readGatewayResponse(paymentId);
    expect(gw.refundIntent.status).toBe('confirmed');
    expect(typeof gw.refundIntent.executedAt).toBe('string');
    expect(gw.refundIntent.attempts).toBeGreaterThanOrEqual(1);
  });

  it('7. retry WITHIN the cool-off window refuses to re-execute (fail-closed, no second gateway call)', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);

    // Reproduce a fresh crash: gateway accepted, local commit rolled back.
    eventBusMock.state.throwOnRefundedNext = true;
    await expect(paymentService.refund(paymentId, 1000, 'scenario 7 setup')).rejects.toThrow('simulated crash');
    const before = fakeGateway.state.calls.length;
    expect(before).toBe(1);

    // Immediate retry, still inside the 60s window → must NOT re-call the gateway.
    await expect(paymentService.refund(paymentId, 1000, 'scenario 7 within window')).rejects.toThrow(/already being resolved|could not be resolved/);
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(await status(paymentId)).toBe('paid');
    expect(emittedRefundedEvents()).toBe(0);
  });

  it('8. retry AFTER the cool-off window: getRefundState says refunded → finalize WITHOUT a second gateway call', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1200);

    // Crash after gateway success (arm committed, local state rolled back).
    eventBusMock.state.throwOnRefundedNext = true;
    await expect(paymentService.refund(paymentId, 1200, 'scenario 8 crash')).rejects.toThrow('simulated crash');
    expect(fakeGateway.state.calls.length).toBe(1);

    // Cool-off elapses (deterministic: backdate the committed arm).
    await backdateExecutedAt(paymentId);

    const res = await paymentService.refund(paymentId, 1200, 'scenario 8 recovery');
    expect(res.success).toBe(true);
    expect(res.idempotent).toBe(true);
    // The gateway was called exactly once in total — the retry did NOT re-call.
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(await status(paymentId)).toBe('refunded');
    expect(emittedRefundedEvents()).toBe(1);
    const gw = await readGatewayResponse(paymentId);
    expect(gw.refundIntent.status).toBe('completed');
  });

  it('9. PARTIAL crash + recovery: gateway refunded the partial amount → satisfied check passes, single event', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);

    eventBusMock.state.throwOnRefundedNext = true;
    await expect(paymentService.refund(paymentId, 300, 'scenario 9 crash')).rejects.toThrow('simulated crash');
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(fakeGateway.state.calls[0].amount).toBe(300);

    await backdateExecutedAt(paymentId);
    const res = await paymentService.refund(paymentId, 300, 'scenario 9 recovery');
    expect(res.success).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(await status(paymentId)).toBe('refunded');
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('10. stale intent (fresh process, prior run crashed): gateway already refunded → recovery only, ZERO gateway calls', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000, { refundIntent: staleIntent(1000) });
    const gatewayRef = await gatewayRefOf(paymentId);
    // The previous run already refunded at the gateway (no local state).
    fakeGateway.state.ledger.set(gatewayRef, 100000);

    const res = await paymentService.refund(paymentId, 1000, 'scenario 10 recover prior run');
    expect(res.success).toBe(true);
    expect(res.idempotent).toBe(true);
    expect(res.refundId).toBe(`existing_refund_${paymentId}`);
    expect(fakeGateway.state.calls.length).toBe(0);
    expect(await status(paymentId)).toBe('refunded');
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('11. gateway state UNKNOWN → fail closed: no execute, no finalize, payment untouched, retryable error', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000, { refundIntent: staleIntent(1000) });
    fakeGateway.state.injectedState = { outcome: 'unknown', reason: 'paymob returned neither refund flag nor amount' };

    await expect(paymentService.refund(paymentId, 1000, 'scenario 11 unknown')).rejects.toThrow(/Cannot verify refund state/);
    expect(fakeGateway.state.calls.length).toBe(0);
    expect(await status(paymentId)).toBe('paid');
    expect(emittedRefundedEvents()).toBe(0);
  });

  it('12. gateway refunded LESS than the operation (partial mismatch) → fail closed with reconcile error', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000, { refundIntent: staleIntent(300) });
    const gatewayRef = await gatewayRefOf(paymentId);
    fakeGateway.state.ledger.set(gatewayRef, 20000);

    await expect(paymentService.refund(paymentId, 300, 'scenario 12 mismatch')).rejects.toThrow(/reconcile/);
    expect(fakeGateway.state.calls.length).toBe(0);
    expect(await status(paymentId)).toBe('paid');
    expect(emittedRefundedEvents()).toBe(0);
  });

  it('13. gateway_response preservation: unrelated keys survive, intent merged in, always valid JSON', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const seeded = { rawResponse: { id: 777, created_at: '2026-01-01', status: 'paid' }, custom: { flag: true }, notes: 'keep-me' };
    const paymentId = await insertCardPayment(1500, seeded);

    const res = await paymentService.refund(paymentId, 1500, 'scenario 13 preservation');
    expect(res.success).toBe(true);

    const parsed = await readGatewayResponse(paymentId);
    expect(parsed.custom.flag).toBe(true);
    expect(parsed.notes).toBe('keep-me');
    expect(parsed.rawResponse.id).toBe(777);
    expect(parsed.rawResponse.created_at).toBe('2026-01-01');
    expect(parsed.refundIntent.status).toBe('completed');
    expect(typeof parsed.refundIntent.opId).toBe('string');
    expect(parsed.refundIntent.gatewayRefundId).toBeTruthy();
  });
});

/**
 * Real MockGateway locale — the production 'mock' provider must itself answer
 * the refund-state query deterministically (used by the same recovery path).
 */
describe('Real MockGateway — refund ledger & state query', () => {
  it('records refunds into the ledger and reports refunded/not_refunded; injection overrides', async () => {
    const { MockGateway } = await import('../../../shared/services/gateway/mock-gateway.js');
    const gateway = new MockGateway({ provider: 'mock', sandbox: true });

    await expect(gateway.getRefundState('txn_1')).resolves.toEqual({ outcome: 'not_refunded', refundedCents: 0 });

    await gateway.refund({ transactionId: 'txn_1', amount: 10.5 });
    expect(gateway.getRefundedCents('txn_1')).toBe(1050);
    await expect(gateway.getRefundState('txn_1')).resolves.toEqual({ outcome: 'refunded', refundedCents: 1050, isFullyRefunded: true });

    // Distinct transactions never share ledger entries.
    await gateway.refund({ transactionId: 'txn_2', amount: 5 });
    expect(gateway.getRefundedCents('txn_2')).toBe(500);
    await expect(gateway.getRefundState('txn_2')).resolves.toEqual({ outcome: 'refunded', refundedCents: 500, isFullyRefunded: true });

    gateway.injectRefundState({ outcome: 'unknown', reason: 'route down' });
    await expect(gateway.getRefundState('txn_1')).resolves.toEqual({ outcome: 'unknown', reason: 'route down' });

    gateway.clearRefundLedger();
    await expect(gateway.getRefundState('txn_1')).resolves.toEqual({ outcome: 'not_refunded', refundedCents: 0 });
    gateway.clearRefundLedger();
  });
});