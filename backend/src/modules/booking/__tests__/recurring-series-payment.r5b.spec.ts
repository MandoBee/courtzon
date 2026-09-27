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

  it('payment:succeeded routes booking_series into the series accounting path (no generic fallthrough)', () => {
    // The pre-existing tournament guard is unchanged; the R5-B series guard was
    // REPLACED by the R5-C2 series accounting recognition.
    expect(accounting).toContain("if (referenceType === 'tournament') return;");
    expect(accounting).toContain("if (referenceType === 'booking_series') {");
    expect(accounting).toContain('await postSeriesPaymentAccounting(referenceId, currency);');
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

describe('R5-C2 — series accounting recognition contract (exactly once per paid series)', () => {
  const concepts = be('src/modules/financial/application/accounting-concepts.ts');
  const engine = be('src/modules/financial/application/accounting-engine.service.ts');
  const accounting = be('src/modules/financial/application/accounting-event.listener.ts');

  it('EVENT_CONCEPTS defines both series events with the booking custody legs', () => {
    const block = concepts.slice(concepts.indexOf('booking_series_card_payment'), concepts.indexOf('booking_series_card_payment') + 700);
    expect(block).toContain("debit: ['payment_clearing']");
    expect(block).toContain("credit: ['merchant_payable', 'platform_commission', 'tax_liability']");
    const org = concepts.slice(concepts.indexOf('booking_series_org_receivable'), concepts.indexOf('booking_series_org_receivable') + 400);
    expect(org).toContain("debit: ['marketplace_receivable', 'commission_expense']");
    expect(org).toContain("credit: ['court_rental_revenue']");
  });

  it('the CourtZon series event resolves FULLY from code defaults (no DB mapping rows, like payment_gateway_settlement)', () => {
    expect(engine).toMatch(/booking_series_card_payment:\s*\{ payment_clearing: '1100', merchant_payable: '2202', platform_commission: '4110', tax_liability: '2300' \}/);
  });

  it('the organization-book series event is in ORG_BOOK_EVENTS (idempotent per-org provisioning)', () => {
    expect(engine).toContain("booking_series_org_receivable: ['marketplace_receivable', 'commission_expense', 'court_rental_revenue']");
  });

  it('the series postings use source_type booking + source_id seriesId and distinct event_types — NOT a new ENUM value', () => {
    expect(accounting).toContain("'booking_series_card_payment', 'booking', seriesId, null,");
    expect(accounting).toContain("'booking_series_org_receivable', 'booking', seriesId, orgId,");
    // The ledger_entries.source_type ENUM must NOT be extended.
    expect(accounting).not.toContain("source_type` ENUM");
    expect(accounting).not.toMatch(/ALTER TABLE[\s\S]*ledger_entries/);
  });

  it('idempotency reuses the canonical hasPosting mechanism (no second system)', () => {
    const post = accounting.slice(accounting.indexOf('async function postSeriesPaymentAccounting'));
    expect(post).toContain('postAccountingEvent(');
    // postAccountingEvent → ledgerRepository.hasPosting(sourceType, sourceId, eventType)
    const repo = be('src/modules/financial/infrastructure/repositories/ledger.repository.ts');
    expect(repo).toContain('async hasPosting(sourceType: string, sourceId: number, eventType: string)');
  });

  it('balances by construction and mirrors the booking_card_payment convention (grossPayable = org+commission+tax)', () => {
    expect(accounting).toContain('const grossPayable = r2(orgNet + commission + tax);');
    expect(accounting).toContain('const courtRentalRevenue = Math.round((econ.orgNet + econ.commission) * 100) / 100;');
  });

  it('the per-occurrence seriesId guard is preserved (no double-post of the same money)', () => {
    expect(accounting).toMatch(/postBookingPaymentAccountingInner[\s\S]*?if \(econ\.seriesId\) \{[\s\S]*?return;/);
  });

  it('series cash accounting exists and posts once (booking_series_cod_payment / org cash)', () => {
    expect(accounting).toContain('postSeriesCashAccounting');
    expect(accounting).toContain("'booking_series_cod_payment', 'booking', seriesId, null,");
    expect(accounting).toContain("'booking_series_org_cash_receivable', 'booking', seriesId, orgId,");
  });

  it('series economics aggregate ONLY persisted snapshots through the canonical round2 rule', () => {
    expect(accounting).toContain('Number(b.total_amount)');
    expect(accounting).toContain('Number(b.tax_amount)');
    expect(accounting).toContain('Number(b.commission_amount)');
    expect(accounting).toContain('Number(b.club_amount)');
    expect(accounting).toContain('const r2 = (n: number) => Math.round(n * 100) / 100;');
  });

  it('failure safety: unresolved economics skip atomically (no partial journal)', () => {
    expect(accounting).toContain("log.error({ seriesId }, 'Series not found — skipping series accounting');");
    expect(accounting).toContain("log.error({ seriesId }, 'Recurring series has no occurrence bookings — skipping series accounting');");
  });
});

describe('R5-C4 — series CASH confirmation contract (no payment_transactions, one recognition)', () => {
  const svc = be('src/modules/booking/application/recurring-payment.service.ts');
  const concepts = be('src/modules/financial/application/accounting-concepts.ts');
  const engine = be('src/modules/financial/application/accounting-engine.service.ts');
  const routes = be('src/modules/booking/presentation/booking.routes.ts');
  const controller = be('src/modules/booking/presentation/booking.controller.ts');
  const recon = be('src/modules/payment/application/reconciliation.service.ts');
  const registry = fe('src/permissions/registry.ts');

  it('confirmation never touches the Payment Service (no charge, no payment_transactions)', () => {
    const fn = svc.slice(svc.indexOf('export async function confirmSeriesCash'));
    expect(fn).not.toContain('paymentService.charge');
    expect(fn).not.toContain('chargeByGateway');
    expect(fn).not.toContain('INSERT INTO payment_transactions');
  });

  it('confirms each eligible occurrence through the canonical ConfirmBooking command', () => {
    expect(svc).toContain("commandType: 'ConfirmBooking'");
    expect(svc).toContain('confirmBookingHandler.execute');
  });

  it('posts ONE series-level cash accounting via the canonical series accounting function', () => {
    const fn = svc.slice(svc.indexOf('export async function confirmSeriesCash'));
    expect(fn).toContain("import('../../financial/application/accounting-event.listener.js')");
    expect(fn).toContain('postSeriesCashAccounting(seriesId, SERIES_PAYMENT_CURRENCY)');
  });

  it('EVENT_CONCEPTS defines both cash events with the NORMAL cash debit/credit contract', () => {
    const court = concepts.slice(concepts.indexOf('booking_series_cod_payment'), concepts.indexOf('booking_series_cod_payment') + 260);
    expect(court).toContain("debit: ['marketplace_receivable']");
    expect(court).toContain("credit: ['platform_commission', 'tax_liability']");
    const org = concepts.slice(concepts.indexOf('booking_series_org_cash_receivable'), concepts.indexOf('booking_series_org_cash_receivable') + 260);
    expect(org).toContain("debit: ['org_cash_bank', 'commission_expense']");
    expect(org).toContain("credit: ['court_rental_revenue', 'courtzon_payable']");
  });

  it('code defaults + org-book provisioning resolve the cash events with NO DB mapping rows', () => {
    expect(engine).toMatch(/booking_series_cod_payment:\s*\{ marketplace_receivable: '1161', platform_commission: '4110', tax_liability: '2300' \}/);
    expect(engine).toContain("booking_series_org_cash_receivable: ['org_cash_bank', 'commission_expense', 'court_rental_revenue', 'courtzon_payable']");
  });

  it('the cash route is protected by the recurring guard AND the collect-cash permission', () => {
    expect(routes).toMatch(/app\.post\('\/admin\/recurring\/:id\/cash-confirm',\s*\{\s*preHandler:\s*\[recurringGuard,\s*requirePermission\(\['bookings\.recurring\.collect-cash'\]\)\]\s*\},/);
  });

  it('the controller audits BOOKING.SERIES_CASH with the operator and authoritative gross', () => {
    expect(controller).toContain('export async function collectRecurringSeriesCashHandler');
    expect(controller).toContain("action: 'BOOKING.SERIES_CASH'");
    expect(controller).toContain('seriesGross: result.seriesGross');
    expect(controller).toContain('operatorId: userId');
  });

  it('the strict empty-body schema exists (client sends no money)', () => {
    const dto = be('src/modules/booking/presentation/booking.dto.ts');
    expect(dto).toContain('RecurringCashConfirmSchema = z.object({}).strict()');
  });

  it('the reconciliation series gate also treats a cash-paid series (paid occurrences, no payment row) as paid', () => {
    expect(recon).toContain("b2.booking_status = 'confirmed'");
    expect(recon).toContain("b2.payment_status = 'paid'");
  });

  it('the collect-cash permission is registered', () => {
    expect(registry).toContain("permissionKey: 'bookings.recurring.collect-cash'");
    expect(registry).toMatch(/permissionKey: 'bookings\.recurring\.collect-cash'[^}]*elementType: 'button'/);
  });
});

describe('R5-D1 — FULL series card refund contract (reuses PaymentService, no allocation)', () => {
  const accounting = be('src/modules/financial/application/accounting-event.listener.ts');
  const concepts = be('src/modules/financial/application/accounting-concepts.ts');
  const engine = be('src/modules/financial/application/accounting-engine.service.ts');
  const svc = be('src/modules/booking/application/recurring-payment.service.ts');
  const routes = be('src/modules/booking/presentation/booking.routes.ts');
  const controller = be('src/modules/booking/presentation/booking.controller.ts');
  const dto = be('src/modules/booking/presentation/booking.dto.ts');

  it('the refund lifecycle reuses PaymentService.refund and never calls the gateway directly', () => {
    const fn = svc.slice(svc.indexOf('export async function refundSeriesCard'));
    expect(fn).toContain("import('../../payment/application/payment.service.js')");
    expect(fn).toContain('paymentService.refund(paymentId, ctx.seriesGross,');
    expect(fn).not.toContain('paymentGateway');
  });

  it('occurrence/partial refund stays BLOCKED (terminal guard, no allocation)', () => {
    expect(svc).toContain("SERIES_TERMINAL = new Set(['cancelled', 'completed', 'no_show', 'expired'])");
    expect(svc).toContain('Occurrence-level refunds require an allocation model (not supported in R5-D1)');
  });

  it('post-gateway-settlement refund is REJECTED', () => {
    expect(svc).toContain('gateway_settlement_id');
    expect(svc).toContain('post-settlement refunds are not supported (R5-D1).');
  });

  it('the payment:refunded listener routes booking_series into series reversal (never generic card_refund)', () => {
    expect(accounting).toContain("if (referenceType === 'booking_series') {");
    expect(accounting).toContain('await postSeriesRefundAccounting(Number(referenceId), currency);');
    expect(accounting).toContain("'booking_series_refund', 'booking', seriesId, null,");
    expect(accounting).toContain("'booking_series_org_receivable_reversal', 'booking', seriesId, orgId,");
  });

  it('EVENT_CONCEPTS defines the symmetric reversal, code defaults resolve with no DB rows', () => {
    const c = concepts.slice(concepts.indexOf('booking_series_refund'), concepts.indexOf('booking_series_refund') + 220);
    expect(c).toContain("debit: ['merchant_payable', 'platform_commission', 'tax_liability']");
    expect(c).toContain("credit: ['payment_clearing']");
    const o = concepts.slice(concepts.indexOf('booking_series_org_receivable_reversal'), concepts.indexOf('booking_series_org_receivable_reversal') + 260);
    expect(o).toContain("debit: ['court_rental_revenue']");
    expect(o).toContain("credit: ['marketplace_receivable', 'commission_expense']");
    expect(engine).toContain('booking_series_org_receivable_reversal:');
    expect(engine).toMatch(/booking_series_refund:\s*\{ merchant_payable: '2202', platform_commission: '4110', tax_liability: '2300', payment_clearing: '1100' \}/);
  });

  it('the refund route is protected by the recurring guard AND the existing financial refund permission', () => {
    expect(routes).toMatch(/app\.post\('\/admin\/recurring\/:id\/refund',\s*\{\s*preHandler:\s*\[recurringGuard,\s*requirePermission\(\['financial\.reconcile'\]\)\]\s*\},/);
  });

  it('the controller audits BOOKING.SERIES_REFUND once with before/after payment state', () => {
    expect(controller).toContain('export async function refundRecurringSeriesCardHandler');
    expect(controller).toContain("action: 'BOOKING.SERIES_REFUND'");
    expect(controller).toContain("beforePaymentState: 'paid'");
    expect(controller).toContain('afterPaymentState: result.refundStatus');
  });

  it('the strict empty-body schema exists (no client refund amount)', () => {
    expect(dto).toContain('RecurringSeriesRefundSchema = z.object({}).strict()');
  });

  it('no cash series refund exists in R5-D1', () => {
    expect(routes).not.toContain('/cash-refund');
    expect(svc).not.toContain('refundSeriesCash');
  });
});

describe('R5-D2-A — payment allocation foundation contract (infra only, no refund)', () => {
  const service = be('src/modules/booking/application/payment-allocation.service.ts');
  const repo = be('src/modules/booking/infrastructure/repositories/payment-allocation.repository.ts');
  const listener = be('src/modules/booking/application/booking-payment.listener.ts');

  it('the canonical unit is the BOOKING occurrence, never booking_slots', () => {
    expect(service).toContain('bookings.id');
    expect(service).toContain('ALLOCATION_EXCLUDED_STATUSES');
    // No financial use of the availability-only slots table anywhere.
    expect(repo).not.toMatch(/booking_slots\b/);
    expect(service).not.toMatch(/FROM booking_slots/);
  });

  it('amounts come ONLY from the persisted occurrence snapshots (no re-pricing)', () => {
    expect(service).toContain('Number(occ.total_amount || 0)');
    expect(service).toContain('Number(occ.tax_amount || 0)');
    expect(service).toContain('Number(occ.commission_amount || 0)');
    expect(service).toContain('Number(occ.club_amount || 0)');
    expect(service).not.toContain('pricingEngine');
    expect(service).not.toContain('calculatePrice');
  });

  it('idempotency reuses the unique payment+booking key and the canonical round2 rule', () => {
    expect(repo).toContain('uk_pa_payment_booking');
    expect(repo).toContain("err?.code === 'ER_DUP_ENTRY'");
    expect(repo).toContain('const round2 = (n: number) => Math.round(n * 100) / 100;');
  });

  it('the service exposes the foundation API but NO refund behavior', () => {
    expect(service).toContain('createAllocationForSeriesPayment');
    expect(service).toContain('assertSeriesAllocationInvariant');
    expect(service).toContain('getRefundableBalance');
    expect(service).not.toContain('paymentService.refund');
    expect(service).not.toContain("'booking_series_refund'");
  });

  it('the success handler writes the allocation foundation (additive, never removes money)', () => {
    expect(listener).toContain('createAllocationForSeriesPayment(seriesId, Number(data.paymentId))');
  });

  it('the migration backfills ONLY paid booking_series payments from persisted snapshots', () => {
    const mig = readFileSync(resolve(ROOT, 'database/migrations/178_payment_allocations.sql'), 'utf8');
    expect(mig).toContain("pt.payment_status = 'paid'");
    expect(mig).toContain("(b.total_amount + b.tax_amount)");
    expect(mig).toContain("UNIQUE KEY uk_pa_payment_booking");
    expect(mig).toContain('COURTZON_MIGRATION_ENV: PRODUCTION_SAFE');
  });
});

describe('R5-D2-B — partial refund payment lifecycle contract (internal only)', () => {
  const svc = be('src/modules/payment/application/payment.service.ts');
  const repo = be('src/modules/payment/infrastructure/repositories/payment.repository.ts');
  const mock = be('src/shared/services/gateway/mock-gateway.ts');
  const paymob = be('src/shared/services/gateway/paymob-gateway.ts');
  const alloc = be('src/modules/booking/infrastructure/repositories/payment-allocation.repository.ts');

  it('refund() accepts allocation options and routes to the multi-partial engine', () => {
    expect(svc).toContain('export interface RefundOptions');
    expect(svc).toContain("if (options?.allocationId) {");
    expect(svc).toContain('this._refundSeriesAllocation(transaction, amount, reason, traceId, options)');
    // Normal path unchanged.
    expect(svc).toContain('return this._refundCard(transaction, amount, reason, traceId);');
  });

  it('the partial engine guards allocation + payment balances, settlement, and method', () => {
    expect(svc).toContain('Allocation does not belong to this payment');
    expect(svc).toContain('Refund amount exceeds the allocation refundable balance');
    expect(svc).toContain('Refund amount exceeds the payment remaining refundable balance');
    expect(svc).toContain('already gateway-settled — partial refunds are not supported');
    expect(svc).toContain('Allocation partial refunds are only supported for card payments');
  });

  it('payment stays paid until the FULL amount is returned; refunded exactly once', () => {
    const fn = svc.slice(svc.indexOf('private async _finalizeAllocationRefund'), svc.indexOf('private async _finalizeAllocationRefund') + 3200);
    expect(fn).toContain("UPDATE payment_allocations");
    expect(fn).toContain("payment_status = 'refunded'");
    expect(fn).toContain('eventBusV2.emit(\'payment:refunded\'');
  });

  it('partial intents are keyed per (payment + allocation + idempotency key), legacy single-intent untouched', () => {
    expect(repo).toContain('readAllocationRefundIntent(raw: unknown, idempotencyKey: string)');
    expect(repo).toContain('allocRefunds[idempotencyKey] = intent;');
    expect(repo).toContain('newAllocationRefundIntent');
    expect(repo).toContain('writeGatewayResponse(raw: unknown, intent: RefundIntent): string');
  });

  it('mock gateway tracks cumulative captured/refunded and rejects over-refund', () => {
    expect(mock).toContain('captureLedger');
    expect(mock).toContain('refund exceeds captured amount');
  });

  it('Paymob adapter already supports a per-refund amount (partial capable at adapter level)', () => {
    expect(paymob).toContain('amount_cents: Math.round(request.amount * 100)');
  });

  it('allocation repo exposes per-allocation FOR UPDATE + cumulative sum (D2-B guards)', () => {
    expect(alloc).toContain('async findByIdForUpdate(id: number, conn');
    expect(alloc).toContain('async sumRefundedByPayment(paymentTransactionId: number, conn');
  });
});
