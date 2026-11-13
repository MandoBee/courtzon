import { getPool } from '../../../database/mysql.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

/**
 * Canonical payment → Financial-Entitlement scope resolver (R1-B).
 *
 * The generic `POST /payments/:id/refund` endpoint must authorise the payment's
 * organisations and check settlement reservations before any money moves. Both
 * need canonical source ids, derived from the STORED payment row — never from
 * client-supplied ids.
 *
 * Mapping (verified against the schema):
 *   booking              → bookings.id (booking_id, fallback reference_id)
 *   booking_series       → every bookings row with bookings.series_id = reference_id
 *   order                → order_items.id of the order + its checkout-group siblings
 *                          (one card payment can cover many seller orders/orgs)
 *   academy              → academy_enrollments.id → academy_programs.organisation_id
 *   tournament           → tournament_registrations.id → tournaments.organisation_id
 *   membership_subscription → membership_installments (payment) + the subscription row
 *   subscription         → NO Financial Entitlement (platform plan revenue)
 *   wallet_topup         → NO Financial Entitlement (wallet deposit)
 *
 * Every entitlement-bearing type FAILS CLOSED when the canonical source record,
 * its organisation, or its item list cannot be resolved: an unresolvable source
 * is never treated as "nothing to check".
 */

export type RefundEntitlementSourceType =
  | 'booking'
  | 'marketplace'
  | 'academy'
  | 'tournament'
  | 'membership';

export interface PaymentRefundEntitlementScope {
  sourceType: RefundEntitlementSourceType;
  sourceIds: number[];
}

export interface PaymentRefundScope {
  paymentId: number;
  referenceType: string;
  /** False for payment types that legitimately never create entitlements. */
  hasEntitlements: boolean;
  entitlementScopes: PaymentRefundEntitlementScope[];
  /** Distinct canonical organisation ids involved in the payment. */
  organisationIds: number[];
}

export interface PaymentRefundSourceRow {
  id: number;
  reference_type: string | null;
  reference_id: number | null;
  booking_id: number | null;
  order_id: number | null;
}

/** Payment types that never produce Financial Entitlements. */
export const NO_ENTITLEMENT_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  'subscription',
  'wallet_topup',
]);

