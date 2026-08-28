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

// ── Fake payment gateway (hoisted so the vi.mock factory shares the same object) ──
const fakeGateway = vi.hoisted(() => {
  const state: { calls: { transactionId: string; amount: number; reason?: string }[]; failNext: boolean; delayMs: number } = {
    calls: [],
    failNext: false,
    delayMs: 0,
  };
  return {
    state,
    refund: vi.fn(async (input: { transactionId: string; amount: number; reason?: string }) => {
      if (state.delayMs > 0) {
        await new Promise((r) => setTimeout(r, state.delayMs));
      }
      if (state.failNext) {
        state.failNext = false;
        return { success: false, errorMessage: 'gateway temporarily unavailable' };
      }
      state.calls.push(input);
      return { success: true, refundId: `mref_${state.calls.length}_${Date.now()}` };
    }),
    charge: vi.fn(async () => ({ success: true, transactionId: `tt_${Date.now()}` })),
  };
});

vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: fakeGateway,
  createPaymentGateway: () => fakeGateway,
}));

// The card refund branch emits payment:refunded inside withTransaction via
// after-commit hooks (BullMQ enqueue). Stub the event bus so the integration is
// deterministic; we assert emit COUNT as the proxy for exactly-one reversal.
const eventBusMock = vi.hoisted(() => ({ emit: vi.fn(async () => {}), on: vi.fn(), getInMemoryHandlers: vi.fn(() => []) }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBusMock }));

/**
 * Hardening — Multi-seller GROUP CARD refund concurrency.
 *
 * Problem (W4 residual): a multi-seller card checkout creates ONE
 * payment_transactions row (primary order, amount = checkout-group grand total).
 * Every sibling's refund resolves to that same row and paymentService.refund's
 * CARD branch called the gateway BEFORE any lock/state guard — so concurrent
 * sibling/duplicate/retry refunds could double-execute the SAME underlying card
 * transaction (and Sequential group cancels even issued N gateway refunds).
 *
 * Fix under test: the CARD branch now runs inside withTransaction, takes
 * paymentRepository.lockById (SELECT ... FOR UPDATE), refuses when the row is
 * not 'paid', executes the gateway INSIDE the lock, marks 'refunded' with an
 * affectedRows guard, and emits payment:refunded ONLY on the executing path.
 * Whoever acquires the lock first refunds the full captured amount; every
 * concurrent/retry request observes the committed 'refunded' status and returns
 * idempotently WITHOUT touching the gateway.
 *
 * Real MySQL FOR UPDATE serialization = the real engine behaviour. Gateway is a
 * fake (per task: "Gateway = mocks/fakes").
 */
