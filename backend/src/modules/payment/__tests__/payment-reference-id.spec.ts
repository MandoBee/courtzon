import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3006';

type RowData = RowDataPacket[];

/**
 * Regression test for the "Payment preparation failed: Internal Server Error"
 * defect. `payment_transactions.reference_id` is `bigint unsigned`; the
 * booking_prepare flow passes a UUID (string) referenceId that is later
 * relinked to the booking via `booking_id`. Writing the UUID into the bigint
 * column raises ER_TRUNCATED_WRONG_VALUE_FOR_FIELD under STRICT mode → HTTP 500.
 *
 * The repository now defensively stores only numeric references and NULL for
 * non-numeric ones. This test proves a UUID referenceId persists without error
 * and that `reference_id` is NULL while the row is retrievable.
 */
describe('payment_transactions.reference_id — UUID-safe (booking_prepare)', () => {
  let pool: mysql.Pool;
  const marker = `ref_id_regression_${Date.now()}`;
  let createdId: number | null = null;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
  });

  afterAll(async () => {
    if (createdId != null) {
      await pool.execute(`DELETE FROM payment_transactions WHERE id = ?`, [createdId]);
    }
    await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference = ?`, [`wallet_${marker}`]);
    await pool.end();
  });

  it('create() accepts a UUID referenceId (booking_prepare) without a 500 — reference_id stays NULL', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');

    const uuid = randomUUID();
    const result = await paymentRepository.create({
      userId: 1,
      // booking_prepare: no booking_id, order_id, no numeric reference
      referenceType: 'booking_prepare',
      referenceId: uuid as any, // string UUID as passed by prepareGatewayBooking
      paymentMethod: 'card',
      gatewayProvider: 'paymob',
      gatewayReference: `wallet_${marker}`,
      amount: 200,
      currency: 'EGP',
      status: 'pending',
    });

    expect(result.id).toBeGreaterThan(0);
    createdId = result.id;

    const [rows] = await pool.execute<RowData>(
      `SELECT id, reference_id, reference_type, booking_id, order_id, payment_status
       FROM payment_transactions WHERE id = ?`,
      [result.id],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0] as any;
    // reference_id must be NULL — the UUID is never written to the bigint column
    expect(row.reference_id).toBeNull();
    expect(row.reference_type).toBe('booking_prepare');
    expect(row.booking_id).toBeNull();
    expect(row.order_id).toBeNull();
  });

  it('create() still persists numeric reference_id for booking/order references', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');

    const result = await paymentRepository.create({
      userId: 1,
      bookingId: 999999,
      referenceType: 'booking',
      referenceId: 999999 as any,
      paymentMethod: 'card',
      gatewayProvider: 'paymob',
      gatewayReference: `wallet_${marker}_num`,
      amount: 50,
      currency: 'EGP',
      status: 'pending',
    });
    createdId = result.id;

    const [rows] = await pool.execute<RowData>(
      `SELECT id, reference_id, booking_id FROM payment_transactions WHERE id = ?`,
      [result.id],
    );
    const row = rows[0] as any;
    expect(Number(row.reference_id)).toBe(999999);
    expect(Number(row.booking_id)).toBe(999999);
  });

  it('source: prepareGatewayBooking no longer passes a UUID as referenceId (S5)', () => {
    const src = readFileSync(new URL('../../booking/application/booking.service.ts', import.meta.url), 'utf-8');

    // booking_prepare must pass referenceId: undefined — the UUID prepareId is
    // only used as the Redis prepare key, never as a numeric payment reference.
    const prepareBlockStart = src.indexOf("referenceType: 'booking_prepare'");
    expect(prepareBlockStart).toBeGreaterThan(-1);
    const blockEnd = src.indexOf('});', prepareBlockStart);
    const block = src.slice(prepareBlockStart, blockEnd);

    expect(block).toContain('referenceId: undefined');
    expect(block.includes('referenceId: prepareId')).toBe(false);
  });

  it('S6 local protection: a pending booking_prepare row can be expired safely (gateway has no cancel/void API)', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');

    const created = await paymentRepository.create({
      userId: 1,
      referenceType: 'booking_prepare',
      referenceId: randomUUID() as any,
      paymentMethod: 'card',
      gatewayProvider: 'paymob',
      gatewayReference: `wallet_${marker}_s6`,
      amount: 200,
      currency: 'EGP',
      status: 'pending',
    });
    createdId = created.id;

    // expirePayment transitions pending → expired (the safest local protection
    // available when a gateway intention exists but the local flow aborted).
    const expired = await paymentRepository.expirePayment(created.id);
    expect(expired).toBe(true);

    const [rows] = await pool.execute<RowData>(
      `SELECT payment_status FROM payment_transactions WHERE id = ?`,
      [created.id],
    );
    expect((rows as any[])[0].payment_status).toBe('expired');

    // A late webhook on an expired row is idempotently skipped (FINAL_STATES).
    const again = await paymentRepository.expirePayment(created.id);
    expect(again).toBe(false);
  });

  it('S6 source: prepareGatewayBooking expires the local row on post-gateway failure and never invents a gateway cancel', () => {
    const src = readFileSync(new URL('../../booking/application/booking.service.ts', import.meta.url), 'utf-8');

    // The catch must release locks, best-effort expire the local payment row, and
    // rethrow the original error. Slice a generous window after the catch opening.
    const catchIdx = src.indexOf('} catch (err) {', src.indexOf('localPaymentId'));
    expect(catchIdx).toBeGreaterThan(-1);
    const afterCatch = src.slice(catchIdx, catchIdx + 2000);
    expect(afterCatch).toContain('expirePayment(localPaymentId)');
    expect(afterCatch).toContain('throw err');

    // No gateway cancel/void/expire is invented — the abstraction has none.
    const gatewayTypes = readFileSync(new URL('../../../shared/services/gateway/payment-gateway.types.ts', import.meta.url), 'utf-8');
    expect(gatewayTypes).not.toContain('cancel(');
    expect(gatewayTypes).not.toContain('voidIntent');
  });
});