const toInt = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const uniqueSorted = (values: number[]): number[] =>
  [...new Set(values.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);

export async function resolvePaymentRefundScope(
  payment: PaymentRefundSourceRow,
): Promise<PaymentRefundScope> {
  const paymentId = Number(payment.id);
  const referenceType = String(payment.reference_type || '').trim();
  const pool = getPool();

  if (!referenceType) {
    throw new ConflictError(
      `Payment ${paymentId} has no reference type — refusing to refund an unidentifiable payment source`,
    );
  }

  if (NO_ENTITLEMENT_REFERENCE_TYPES.has(referenceType)) {
    return {
      paymentId,
      referenceType,
      hasEntitlements: false,
      entitlementScopes: [],
      organisationIds: [],
    };
  }

  if (referenceType === 'booking' || referenceType === 'booking_series') {
    // A series payment is one gateway charge for N occurrence bookings.
    const bookingId = toInt(payment.booking_id);
    const seriesId = toInt(payment.reference_id);

    let rows: any[];
    if (referenceType === 'booking') {
      const id = bookingId ?? seriesId;
      if (!id) {
        throw new ConflictError(`Payment ${paymentId} has no booking reference — refusing to refund`);
      }
      const [found] = await pool.execute<any[]>(
        'SELECT id, organisation_id FROM bookings WHERE id = ? LIMIT 1',
        [id],
      );
      rows = found as any[];
    } else {
      if (!seriesId) {
        throw new ConflictError(`Payment ${paymentId} has no booking-series reference — refusing to refund`);
      }
      const [found] = await pool.execute<any[]>(
        'SELECT id, organisation_id FROM bookings WHERE series_id = ? ORDER BY id',
        [seriesId],
      );
      rows = found as any[];
    }

    if (!rows.length) {
      throw new ConflictError(
        `Payment ${paymentId} references ${referenceType} data that does not exist — refusing to refund`,
      );
    }

    const organisationIds = uniqueSorted(rows.map((r) => Number(r.organisation_id)));
    if (!organisationIds.length || organisationIds.some((id) => !id)) {
      throw new ConflictError(
        `Payment ${paymentId} bookings have no resolvable organisation — refusing to refund`,
      );
    }

    return {
      paymentId,
      referenceType,
      hasEntitlements: true,
      entitlementScopes: [{ sourceType: 'booking', sourceIds: uniqueSorted(rows.map((r) => Number(r.id))) }],
      organisationIds,
    };
  }

  if (referenceType === 'order') {
    const orderId = toInt(payment.order_id) ?? toInt(payment.reference_id);
    if (!orderId) {
      throw new ConflictError(`Payment ${paymentId} has no order reference — refusing to refund`);
    }

    // One card payment can cover a whole multi-seller checkout group. Every
    // sibling order's items belong to the same money movement.
    const [items] = await pool.execute<any[]>(
      `SELECT oi.id AS item_id, oi.seller_id AS organisation_id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.id = ?
           OR (
             o.checkout_group_id IS NOT NULL
             AND o.checkout_group_id = (SELECT checkout_group_id FROM orders WHERE id = ?)
           )
        ORDER BY oi.id`,
      [orderId, orderId],
    );
    const rows = items as any[];
    if (!rows.length) {
      throw new ConflictError(
        `Payment ${paymentId} order ${orderId} has no order items — refusing to refund an unresolvable composition`,
      );
    }

    const organisationIds = uniqueSorted(rows.map((r) => Number(r.organisation_id)));
    if (!organisationIds.length || organisationIds.some((id) => !id)) {
      throw new ConflictError(`Payment ${paymentId} order items have no resolvable organisation — refusing to refund`);
    }

    return {
      paymentId,
      referenceType,
      hasEntitlements: true,
      entitlementScopes: [{ sourceType: 'marketplace', sourceIds: uniqueSorted(rows.map((r) => Number(r.item_id))) }],
      organisationIds,
    };
  }

  if (referenceType === 'academy') {
    const enrollmentId = toInt(payment.reference_id);
    if (!enrollmentId) {
      throw new ConflictError(`Payment ${paymentId} has no academy enrollment reference — refusing to refund`);
    }
    const [rows] = await pool.execute<any[]>(
      `SELECT p.organisation_id
         FROM academy_enrollments e
         JOIN academy_programs p ON p.id = e.program_id
        WHERE e.id = ?
        LIMIT 1`,
      [enrollmentId],
    );
    const organisationId = toInt((rows as any[])[0]?.organisation_id);
    if (!organisationId) {
      throw new ConflictError(
        `Payment ${paymentId} academy enrollment ${enrollmentId} has no resolvable organisation — refusing to refund`,
      );
    }
    return {
      paymentId,
      referenceType,
      hasEntitlements: true,
      entitlementScopes: [{ sourceType: 'academy', sourceIds: [enrollmentId] }],
      organisationIds: [organisationId],
    };
  }

  if (referenceType === 'tournament') {
    const registrationId = toInt(payment.reference_id);
    if (!registrationId) {
      throw new ConflictError(`Payment ${paymentId} has no tournament registration reference — refusing to refund`);
    }
    const [rows] = await pool.execute<any[]>(
      `SELECT t.organisation_id
         FROM tournament_registrations r
         JOIN tournaments t ON t.id = r.tournament_id
        WHERE r.id = ?
        LIMIT 1`,
      [registrationId],
    );
    const organisationId = toInt((rows as any[])[0]?.organisation_id);
    if (!organisationId) {
      throw new ConflictError(
        `Payment ${paymentId} tournament registration ${registrationId} has no resolvable organisation — refusing to refund`,
      );
    }
    return {
      paymentId,
      referenceType,
      hasEntitlements: true,
      entitlementScopes: [{ sourceType: 'tournament', sourceIds: [registrationId] }],
      organisationIds: [organisationId],
    };
  }

  if (referenceType === 'membership_subscription') {
    const subscriptionId = toInt(payment.reference_id);
    if (!subscriptionId) {
      throw new ConflictError(`Payment ${paymentId} has no membership subscription reference — refusing to refund`);
    }
    const [subs] = await pool.execute<any[]>(
      'SELECT id, organisation_id FROM membership_subscriptions WHERE id = ? LIMIT 1',
      [subscriptionId],
    );
    const organisationId = toInt((subs as any[])[0]?.organisation_id);
    if (!organisationId) {
      throw new ConflictError(
        `Payment ${paymentId} membership subscription ${subscriptionId} has no resolvable organisation — refusing to refund`,
      );
    }
    const [installments] = await pool.execute<any[]>(
      'SELECT id FROM membership_installments WHERE payment_transaction_id = ? ORDER BY id',
      [paymentId],
    );
    const installmentIds = (installments as any[]).map((r) => Number(r.id));
    return {
      paymentId,
      referenceType,
      hasEntitlements: true,
      // Installment-scoped entitlements (source_id = installment.id) and the
      // full-payment subscription-scoped entitlement (source_id = subscription.id)
      // live in the SAME numeric id space — both must be checked.
      entitlementScopes: [
        { sourceType: 'membership', sourceIds: uniqueSorted([...installmentIds, subscriptionId]) },
      ],
      organisationIds: [organisationId],
    };
  }

  // Unknown reference type: never assume "no entitlements".
  throw new ConflictError(
    `Payment ${paymentId} has unsupported reference type '${referenceType}' — refusing to refund an unverifiable payment source`,
  );
}