describe('Hardening — group card refund concurrency (single gateway execution)', () => {
  let pool: mysql.Pool;
  let userId: number;
  const EMAIL = 'hardening-group-card-refund@courtzon.test';
  const PHONE = '+2010333444555';
  let refSeq = 900000;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0333444555', ?, ?, 'x', 'Group Card Refund Tester', 'female')`,
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
    eventBusMock.emit.mockClear();
  });

  async function insertCardPayment(amount: number, referenceId?: number): Promise<number> {
    refSeq += 1;
    const [p] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status, trace_id, paid_at)
       VALUES (?, 'order', ?, 'card', 'mock', ?, ?, 'EGP', 'paid', UUID(), NOW())`,
      [userId, referenceId ?? refSeq, `hr_group_${refSeq}_${Math.random().toString(36).slice(2, 8)}`, amount],
    );
    return (p as any).insertId;
  }

  async function status(paymentId: number): Promise<string> {
    const [rows] = await pool.execute<RowData>(`SELECT payment_status FROM payment_transactions WHERE id = ?`, [paymentId]);
    return (rows as any[])[0].payment_status;
  }

  function emittedRefundedEvents(): number {
    return eventBusMock.emit.mock.calls.filter((c: any[]) => c[0] === 'payment:refunded').length;
  }

  it('A+G: two CONCURRENT refunds of the SAME card payment → exactly ONE gateway execution, unrelated payments unaffected', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1000);
    // Widen the serialization window so one caller is actually blocked on FOR
    // UPDATE while the other is inside the gateway.
    fakeGateway.state.delayMs = 150;

    const [r1, r2] = await Promise.all([
      paymentService.refund(paymentId, 1000, 'A first sibling'),
      paymentService.refund(paymentId, 1000, 'A second sibling'),
    ]);
    fakeGateway.state.delayMs = 0;

    // The underlying card transaction was gateway-refunded EXACTLY once.
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(fakeGateway.state.calls[0].amount).toBe(1000);
    // The gateway is addressed by its transaction reference (the mock's
    // gateway_reference), not the internal payment id.
    await expect(
      (async () => {
        const [rows] = await pool.execute<RowData>(`SELECT gateway_reference FROM payment_transactions WHERE id = ?`, [paymentId]);
        return (rows as any[])[0].gateway_reference;
      })(),
    ).resolves.toBe(fakeGateway.state.calls[0].transactionId);

    // One caller executed, the other took the idempotent path — both report success.
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const executed = [r1, r2].filter((r: any) => !r.idempotent);
    const idempotent = [r1, r2].filter((r: any) => r.idempotent);
    expect(executed.length).toBe(1);
    expect(idempotent.length).toBe(1);
    expect(idempotent[0].refundId).toBe(`existing_refund_${paymentId}`);

    // Exactly one accounting reversal is emitted (E).
    expect(emittedRefundedEvents()).toBe(1);

    // Two unrelated payments refunded concurrently are NOT serialized against
    // each other — each executes its own gateway refund (G).
    fakeGateway.state.calls = [];
    const pA = await insertCardPayment(500);
    const pB = await insertCardPayment(600);
    fakeGateway.state.delayMs = 0;
    const results = await Promise.all([
      paymentService.refund(pA, 500, 'G payment A'),
      paymentService.refund(pB, 600, 'G payment B'),
    ]);
    expect(results.every((r: any) => r.success)).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(2);
    expect([...fakeGateway.state.calls].map((c) => c.amount).sort((x, y) => x - y)).toEqual([500, 600]);
    expect(await status(pA)).toBe('refunded');
    expect(await status(pB)).toBe('refunded');
  });

  it('B: a second (retry/duplicate) refund after success is idempotent — NO second gateway call, NO second emit', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(700);

    const first = await paymentService.refund(paymentId, 700, 'B first');
    expect(first.success).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(1);

    const again = await paymentService.refund(paymentId, 700, 'B retry/duplicate');
    expect(again.success).toBe(true);
    expect(again.idempotent).toBe(true);
    expect(again.refundId).toBe(`existing_refund_${paymentId}`);
    // 0 new gateway executions, still exactly 1 reverse of the same payment.
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('C+D: gateway failure → NO refunded state persisted; retry refunds exactly once and succeeds', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(900);

    fakeGateway.state.failNext = true;
    const failed = await paymentService.refund(paymentId, 900, 'C transient failure');
    expect(failed.success).toBe(false);
    expect(failed.errorMessage).toBe('gateway temporarily unavailable');
    // Money did not move AND no state was persisted (no false refunded flag).
    expect(fakeGateway.state.calls.length).toBe(0);
    expect(await status(paymentId)).toBe('paid');

    const retry = await paymentService.refund(paymentId, 900, 'C retry');
    expect(retry.success).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(await status(paymentId)).toBe('refunded');

    const third = await paymentService.refund(paymentId, 900, 'C post-success duplicate');
    expect(third.success).toBe(true);
    expect(third.idempotent).toBe(true);
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('A2: concurrent CONCURRENT sibling requests where one FAILS transiently → one success only, no partial', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(1200);
    fakeGateway.state.delayMs = 120;
    fakeGateway.state.failNext = true;

    const [r1, r2] = await Promise.all([
      paymentService.refund(paymentId, 1200, 'A2 sibling one'),
      paymentService.refund(paymentId, 1200, 'A2 sibling two'),
    ]);
    fakeGateway.state.delayMs = 0;

    const okCount = [r1, r2].filter((r: any) => r.success).length;
    expect(okCount).toBe(1);
    const executedCount = [r1, r2].filter((r: any) => !r.idempotent && r.success).length;
    expect(executedCount).toBe(1);
    // One sibling attempted and failed (gateway down) — its failure did NOT
    // mark anything refunded and did NOT block the sibling that succeeded.
    expect(await status(paymentId)).toBe('refunded');
    expect(fakeGateway.state.calls.length).toBe(1);
    expect(emittedRefundedEvents()).toBe(1);
  });

  it('B2: idempotent path for a NON-paid, non-refunded payment is rejected (ConflictError), not asserted refunded', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertCardPayment(50);
    await pool.execute(
      `UPDATE payment_transactions SET payment_status = 'cancelled' WHERE id = ?`,
      [paymentId],
    );
    await expect(paymentService.refund(paymentId, 50, 'B2 not refundable')).rejects.toThrow(/not refundable/);
    expect(fakeGateway.state.calls.length).toBe(0);
    expect(await status(paymentId)).toBe('cancelled');
  });
});