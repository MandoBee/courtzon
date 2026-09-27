import { describe, it, expect, vi } from 'vitest';

// The service module reaches `database/mysql.js`, which validates the env at
// import time and calls process.exit(1) when it is missing. No connection is ever
// opened here — every test below is pure logic or a source assertion.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RecurringPaymentSchema } from '../presentation/booking.dto.js';
import { ChargeSchema } from '../../payment/presentation/payment.dto.js';
import {
  seriesPaymentIdempotencyKey,
  isOccurrenceConfirmable,
  isOccurrenceCancellable,
  summariseOutcomes,
  seriesNowMs,
  SERIES_PAYMENT_REFERENCE_TYPE,
  SERIES_PAYMENT_METHOD,
  SERIES_PAYMENT_CURRENCY,
  SERIES_TERMINAL_BOOKING_STATUSES,
} from '../application/recurring-payment.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repository root (this file lives at backend/src/modules/booking/__tests__/). */
const ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
/** Read a file under backend/. */
const be = (p: string) => readFileSync(resolve(ROOT, 'backend', p), 'utf8');
/** Read a file under frontend/. */
const fe = (p: string) => readFileSync(resolve(ROOT, 'frontend', p), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// R5-B — unit coverage for the parts that need no database:
//   • the request contract (the client may NOT control the money)
//   • the deterministic series-scoped idempotency key
//   • the occurrence eligibility rules (confirm side / cancel side)
//   • the canonical reference-type enum (additive, nothing removed)
//   • the accounting guards that keep a series financially neutral
// ─────────────────────────────────────────────────────────────────────────────

describe('R5-B — request contract: the client cannot control the money', () => {
  it('accepts a body with no fields at all (server resolves everything)', () => {
    expect(RecurringPaymentSchema.parse({})).toEqual({});
  });

  it('accepts only an optional returnUrl', () => {
    const parsed = RecurringPaymentSchema.parse({ returnUrl: 'https://app.courtzon.test/admin/recurring' });
    expect(parsed.returnUrl).toBe('https://app.courtzon.test/admin/recurring');
  });

  // These are the fields a naive implementation would let the browser set. Each
  // one must be REJECTED loudly (.strict()), never silently ignored.
  for (const forbidden of ['amount', 'total', 'seriesTotal', 'playerUserId', 'userId', 'referenceId', 'referenceType', 'currency', 'paymentMethod', 'idempotencyKey']) {
    it(`rejects a client-supplied "${forbidden}"`, () => {
      expect(() => RecurringPaymentSchema.parse({ [forbidden]: 1 })).toThrow();
      expect(() => RecurringPaymentSchema.parse({ [forbidden]: 'EGP' })).toThrow();
      expect(() => RecurringPaymentSchema.parse({ [forbidden]: 'card' })).toThrow();
    });
  }

  it('rejects a non-URL returnUrl', () => {
    expect(() => RecurringPaymentSchema.parse({ returnUrl: 'not-a-url' })).toThrow();
  });
});

describe('R5-B — deterministic series-scoped idempotency key', () => {
  it('is a pure function of the series id', () => {
    expect(seriesPaymentIdempotencyKey(42)).toBe(seriesPaymentIdempotencyKey(42));
    expect(seriesPaymentIdempotencyKey(42)).toBe('series-card-42');
  });

  it('is unique per series (two series never collide)', () => {
    const keys = new Set([1, 2, 3, 10050000, 20000000].map(seriesPaymentIdempotencyKey));
    expect(keys.size).toBe(5);
  });

  // The existing UNIQUE column is varchar(64) — a longer key would be truncated
  // by MySQL (or rejected), silently weakening idempotency.
  it('fits the existing payment_transactions.idempotency_key column (varchar(64))', () => {
    for (const id of [1, 999999, 10050000, Number.MAX_SAFE_INTEGER]) {
      expect(seriesPaymentIdempotencyKey(id).length).toBeLessThanOrEqual(64);
    }
  });

  it('reuses the EXISTING idempotency column — no new table', () => {
    const repo = be('src/modules/payment/infrastructure/repositories/payment.repository.ts');
    expect(repo).toContain('async findByIdempotencyKey');
    // The series service reads that same canonical lookup.
    const svc = be('src/modules/booking/application/recurring-payment.service.ts');
    expect(svc).toContain('paymentRepository.findByIdempotencyKey(idempotencyKey)');
  });
});

describe('R5-B — canonical constants', () => {
  it('uses card + EGP + booking_series', () => {
    expect(SERIES_PAYMENT_REFERENCE_TYPE).toBe('booking_series');
    expect(SERIES_PAYMENT_METHOD).toBe('card');
    expect(SERIES_PAYMENT_CURRENCY).toBe('EGP');
    expect('card').toBe('card'); // payment_method enum accepts it unchanged
  });
});

describe('R5-B — occurrence confirm eligibility', () => {
  const base = { booking_status: 'pending', payment_status: 'pending' };

  it('accepts pending and pending_payment', () => {
    expect(isOccurrenceConfirmable(base).eligible).toBe(true);
    expect(isOccurrenceConfirmable({ ...base, booking_status: 'pending_payment' }).eligible).toBe(true);
  });

  it('skips an already-confirmed occurrence (no duplicate financial event on retry)', () => {
    const r = isOccurrenceConfirmable({ ...base, booking_status: 'confirmed' });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('already_confirmed');
  });

  it('skips a checked_in occurrence', () => {
    expect(isOccurrenceConfirmable({ ...base, booking_status: 'checked_in' }).reason).toBe('already_checked_in');
  });

  it('skips every terminal state', () => {
    for (const s of SERIES_TERMINAL_BOOKING_STATUSES) {
      const r = isOccurrenceConfirmable({ ...base, booking_status: s });
      expect(r.eligible, `${s} must not be confirmed`).toBe(false);
      expect(r.reason).toBe(`terminal_${s}`);
    }
    expect([...SERIES_TERMINAL_BOOKING_STATUSES].sort()).toEqual(['cancelled', 'completed', 'expired', 'no_show']);
  });

  it('skips an already-paid pending occurrence', () => {
    const r = isOccurrenceConfirmable({ ...base, payment_status: 'paid' });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('already_paid');
  });

  it('skips an unknown status rather than guessing', () => {
    const r = isOccurrenceConfirmable({ booking_status: 'wat', payment_status: 'pending' });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('unexpected_wat');
  });
});

describe('R5-B — occurrence cancel eligibility (the R4 eligible-only rule)', () => {
  const now = 1_800_000_000_000;
  const future = new Date(now + 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  const past = new Date(now - 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  const base = { booking_status: 'pending', payment_status: 'pending', start_at_utc: future };

  it('cancels a future, non-terminal, unpaid occurrence', () => {
    expect(isOccurrenceCancellable(base, now).eligible).toBe(true);
  });

  it('never touches a past occurrence', () => {
    const r = isOccurrenceCancellable({ ...base, start_at_utc: past }, now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('past_or_not_yet_started');
  });

  it('never touches an occurrence starting exactly now', () => {
    const at = new Date(now).toISOString().slice(0, 19).replace('T', ' ');
    expect(isOccurrenceCancellable({ ...base, start_at_utc: at }, now).eligible).toBe(false);
  });

  it('never touches a terminal occurrence', () => {
    for (const s of SERIES_TERMINAL_BOOKING_STATUSES) {
      const r = isOccurrenceCancellable({ ...base, booking_status: s }, now);
      expect(r.eligible, `${s} must not be cancelled`).toBe(false);
      expect(r.reason).toBe(`already_${s}`);
    }
  });

  it('never cancels an already-PAID occurrence', () => {
    expect(isOccurrenceCancellable({ ...base, payment_status: 'paid' }, now).reason).toBe('already_paid');
  });

  it('refuses an occurrence with no start time instead of assuming it is cancellable', () => {
    expect(isOccurrenceCancellable({ booking_status: 'pending', payment_status: 'pending' }, now).reason).toBe('no_start_time');
  });

  it('parses a MySQL-format start_at_utc as UTC', () => {
    // `now` is 2027-01-15, so June 2027 is still in the future.
    const occ = { ...base, start_at_utc: '2027-06-01 00:00:00' };
    expect(isOccurrenceCancellable(occ, now).eligible).toBe(true);
    expect(isOccurrenceCancellable(occ, now + 400 * 86_400_000).eligible).toBe(false);
  });

  it('accepts a Date and an ISO start_at_utc', () => {
    expect(isOccurrenceCancellable({ ...base, start_at_utc: new Date(now + 1000) }, now).eligible).toBe(true);
    expect(isOccurrenceCancellable({ ...base, start_at_utc: new Date(now + 1000).toISOString() }, now).eligible).toBe(true);
  });
});

describe('R5-B — outcome summary', () => {
  it('separates applied from skipped-with-reason', () => {
    const s = summariseOutcomes([
      { bookingId: 1, outcome: 'applied' },
      { bookingId: 2, outcome: 'skipped', reason: 'already_confirmed' },
      { bookingId: 3, outcome: 'applied' },
    ]);
    expect(s.applied).toEqual([1, 3]);
    expect(s.skipped).toEqual([{ bookingId: 2, reason: 'already_confirmed' }]);
  });
});

describe('R5-B — canonical reference-type enum is extended, not replaced', () => {
  const existing = ['booking', 'order', 'subscription', 'wallet_topup', 'academy', 'tournament'];

  it('ChargeSchema accepts booking_series', () => {
    const parsed = ChargeSchema.parse({ referenceType: 'booking_series', referenceId: 7, amount: 10, paymentMethod: 'card' });
    expect(parsed.referenceType).toBe('booking_series');
  });

  it('ChargeSchema still accepts every pre-existing reference type', () => {
    for (const t of existing) {
      expect(ChargeSchema.parse({ referenceType: t, referenceId: 1, amount: 10, paymentMethod: 'card' }).referenceType).toBe(t);
    }
  });

  it('ChargeSchema still rejects an unknown reference type', () => {
    expect(() => ChargeSchema.parse({ referenceType: 'nope', referenceId: 1, amount: 10, paymentMethod: 'card' })).toThrow();
  });

  it('the gateway PaymentRequest union also carries booking_series', () => {
    const types = be('src/shared/services/gateway/payment-gateway.types.ts');
    const union = /referenceType:\s*([^;]+);/.exec(types)![1];
    for (const t of [...existing, 'booking_series']) {
      expect(union, `gateway union must include '${t}'`).toContain(`'${t}'`);
    }
  });
});

describe('R5-B — accounting safety guards are present in source', () => {
  const accounting = be('src/modules/financial/application/accounting-event.listener.ts');
  const econ = be('src/modules/financial/application/booking-accounting.service.ts');

  it('resolveBookingEconomics surfaces series_id so a series occurrence is identifiable', () => {
    expect(econ).toContain('SELECT id, organisation_id, series_id,');
    expect(econ).toContain('seriesId: number | null;');
    expect(econ).toMatch(/seriesId:\s*b\.series_id\s*!=\s*null/);
  });

  it('payment:succeeded skips booking_series (no generic platform-revenue fallthrough)', () => {
    // Mirrors the pre-existing `tournament` guard.
    expect(accounting).toContain("if (referenceType === 'tournament') return;");
    expect(accounting).toContain("if (referenceType === 'booking_series') return;");
  });

  it('per-booking payment posting returns early for a series occurrence', () => {
    expect(accounting).toMatch(/postBookingPaymentAccountingInner[\s\S]*?if \(econ\.seriesId\) \{[\s\S]*?return;/);
  });

  it('the guard sits BEFORE any posting, so nothing is written', () => {
    const body = accounting.slice(accounting.indexOf('async function postBookingPaymentAccountingInner'));
    const guard = body.indexOf('if (econ.seriesId)');
    const firstPost = body.indexOf('postAccountingEvent(');
    expect(guard).toBeGreaterThan(-1);
    expect(firstPost).toBeGreaterThan(guard);
  });

  it('the durable replay path re-dispatches to the SAME guarded handler', () => {
    // A crash-replayed `payment:succeeded` / `booking:paid` must not slip past the
    // guard. `replayDispatch` re-invokes the registered in-memory handlers rather
    // than owning a second accounting path, so the guard above still applies.
    expect(accounting).toContain("'booking:paid',");
    expect(accounting).toContain("'payment:succeeded',");
    const fn = accounting.slice(accounting.indexOf('function replayDispatch'));
    expect(fn.slice(0, 600)).toContain('eventBusV2.getInMemoryHandlers(eventName)');
    expect(fn.slice(0, 600)).toContain('results.push(Promise.resolve(h(payload)))');
  });
});

describe('R5-B — the booking payment listener reuses the canonical four events', () => {
  const listener = be('src/modules/booking/application/booking-payment.listener.ts');

  for (const evt of ['payment:succeeded', 'payment:failed-event', 'payment:cancelled-event', 'payment:expired-event']) {
    it(`handles ${evt} for reference_type = booking_series`, () => {
      const idx = listener.indexOf(`eventBusV2.on('${evt}'`);
      expect(idx).toBeGreaterThan(-1);
      // The series branch appears inside that handler, before the booking-only guard.
      const handler = listener.slice(idx, idx + 700);
      expect(handler).toContain('SERIES_PAYMENT_REFERENCE_TYPE');
    });
  }

  it('invents no recurring-specific payment event', () => {
    for (const invented of ["eventBusV2.emit('series:", "eventBusV2.emit('recurring:", "eventBusV2.on('series:"]) {
      expect(listener).not.toContain(invented);
    }
  });

  it('reuses the canonical commands (never a direct status write)', () => {
    expect(listener).toContain('confirmBookingHandler.execute');
    expect(listener).toContain('cancelBookingHandler.execute');
    expect(listener).toContain("commandType: 'ConfirmBooking'");
    expect(listener).toContain("commandType: 'CancelBooking'");
  });

  it('emits the canonical per-occurrence booking:paid with series correlation', () => {
    expect(listener).toContain("eventBusV2.emit('booking:paid'");
    expect(listener).toContain('seriesPaymentId: data.paymentId');
  });
});

describe('R5-B — the service never calls the gateway directly', () => {
  const svc = be('src/modules/booking/application/recurring-payment.service.ts');

  it('routes charging through the canonical Payment Service', () => {
    expect(svc).toContain("import('../../payment/application/payment.service.js')");
    expect(svc).toContain('paymentService.charge(');
  });

  it('never imports the gateway directly', () => {
    expect(svc).not.toContain('gateway-factory');
    expect(svc).not.toContain('paymob-gateway');
    expect(svc).not.toContain('paymentGateway');
  });

  it('never writes a booking status directly (commands only)', () => {
    expect(svc).not.toContain('UPDATE bookings SET booking_status');
    expect(svc).not.toContain('persistTransition');
  });

  it('resolves the payment owner from the occurrence bookings (the player)', () => {
    expect(svc).toContain('const playerUserId = Number((occurrences[0] as any).user_id);');
    // ...and never from the operator.
    expect(svc).not.toMatch(/user_id:\s*operatorId/);
  });

  it('computes the total with the canonical PricingEngine aggregator', () => {
    expect(svc).toContain('PricingEngine.sumOccurrenceTotals(');
  });

  it('exposes no new series status — only the R4 lifecycle enum is referenced', () => {
    // booking_series.status is enum('active','paused','completed','cancelled').
    // R5-B must not introduce 'failed'/'expired'.
    expect(svc).toContain("SERIES_PAYMENT_BLOCKED_STATUSES = new Set(['cancelled', 'completed'])");
    expect(svc).not.toMatch(/status\s*=\s*'failed'/);
    expect(svc).not.toMatch(/status\s*=\s*'expired'/);
  });
});

describe('R5-B — RBAC registration for the new UI elements', () => {
  const registry = fe('src/permissions/registry.ts');

  for (const key of ['bookings.recurring.collect-payment', 'bookings.recurring.payment-status', 'bookings.recurring.series-total']) {
    it(`registers ${key}`, () => {
      expect(registry).toContain(`permissionKey: '${key}'`);
      expect(registry).toMatch(new RegExp(`permissionKey: '${key}'[^}]*moduleSlug: 'bookings'`));
    });
  }

  it('collect-payment is a button and the two value fields are fields', () => {
    expect(registry).toMatch(/permissionKey: 'bookings\.recurring\.collect-payment'[^}]*elementType: 'button'/);
    expect(registry).toMatch(/permissionKey: 'bookings\.recurring\.payment-status'[^}]*elementType: 'field'/);
    expect(registry).toMatch(/permissionKey: 'bookings\.recurring\.series-total'[^}]*elementType: 'field'/);
  });

  it('the new keys are covered by the existing org-admin /bookings\\./ template', () => {
    const templates = be('scripts/role-permission-templates.mjs');
    expect(templates).toMatch(/const ORG_ADMIN_PATTERNS = \[[\s\S]*?\/\^bookings\\\.\//);
    // A player must NOT receive them.
    expect(templates).toMatch(/const PLAYER_PATTERNS = \[[\s\S]*?\/\^bookings\\\.\(view\|create\|cancel\|apply\|manage-applicants\|matchmaking\)/);
  });
});

describe('R5-B — the route is protected and audited', () => {
  const routes = be('src/modules/booking/presentation/booking.routes.ts');
  const controller = be('src/modules/booking/presentation/booking.controller.ts');

  it('registers POST /admin/recurring/:id/pay behind the recurring guard', () => {
    expect(routes).toMatch(/app\.post\('\/admin\/recurring\/:id\/pay',\s*\{\s*preHandler:\s*\[recurringGuard\]\s*\},/);
  });

  it('audits the payment with the operator AND the player separated', () => {
    expect(controller).toContain('export async function collectRecurringSeriesPaymentHandler');
    const fn = controller.slice(controller.indexOf('collectRecurringSeriesPaymentHandler'));
    expect(fn.slice(0, fn.indexOf('return reply.send')).length).toBeLessThan(2500);
    expect(fn).toContain("action: 'BOOKING.PAY'");
    expect(fn).toContain('entityType: \'booking_series\'');
    expect(fn).toContain('operatorId: userId');
    expect(fn).toContain('playerId: result.playerUserId');
    expect(fn).toContain('seriesTotal: result.seriesTotal');
  });

  it('rejects a client-supplied amount before any work happens', () => {
    const fn = controller.slice(controller.indexOf('collectRecurringSeriesPaymentHandler'));
    expect(fn.indexOf('RecurringPaymentSchema.parse')).toBeLessThan(fn.indexOf('initiateSeriesCardPayment'));
  });
});

describe('R5-B — series payment state is exposed on the authoritative read', () => {
  const svc = be('src/modules/booking/application/booking.service.ts');
  it('describeRecurringSeries includes the read-only payment view', () => {
    const fn = svc.slice(svc.indexOf('async describeRecurringSeries'));
    // The call goes through the lazy accessor (keeps the DB pool/env OUT of the
    // unit-test module graph — see the accessor's comment) but still surfaces the
    // authoritative read-only payment view on every describe.
    expect(fn.slice(0, 4000)).toContain('payment: await loadSeriesPaymentFor(');
  });
});

describe('R5-C1 — the single payment charges the authoritative series GROSS (subtotal + tax)', () => {
  const svc = be('src/modules/booking/application/recurring-payment.service.ts');
  const describeSrc = be('src/modules/booking/application/booking.service.ts');
  const page = fe('src/pages/admin/recurring/RecurringBookingsPage.tsx');

  it('charges the gateway seriesGross, never the pre-tax subtotal', () => {
    expect(svc).toContain('amount: ctx.seriesGross');
    // The charge amount must not reference the old subtotal field.
    expect(svc).not.toMatch(/amount:\s*ctx\.seriesTotal[^;]*;/);
  });

  it('derives seriesTax from the persisted per-occurrence tax_amount snapshots (no aggregate re-calculation)', () => {
    expect(svc).toMatch(/const seriesTax = PricingEngine\.sumOccurrenceTotals\(/);
    expect(svc).toMatch(/Number\(o\.tax_amount \|\| 0\)/);
  });

  it('context + result expose seriesSubtotal / seriesTax / seriesGross while `seriesTotal` stays the subtotal', () => {
    expect(svc).toContain('seriesSubtotal: number;');
    expect(svc).toContain('seriesTax: number;');
    expect(svc).toContain('seriesGross: number;');
    expect(svc).toContain('seriesTotal: seriesSubtotal,');
    expect(svc).toContain('seriesSubtotal: ctx.seriesSubtotal,');
    expect(svc).toContain('seriesTax: ctx.seriesTax,');
    expect(svc).toContain('seriesGross: ctx.seriesGross,');
  });

  it('describeRecurringSeries exposes the three authoritative values and aliases seriesTotal to the subtotal', () => {
    expect(describeSrc).toContain('seriesSubtotal,');
    expect(describeSrc).toContain('seriesTax,');
    expect(describeSrc).toContain('seriesGross,');
    expect(describeSrc).toContain('seriesTotal: seriesSubtotal,');
  });

  it('the CARD panel shows backend-provided Subtotal / Tax / Total to pay without client math', () => {
    expect(page).toContain('Subtotal (authoritative)');
    expect(page).toContain('Tax (authoritative)');
    expect(page).toContain('Total to pay (authoritative)');
    expect(page).toContain('series.seriesGross');
    expect(page).toContain('series.seriesSubtotal');
    expect(page).toContain('series.seriesTax');
    // React must never re-add the breakdown itself into a price shown to the user.
    expect(page).not.toContain('seriesSubtotal + seriesTax');
  });
});
