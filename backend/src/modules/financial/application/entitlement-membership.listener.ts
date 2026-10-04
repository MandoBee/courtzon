import type mysql from 'mysql2/promise';
import type { EventEnvelope } from '../../../shared/event-bus/event-envelope.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { financialEntitlementService } from './financial-entitlement.service.js';
import { entitlementOwnsSource } from '../domain/financial-entitlement-aggregate.js';
import { membershipP1Repository } from '../../membership/infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../../membership/infrastructure/repositories/membership-p2.repository.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('entitlement-membership-listener');

type RowData = mysql.RowDataPacket[];

const SUBSCRIBER_ID_PAID = 'entitlement-membership-installment-paid';
const SUBSCRIBER_ID_REFUNDED = 'entitlement-membership-refunded';
const SUBSCRIBER_ID_ACTIVATED = 'entitlement-membership-subscription-activated';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * G11.22 P3 — MEMBERSHIP financial entitlements (approved P3 rules).
 *
 * One paid membership INSTALLMENT == one entitlement source
 * (`source_type = 'membership'`, `source_id = membership_installment.id`).
 * This reuses the EXISTING `financial_entitlements` aggregate — no new table,
 * no second payout ledger, no new settlement engine (unified settlement only).
 *
 * Trigger: `membership:payment-received` — emitted by the membership module
 * ONLY after an installment is finalised as PAID (first-installment activation
 * or a subsequent/post-expiry collection). Unpaid / overdue / voided /
 * refunded installments NEVER create entitlements.
 *
 * Economics come EXCLUSIVELY from the IMMUTABLE installment snapshot:
 *   GROSS = membership_installments.amount
 *   COMM  = membership_installments.commission_amount  (already proportionally
 *           allocated for fixed rates at purchase — never re-read live)
 *   NET   = GROSS − COMM
 *
 * Custody split (mirrors the P2 membership GL recognition):
 *   CARD (payment method 'card'; collector = 'courtzon')
 *     CourtZon is merchant of record (Dr 1100 gross / Cr 2202 net /
 *     Cr 4110 commission) → ONE entitlement ORGANIZATION_EARNING = NET
 *     (the org's claim is the net; the gross is only custody).
 *   CASH (payment method 'cash'; collector = 'org')
 *     The organisation collected the cash itself (org book already credited it
 *     the FULL gross), so CourtZon's only remaining claim is its commission →
 *     ONE entitlement COURTZON_COMMISSION = COMM. Deliberately NO
 *     ORGANIZATION_EARNING (adding it would double-count the same cash).
 *
 * STATUS: created PENDING with `available_at = NULL` — the GENERIC activation
 * worker promotes them to AVAILABLE (source_type 'membership' is NOT excluded
 * by `findPendingForActivation`, unlike tournament).
 *
 * Idempotency: pre-check + the DB unique key `uk_fe_source_type
 * (source_type, source_id, entitlement_type)` — a replayed membership event is
 * a safe no-op.
 *
 * Registered as durable BullMQ subscribers so a crash between payment and
 * entitlement creation is recovered by the outbox poller (same pattern as
 * booking/tournament entitlement subscribers).
 */
export function registerEntitlementMembershipSubscribers(): void {
  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_PAID,
    eventName: 'membership:payment-received',
    queueName: SUBSCRIBER_ID_PAID,
    handler: handleMembershipInstallmentPaid,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_REFUNDED,
    eventName: 'payment:refunded',
    queueName: SUBSCRIBER_ID_REFUNDED,
    handler: handleMembershipPaymentRefunded,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  // G11.22 P3 final — FULL-PAYMENT subscriptions (no installments) recognise
  // entitlement on activation (P1 mode | | P2 first-installment activation on a
  // non-installment subscription). The handler skips installment-mode
  // subscriptions (those are recognised per paid installment instead).
  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_ACTIVATED,
    eventName: 'membership:activated',
    queueName: SUBSCRIBER_ID_ACTIVATED,
    handler: handleMembershipSubscriptionActivated,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  log.info('Entitlement membership subscribers registered');
}

export function createEntitlementMembershipWorkers(): Worker[] {
  return [
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_PAID,
      queueName: SUBSCRIBER_ID_PAID,
      handler: handleMembershipInstallmentPaid,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_REFUNDED,
      queueName: SUBSCRIBER_ID_REFUNDED,
      handler: handleMembershipPaymentRefunded,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_ACTIVATED,
      queueName: SUBSCRIBER_ID_ACTIVATED,
      handler: handleMembershipSubscriptionActivated,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
  ];
}

// ── membership:payment-received → entitlement(s) for that paid installment ──
export async function handleMembershipInstallmentPaid(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  const installmentId = Number(data?.installmentId);
  const subscriptionId = Number(data?.subscriptionId ?? data?.referenceId ?? 0);
  if (!(installmentId > 0)) return;

  const installment = await membershipP2Repository.findInstallmentById(installmentId);
  if (!installment) {
    log.error({ installmentId, subscriptionId }, 'Membership installment missing for entitlement creation');
    throw new Error(`Membership installment ${installmentId} not found for entitlement creation`);
  }
  if (installment.status !== 'paid') {
    // Only a PAID installment may recognise entitlement (unpaid/overdue/voided/
    // refunded must never). A replay after refund is a safe no-op.
    log.info({ installmentId, status: installment.status }, 'Membership installment not paid — no entitlement created');
    return;
  }

  const subscription = subscriptionId
    ? await membershipP1Repository.findSubscription(subscriptionId)
    : null;
  const orgId = subscription ? Number(subscription.organisation_id) : Number(data?.organisationId ?? 0);
  if (!orgId) {
    log.error({ installmentId, subscriptionId }, 'Membership subscription has no organisation — no entitlement created');
    throw new Error(`Membership installment ${installmentId} has no owning organisation`);
  }

  // Idempotency pre-check (the DB unique key is the hard guarantee). The
  // METADATA-AWARE predicate distinguishes OUR installment entitlement from a
  // numerically-colliding subscription-scoped entitlement (approved #4).
  const existing = await financialEntitlementService.getEntitlementsBySource('membership', installmentId);
  if (existing.some((e) => entitlementOwnsSource(e, { installmentId }, installmentId))) {
    log.info({ installmentId, count: existing.length }, 'Membership entitlements already exist — idempotent skip');
    return;
  }

  const gross = round2(Number(installment.amount));
  if (!(gross > 0)) {
    log.info({ installmentId, gross }, 'Membership installment has zero amount — no entitlement created');
    return;
  }
  const commission = round2(Number(installment.commission_amount));
  const orgNet = round2(gross - commission);
  const currency = String(installment.currency || 'EGP');

  // Payment method is authoritative for custody (installments may mix cash).
  const paymentId = await membershipP2Repository.findInstallmentPaymentId(installmentId);
  const paymentMethod = paymentId ? await paymentMethodOf(paymentId) : null;
  const isCash = paymentMethod === 'cash';
  if (paymentMethod !== 'cash' && paymentMethod !== 'card') {
    log.warn({ installmentId, paymentMethod }, `Membership installment paid with unsupported method '${paymentMethod}' — no entitlement created`);
    return;
  }

  const inputs: any[] = [];
  if (isCash) {
    // CASH — the org collected the cash; CourtZon's claim is only the commission.
    if (commission > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: null, // membership is org-wide (branch snapshot is eligibility-only)
        entitlementType: 'COURTZON_COMMISSION',
        sourceType: 'membership',
        sourceId: installmentId,
        collector: 'org',
        amount: commission,
        currency,
        availableAt: null,
        description: `Membership installment #${installmentId} — CourtZon commission (cash)`,
        metadata: { subscriptionId, installmentId, gross, commission, orgNet, paymentMethod },
      });
    }
  } else {
    // CARD — CourtZon is custodian; the org's claim is the NET.
    if (orgNet > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: null,
        entitlementType: 'ORGANIZATION_EARNING',
        sourceType: 'membership',
        sourceId: installmentId,
        collector: 'courtzon',
        amount: orgNet,
        currency,
        availableAt: null,
        description: `Membership installment #${installmentId} — organisation earning (card)`,
        metadata: { subscriptionId, installmentId, gross, commission, orgNet, paymentMethod },
      });
    }
  }

  if (inputs.length === 0) {
    log.info({ installmentId, paymentMethod }, 'No membership entitlements to create (zero amounts)');
    return;
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ids = await financialEntitlementService.createEntitlements(inputs, conn);
    await conn.commit();
    log.info({ installmentId, entitlementIds: ids }, 'Entitlements created for paid membership installment');
  } catch (err: any) {
    await conn.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      // A duplicate may be a benign replay of OUR installment OR (rarely) a
      // numeric-colliding subscription-scoped entitlement. Only the former is a
      // safe no-op — distinguish via metadata on the conflicting row.
      const existing = await financialEntitlementService.getEntitlementsBySource('membership', installmentId);
      if (existing.some((e) => entitlementOwnsSource(e, { installmentId }, installmentId))) {
        log.info({ installmentId }, 'Duplicate membership entitlement — idempotent skip');
        return;
      }
      log.error({ installmentId }, 'Membership entitlement INSERT collided with a DIFFERENT source id — not silently swallowed');
      throw err;
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ── membership:activated → FULL-PAYMENT (non-installment) entitlement ───────
// Approved decision: a subscription paid in full MUST create an entitlement
// (Booking/Marketplace/Tournament precedent + financial necessity: P1's org
// receivable on card and CourtZon commission on cash must be settleable via the
// unified settlement engine). source_id = membership_subscriptions.id.
// Installment-mode subscriptions are SKIPPED here — they are recognised per
// paid installment (`handleMembershipInstallmentPaid`).
export async function handleMembershipSubscriptionActivated(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  const subscriptionId = Number(data?.subscriptionId);
  if (!(subscriptionId > 0)) return;

  const subscription = await membershipP1Repository.findSubscription(subscriptionId);
  if (!subscription) {
    log.error({ subscriptionId }, 'Membership subscription missing for full-payment entitlement');
    throw new Error(`Membership subscription ${subscriptionId} not found`);
  }
  const orgId = Number(subscription.organisation_id);
  if (!orgId) {
    log.error({ subscriptionId }, 'Membership subscription has no organisation — no entitlement created');
    throw new Error(`Membership subscription ${subscriptionId} has no owning organisation`);
  }

  // Installment mode → handled per paid installment; NEVER subscription-scoped.
  const installments = await membershipP2Repository.listInstallmentsBySubscription(subscriptionId);
  if (installments.length > 0) {
    log.info({ subscriptionId, count: installments.length }, 'Installment subscription — subscription-scoped entitlement skipped');
    return;
  }

  // Metadata-aware pre-check (approved #4): only rows whose metadata identifies
  // THIS subscription (and no installmentId) count as already-created.
  const existing = await financialEntitlementService.getEntitlementsBySource('membership', subscriptionId);
  if (existing.some((e) => entitlementOwnsSource(e, { subscriptionId }, subscriptionId))) {
    log.info({ subscriptionId, count: existing.length }, 'Membership full-payment entitlements already exist — idempotent skip');
    return;
  }

  const gross = round2(Number(subscription.total_amount));
  if (!(gross > 0)) {
    log.info({ subscriptionId, gross }, 'Membership subscription has zero amount — no entitlement created');
    return;
  }
  const commission = round2(Number(subscription.commission_amount));
  const orgNet = round2(gross - commission);
  const currency = String(subscription.currency || 'EGP');
  const paymentMethod = String(subscription.payment_method ?? 'card');
  const isCash = paymentMethod === 'cash';
  if (paymentMethod !== 'cash' && paymentMethod !== 'card') {
    log.warn({ subscriptionId, paymentMethod }, `Membership full payment method '${paymentMethod}' unsupported — no entitlement created`);
    return;
  }

  const inputs: any[] = [];
  if (isCash) {
    if (commission > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: null,
        entitlementType: 'COURTZON_COMMISSION',
        sourceType: 'membership',
        sourceId: subscriptionId,
        collector: 'org',
        amount: commission,
        currency,
        availableAt: null,
        description: `Membership subscription #${subscriptionId} — CourtZon commission (cash)`,
        metadata: { subscriptionId, installmentId: null, gross, commission, orgNet, paymentMethod },
      });
    }
  } else if (orgNet > 0) {
    inputs.push({
      organisationId: orgId,
      branchId: null,
      entitlementType: 'ORGANIZATION_EARNING',
      sourceType: 'membership',
      sourceId: subscriptionId,
      collector: 'courtzon',
      amount: orgNet,
      currency,
      availableAt: null,
      description: `Membership subscription #${subscriptionId} — organisation earning (card)`,
      metadata: { subscriptionId, installmentId: null, gross, commission, orgNet, paymentMethod },
    });
  }

  if (inputs.length === 0) {
    log.info({ subscriptionId, paymentMethod }, 'No membership full-payment entitlements to create (zero amounts)');
    return;
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ids = await financialEntitlementService.createEntitlements(inputs, conn);
    await conn.commit();
    log.info({ subscriptionId, entitlementIds: ids }, 'Entitlements created for paid FULL-PAYMENT membership');
  } catch (err: any) {
    await conn.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      // Numeric collision with a DIFFERENT id space (unusual) must NOT be
      // swallowed — a legitimate entitlement would silently disappear.
      log.error({ subscriptionId, err: err.message }, 'Membership full-payment entitlement INSERT collided with a DIFFERENT source id');
      throw err;
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ── payment:refunded (referenceType membership_subscription) → cancel ───────
export async function handleMembershipPaymentRefunded(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (data?.referenceType !== 'membership_subscription') return;
  const paymentId = Number(data?.paymentId ?? 0);
  if (!(paymentId > 0)) return;

  const installment = await membershipP2Repository.findInstallmentByPayment(paymentId);
  if (installment) {
    // Installment-scoped refund → cancel the AVAILABLE installment entitlement.
    const cancelled = await financialEntitlementService.cancelBySource(
      'membership',
      Number(installment.id),
      `Membership installment #${installment.id} refunded — payment #${paymentId}`,
    );
    if (cancelled > 0) {
      log.info({ installmentId: Number(installment.id), cancelled }, 'Membership entitlements cancelled for refunded installment');
    }
    return;
  }

  // Full-payment subscription refund → cancel the subscription-scoped
  // entitlement (AVAILABLE only; SETTLED stays immutable).
  const subscriptionId = Number(data?.referenceId ?? data?.subscriptionId ?? 0);
  if (!(subscriptionId > 0)) return;
  const cancelled = await financialEntitlementService.cancelBySource(
    'membership',
    subscriptionId,
    `Membership subscription #${subscriptionId} refunded — payment #${paymentId}`,
  );
  if (cancelled > 0) {
    log.info({ subscriptionId, cancelled }, 'Membership full-payment entitlements cancelled for refunded subscription');
  }
}

async function paymentMethodOf(paymentId: number): Promise<string | null> {
  const [rows] = await getPool().execute<RowData>(
    'SELECT payment_method FROM payment_transactions WHERE id = ? LIMIT 1',
    [paymentId],
  );
  return rows.length ? String((rows[0] as any).payment_method) : null;
}