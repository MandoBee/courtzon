import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3031';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'paymob';
  process.env.PAYMOB_API_KEY = 'test'; process.env.PAYMOB_SECRET = 'test'; process.env.PAYMOB_PUBLIC_KEY = 'pk';
  process.env.PAYMOB_MERCHANT_ID = '12345'; process.env.PAYMOB_HMAC_SECRET = 'hmac';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';

type RowData = RowDataPacket[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Regression: booking_prepare stores gateway_reference = Paymob INTENTION order
 * id, but the Accept/iframe webhook carries a DIFFERENT transaction order id.
 * Before this fix the webhook could not find the local payment row, so the
 * booking stayed pending_payment and expire_stale_payments cancelled it after
 * 5 minutes even though Paymob had already charged the card successfully.
 *
 * Coverage:
 *  - intention order id != Accept transaction order id → webhook re-correlates
 *  - successful webhook finds and pays the booking (payment:succeeded →
 *    booking:paid) and emits booking:paid EXACTLY once
 *  - correlation through intention_id / intention_order_id stored in JSON
 *  - expire_stale_payments does NOT expire a Paymob-paid transaction (recover)
 *  - a normal unpaid transaction (Paymob confirms failed) still expires
 *  - no duplicate accounting/notifications
 */
describe('Paymob booking_prepare correlation + expiry safety', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'paymob-corr-org';
  const PHONE = '+2010111332200';
  const EMAIL = 'paymob-corr@courtzon.test';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (SELECT id FROM users WHERE full_phone = ? OR email = ?)`, [PHONE, EMAIL]);
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Paymob Corr Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'PC Branch', 'pc-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'PC Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111332200', ?, ?, 'x', 'PC Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;

    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
    const { registerBookingPaymentListeners } = await import('../../booking/application/booking-payment.listener.js');
    registerBookingPaymentListeners();

    // Flush webhook replay-protection keys so re-runs are not rejected as
    // duplicates (keys have a 24h TTL).
    try {
      const redis = getRedisClient();
      const keys = await redis.keys('webhook:processed:*');
      if (keys && keys.length) await redis.del(keys);
    } catch (err) {
      // non-fatal
    }
  });

  afterAll(async () => {
    // booking card/cod postings create BOTH CourtZon-book (org NULL) and
    // org-book ledger + GL rows; clear by reference before org-scoped rows.
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'booking_%' AND reference_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  async function insertBooking(hour = 9): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-10', ?, ?, 400, 0, 20, 380, 0, 'pending_payment', 'pending', 'card', 1)`,
      [userId, orgId, branchId, resourceId, `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`],
    );
    return (res as any).insertId;
  }

  /** Insert a booking_prepare payment row with an INTENTION order id stored as
   *  gateway_reference, exactly as createGatewayIntention does (the real Accept
   *  order id is NOT known at prepare time). created_at is backdated so the
   *  expiry job's `olderThan` window matches immediately. */
  async function insertPreparePayment(bookingId: number, prepareId: string, intentionOrderId: string, intentionId: string): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, booking_id, reference_id, idempotency_key, reference_type, payment_method, gateway_provider,
        gateway_reference, amount, currency, payment_status, gateway_response, aggregate_version, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, 'booking_prepare', 'card', 'paymob', ?, 400, 'EGP', 'pending', ?, 1, NOW() - INTERVAL 10 MINUTE, NOW() - INTERVAL 10 MINUTE)`,
      [userId, prepareId, intentionOrderId,
       JSON.stringify({
         id: intentionId,
         intention_order_id: Number(intentionOrderId),
         amount: 40000,
         special_reference: `booking_prepare_${prepareId}_1788563800000`,
         currency: 'EGP',
       })],
    );
    const paymentId = (res as any).insertId;
    // Simulate the relink done by _createFromPrepare after booking creation.
    await pool.execute(
      `UPDATE payment_transactions SET booking_id = ?, reference_type = 'booking' WHERE id = ?`,
      [bookingId, paymentId],
    );
    return paymentId;
  }

  async function paymentStatus(paymentId: number): Promise<string> {
    const [rows] = await pool.execute<RowData>(`SELECT payment_status, gateway_reference FROM payment_transactions WHERE id = ?`, [paymentId]);
    return (rows as any[])[0]?.payment_status || '';
  }

  function webhookFor(realOrderId: string, txnId: string, merchantOrderId: string, success = true) {
    return {
      obj: {
        id: Number(txnId),
        success,
        pending: !success,
        order: { id: Number(realOrderId), merchant_order_id: merchantOrderId },
        amount_cents: 40000,
      },
    };
  }

  // Unique per-run ids so Redis replay-protection keys never collide across
  // test runs (replay keys are 24h TTL and would otherwise reject the webhook).
  const uid = () => Date.now().toString().slice(-10);

  it('1. webhook finds booking_prepare payment when intention order id != Accept order id, pays booking, emits booking:paid once', async () => {
    vi.spyOn(paymentGateway, 'verifyWebhook').mockResolvedValue(true as any);

    const bookingId = await insertBooking(9);
    const runId = uid();
    const prepareId = `corr-prep-${runId}`;
    const intentionOrderId = `7000010${runId.slice(0, 4)}`;
    const intentionId = `pi_test_corr_${runId}`;
    const realOrderId = `70000109${runId.slice(0, 3)}`; // DIFFERENT from intention order id
    const txnId = `90000109${runId.slice(0, 3)}`;
    const merchantOrderId = `booking_prepare_${prepareId}_1788563800000`;
    const paymentId = await insertPreparePayment(bookingId, prepareId, intentionOrderId, intentionId);

    const { paymentService } = await import('../application/payment.service.js');
    const emitSpy = vi.spyOn(eventBusV2, 'emit');

    await paymentService.handleWebhook(webhookFor(realOrderId, txnId, merchantOrderId), 'sig');
    await sleep(500);

    expect(await paymentStatus(paymentId)).toBe('paid');

    // Real order id persisted onto the row so webhook/sync/expiry resolve it.
    const [ptRows] = await pool.execute<RowData>(`SELECT gateway_reference FROM payment_transactions WHERE id = ?`, [paymentId]);
    expect(String((ptRows as any[])[0].gateway_reference)).toBe(realOrderId);

    // Booking confirmed + paid (payment:succeeded → booking-payment listener → booking:paid).
    const [bkRows] = await pool.execute<RowData>(`SELECT booking_status, payment_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((bkRows as any[])[0].booking_status).toBe('confirmed');
    expect((bkRows as any[])[0].payment_status).toBe('paid');

    // booking:paid emitted EXACTLY once.
    const paidCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid');
    expect(paidCalls.length).toBe(1);

    // accounting posted exactly once for the card payment.
    const [leRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_card_payment'`,
      [bookingId],
    );
    expect(Number((leRows as any[])[0].c)).toBe(3); // clearing + merchant payable + commission

    emitSpy.mockRestore();
  });

  it('2. re-delivered (duplicate) webhook is idempotent — no second booking:paid, no double accounting', async () => {
    vi.spyOn(paymentGateway, 'verifyWebhook').mockResolvedValue(true as any);

    const bookingId = await insertBooking(10);
    const runId = uid();
    const prepareId = `corr-prep2-${runId}`;
    const intentionOrderId = `7000020${runId.slice(0, 4)}`;
    const intentionId = `pi_test_corr2_${runId}`;
    const realOrderId = `70000209${runId.slice(0, 3)}`;
    const merchantOrderId = `booking_prepare_${prepareId}_1788563800000`;
    const paymentId = await insertPreparePayment(bookingId, prepareId, intentionOrderId, intentionId);

    const { paymentService } = await import('../application/payment.service.js');
    const emitSpy = vi.spyOn(eventBusV2, 'emit');

    const txnId = `90000209${runId.slice(0, 3)}`;
    await paymentService.handleWebhook(webhookFor(realOrderId, txnId, merchantOrderId), 'sig');
    await sleep(400);
    // Re-deliver same webhook (replay protection may skip; even without it the
    // payment is already FINAL → _processPaymentOutcome is idempotent).
    await paymentService.handleWebhook(webhookFor(realOrderId, txnId, merchantOrderId), 'sig');
    await sleep(400);

    const paidCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid');
    expect(paidCalls.length).toBe(1);

    const [leRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_card_payment'`,
      [bookingId],
    );
    expect(Number((leRows as any[])[0].c)).toBe(3);

    emitSpy.mockRestore();
  });

  it('3. correlation via stored intention_id/intention_order_id JSON when merchant_order_id is absent', async () => {
    vi.spyOn(paymentGateway, 'verifyWebhook').mockResolvedValue(true as any);

    const bookingId = await insertBooking(11);
    const runId = uid();
    const prepareId = `corr-prep3-${runId}`;
    const intentionOrderId = `7000030${runId.slice(0, 4)}`;
    const intentionId = `pi_test_corr3_${runId}`;
    const realOrderId = `70000309${runId.slice(0, 3)}`;
    const paymentId = await insertPreparePayment(bookingId, prepareId, intentionOrderId, intentionId);

    const { paymentService } = await import('../application/payment.service.js');
    // Webhook carries intention_id + intention_order_id but NO merchant_order_id.
    const payload = {
      obj: {
        id: Number(realOrderId),
        success: true,
        pending: false,
        intention_id: intentionId,
        intention_order_id: Number(intentionOrderId),
        order: { id: Number(realOrderId) },
        amount_cents: 40000,
      },
    };
    await paymentService.handleWebhook(payload, 'sig');
    await sleep(400);

    expect(await paymentStatus(paymentId)).toBe('paid');
    const [bkRows] = await pool.execute<RowData>(`SELECT booking_status, payment_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((bkRows as any[])[0].booking_status).toBe('confirmed');
  });

  it('4. expire_stale_payments does NOT expire a Paymob-paid transaction — it recovers it', async () => {
    const bookingId = await insertBooking(12);
    const runId = uid();
    const prepareId = `corr-prep4-${runId}`;
    const intentionOrderId = `7000040${runId.slice(0, 4)}`;
    const intentionId = `pi_test_corr4_${runId}`;
    const paymentId = await insertPreparePayment(bookingId, prepareId, intentionOrderId, intentionId);

    // Paymob confirms PAID for the stored (intention) order id.
    vi.spyOn(paymentGateway, 'getTransactionStatus').mockResolvedValue({
      success: true, transactionId: '900004099', gatewayReference: intentionOrderId, status: 'paid', rawResponse: { paid: true },
    } as any);

    const { paymentService } = await import('../application/payment.service.js');
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    const result = await paymentService.expireStalePayments(0);

    expect(result.recovered).toBeGreaterThanOrEqual(1);
    await sleep(500);
    expect(await paymentStatus(paymentId)).toBe('paid');
    const [bkRows] = await pool.execute<RowData>(`SELECT booking_status, payment_status, aggregate_version FROM bookings WHERE id = ?`, [bookingId]);
    expect((bkRows as any[])[0].booking_status).toBe('confirmed');
    expect((bkRows as any[])[0].payment_status).toBe('paid');
    const paidCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid');
    expect(paidCalls.length).toBe(1);
    emitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('5. normal unpaid transaction (Paymob confirms failed) still expires', async () => {
    const bookingId = await insertBooking(13);
    const runId = uid();
    const prepareId = `corr-prep5-${runId}`;
    const intentionOrderId = `7000050${runId.slice(0, 4)}`;
    const intentionId = `pi_test_corr5_${runId}`;
    const paymentId = await insertPreparePayment(bookingId, prepareId, intentionOrderId, intentionId);

    vi.spyOn(paymentGateway, 'getTransactionStatus').mockResolvedValue({
      success: false, transactionId: '', gatewayReference: intentionOrderId, status: 'failed', rawResponse: {},
    } as any);

    const { paymentService } = await import('../application/payment.service.js');
    const result = await paymentService.expireStalePayments(0);

    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(await paymentStatus(paymentId)).toBe('expired');
    vi.restoreAllMocks();
  });

  it('6. expire_stale_payments SKIPS payments when Paymob is pending/unknown (no race-cancel)', async () => {
    const bookingId = await insertBooking(14);
    const runId = uid();
    const prepareId = `corr-prep6-${runId}`;
    const intentionOrderId = `7000060${runId.slice(0, 4)}`;
    const intentionId = `pi_test_corr6_${runId}`;
    const paymentId = await insertPreparePayment(bookingId, prepareId, intentionOrderId, intentionId);

    vi.spyOn(paymentGateway, 'getTransactionStatus').mockResolvedValue({
      success: false, transactionId: '', gatewayReference: intentionOrderId, status: 'pending', rawResponse: {},
    } as any);

    const { paymentService } = await import('../application/payment.service.js');
    const result = await paymentService.expireStalePayments(0);

    expect(result.expired).toBe(0);
    expect(await paymentStatus(paymentId)).toBe('pending');
    vi.restoreAllMocks();
  });
});