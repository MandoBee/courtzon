import type mysql from 'mysql2/promise';
import type { EventEnvelope } from '../../../shared/event-bus/event-envelope.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { tournamentRepository } from '../../tournaments/infrastructure/repositories/tournament.repository.js';
import { financialEntitlementService } from './financial-entitlement.service.js';
import { recordAudit } from '../../audit-log/index.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('entitlement-tournament-listener');

type RowData = mysql.RowDataPacket[];

const SUBSCRIBER_ID_PAID = 'entitlement-tournament-registration-paid';
const SUBSCRIBER_ID_REFUNDED = 'entitlement-tournament-refunded';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Payment methods that are collected through a gateway (i.e. CourtZon is custodian). */
const GATEWAY_METHODS = ['card', 'online'];

/**
 * G11.4 — TOURNAMENT financial entitlements.
 *
 * One paid tournament registration payment == one entitlement source
 * (`source_type = 'tournament'`, `source_id = tournament_registrations.id`).
 * This reuses the EXISTING `financial_entitlements` aggregate — there is no
 * second payout ledger, no new table and no new settlement engine: the org is
 * paid through the existing unified settlement flow.
 *
 * Economics (authoritative inputs, in this order):
 *   GROSS  = payment_transactions.amount      (what was actually collected)
 *   COMM   = round2(GROSS × tournament.commission_rate / 100) from the
 *            IMMUTABLE tournament snapshot — the live subscription rate is never
 *            re-read at entitlement time
 *   NET    = GROSS − COMM
 *
 * `tournament.entry_fee` is NEVER used as an amount authority (the payment is);
 * it is only verified defensively for logging, exactly like G11.1/G11.2.
 *
 * Custody split (mirrors the G11.1 recognition, so the entitlement subledger and
 * the GL mirror describe the same economics):
 *
 *   CARD  (payment_method IN 'card','online'; collector = 'courtzon')
 *     CourtZon is merchant of record: Dr 1100 = GROSS, Cr 2202 = NET,
 *     Cr 4192 = COMM.
 *     → ONE entitlement: ORGANIZATION_EARNING = NET (the NET, never the gross —
 *       the org's claim is the net amount; the gross is only custody).
 *
 *   CASH  (payment_method = 'cash'; collector = 'org')
 *     The organisation collected the money itself (G11.2 already credited it the
 *     FULL gross against CourtZon's books), so CourtZon's only remaining claim
 *     is its commission.
 *     → ONE entitlement: COURTZON_COMMISSION = COMM, collector 'org'.
 *     There is deliberately NO ORGANIZATION_EARNING here: G11.2 already gave the
 *     org the full cash gross, so adding an org-earning entitlement would
 *     double-count the same cash.
 *
 * PLATFORM / COMMUNITY tournaments (`organisation_id IS NULL`): there is no
 * counterparty to pay and no commission to earn, so NO entitlement is created —
 * fail closed, loudly logged.
 *
 * STATUS / AVAILABILITY:
 * Both variants are created PENDING with `available_at = NULL`. NULL here does
 * NOT mean "immediately available" — it means "released by a tournament-specific
 * business condition, not by a clock". The generic activation worker explicitly
 * skips `source_type = 'tournament'`, and the dedicated tournament activation
 * worker releases them:
 *   CARD → only once the backing payment owns an ACTIVE gateway settlement
 *   CASH → only once the tournament's current draw is LOCKED
 *
 * Registered as durable BullMQ subscribers (not in-memory handlers) so a crash
 * between payment and entitlement creation is recovered by the outbox poller,
 * failures are retried with backoff, and `processed_events` makes a redelivery a
 * no-op.
 */
export function registerEntitlementTournamentSubscribers(): void {
  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_PAID,
    eventName: 'tournament:registration-paid',
    queueName: SUBSCRIBER_ID_PAID,
    handler: handleTournamentRegistrationPaid,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_REFUNDED,
    eventName: 'payment:refunded',
    queueName: SUBSCRIBER_ID_REFUNDED,
    handler: handleTournamentPaymentRefunded,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  log.info('Entitlement tournament subscribers registered');
}

export function createEntitlementTournamentWorkers(): Worker[] {
  return [
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_PAID,
      queueName: SUBSCRIBER_ID_PAID,
      handler: handleTournamentRegistrationPaid,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_REFUNDED,
      queueName: SUBSCRIBER_ID_REFUNDED,
      handler: handleTournamentPaymentRefunded,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// tournament:registration-paid → entitlements
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTournamentRegistrationPaid(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  const registrationId = Number(data?.registrationId);
  const paymentId = Number(data?.paymentId);
  if (!registrationId) return;

  const registration = await tournamentRepository.getRegistrationById(registrationId);
  if (!registration) {
    // The registration is the source of record. If it is missing the payment is
    // not fully recorded — rethrow so the durable subscriber retries; if it is
    // permanently absent the job dead-letters for inspection.
    log.error({ registrationId, paymentId }, 'Tournament registration missing for entitlement creation');
    throw new Error(`Tournament registration ${registrationId} not found for entitlement creation`);
  }

  const tournament = await tournamentRepository.findById(Number(registration.tournament_id));
  if (!tournament) {
    log.error({ registrationId, paymentId, tournamentId: registration.tournament_id }, 'Tournament missing for entitlement creation');
    throw new Error(`Tournament ${registration.tournament_id} not found for entitlement creation`);
  }

  // ── Fail closed: no counterparty, no entitlement ──
  const orgId = Number(tournament.organisation_id ?? 0);
  if (!orgId) {
    log.info({ registrationId, paymentId, tournamentId: tournament.id }, 'Platform/community tournament — no financial entitlement created (no counterparty, no commission)');
    return;
  }

  // ── Amount authority: the PAYMENT, never the catalogue entry_fee ──
  const pool = getPool();
  const [paymentRows] = await pool.execute<RowData>(
    `SELECT id, amount, currency, payment_method, payment_status
     FROM payment_transactions WHERE id = ?`,
    [paymentId],
  );
  const payment = (paymentRows as any[])[0];
  if (!payment) {
    log.error({ registrationId, paymentId }, 'Payment transaction missing for tournament entitlement creation');
    throw new Error(`Payment ${paymentId} not found for tournament entitlement creation`);
  }

  const gross = round2(payment.amount);
  if (!(gross > 0)) {
    log.info({ registrationId, paymentId, gross }, 'Tournament registration has zero/negative collected amount — no entitlement created');
    return;
  }

  const paymentMethod = String(payment.payment_method);
  const isCash = paymentMethod === 'cash';
  const isGatewayMethod = GATEWAY_METHODS.includes(paymentMethod);
  if (!isCash && !isGatewayMethod) {
    log.warn({ registrationId, paymentId, paymentMethod }, 'Tournament registration paid with an unsupported method — no entitlement created');
    return;
  }

  // Defensive verification only — the collected amount is NEVER re-priced.
  const entryFee = round2(tournament.entry_fee ?? 0);
  if (entryFee > 0 && gross !== entryFee) {
    log.warn({ registrationId, paymentId, gross, entryFee }, 'Tournament collected amount differs from entry_fee — using the payment amount (authoritative)');
  }

  const commission = round2((gross * round2(Number(tournament.commission_rate ?? 0))) / 100);
  const orgNet = round2(gross - commission);
  const currency = String(payment.currency || tournament.currency_code || 'EGP');
  const branchId = tournament.branch_id ?? null;

  // ── Idempotency (pre-check; the DB unique key is the hard guarantee) ──
  const existing = await financialEntitlementService.getEntitlementsBySource('tournament', registrationId);
  if (existing.length > 0) {
    log.info({ registrationId, paymentId, count: existing.length }, 'Tournament entitlements already exist — idempotent skip');
    return;
  }

  const inputs: any[] = [];
  if (isCash) {
    // CASH — the organisation collected the money itself (G11.2 already credited
    // it the FULL gross), so CourtZon's only remaining claim is its commission.
    // There is deliberately NO ORGANIZATION_EARNING here: an org-earning
    // entitlement on top of the G11.2 cash gross would double-count the cash.
    if (commission > 0) {
      inputs.push({
        organisationId: orgId,
        branchId,
        entitlementType: 'COURTZON_COMMISSION',
        sourceType: 'tournament',
        sourceId: registrationId,
        collector: 'org',
        amount: commission,
        currency,
        // NULL = "released by a tournament condition, not by a clock".
        availableAt: null,
        description: `Tournament #${tournament.id} registration #${registrationId} — CourtZon commission (cash)`,
        metadata: {
          registrationId,
          paymentId,
          tournamentId: Number(tournament.id),
          organisationId: orgId,
          branchId,
          paymentMethod,
          grossAmount: gross,
          commissionAmount: commission,
          orgNetAmount: orgNet,
          commissionRate: round2(Number(tournament.commission_rate ?? 0)),
          custody: 'org_collected',
          releaseCondition: 'tournament_draw_locked',
        },
      });
    }
  } else if (orgNet > 0) {
    // CARD / online — CourtZon is merchant of record (G11.1: Dr 1100 gross,
    // Cr 2202 net, Cr 4192 commission), so the org's claim is the NET amount.
    // The entitlement value is the NET, never the gross: the gross is only
    // custody that still has to be gateway-settled before it becomes payable.
    inputs.push({
      organisationId: orgId,
      branchId,
      entitlementType: 'ORGANIZATION_EARNING',
      sourceType: 'tournament',
      sourceId: registrationId,
      collector: 'courtzon',
      amount: orgNet,
      currency,
      availableAt: null,
      description: `Tournament #${tournament.id} registration #${registrationId} — org earning`,
      metadata: {
        registrationId,
        paymentId,
        tournamentId: Number(tournament.id),
        organisationId: orgId,
        branchId,
        paymentMethod,
        grossAmount: gross,
        commissionAmount: commission,
        orgNetAmount: orgNet,
        commissionRate: round2(Number(tournament.commission_rate ?? 0)),
        custody: 'courtzon_collected',
        releaseCondition: 'gateway_settlement_received',
      },
    });
  }

  if (inputs.length === 0) {
    log.info({ registrationId, paymentId, paymentMethod, gross, commission, orgNet }, 'Tournament registration produced no positive entitlement (zero-net or zero-commission) — none created');
    return;
  }

  // ── Atomic create, serialised on the registration row ──
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the registration so two concurrent deliveries of the same event (or a
    // redelivery racing the refund path) serialise here; the second one then sees
    // the entitlements created by the first and skips.
    await conn.execute<RowData>(
      'SELECT id FROM tournament_registrations WHERE id = ? FOR UPDATE',
      [registrationId],
    );
    const [dupeRows] = await conn.execute<RowData>(
      `SELECT id FROM financial_entitlements
       WHERE source_type = 'tournament' AND source_id = ? LIMIT 1`,
      [registrationId],
    );
    if ((dupeRows as any[]).length > 0) {
      await conn.rollback();
      log.info({ registrationId, paymentId }, 'Tournament entitlements already exist (locked check) — idempotent skip');
      return;
    }

    const ids = await financialEntitlementService.createEntitlements(inputs, conn);

    await recordAudit({
      actorId: Number(data?.userId) || null,
      action: 'TOURNAMENT.ENTITLEMENT_CREATED',
      entityType: 'tournament_registration',
      entityId: registrationId,
      afterState: {
        entitlementIds: ids,
        tournamentId: Number(tournament.id),
        organisationId: orgId,
        branchId,
        paymentId,
        paymentMethod,
        currency,
        grossAmount: gross,
        commissionAmount: commission,
        orgNetAmount: orgNet,
        commissionRate: round2(Number(tournament.commission_rate ?? 0)),
        entitlementTypes: inputs.map((i) => i.entitlementType),
      },
    });

    await conn.commit();

    log.info(
      { registrationId, paymentId, tournamentId: tournament.id, orgId, paymentMethod, gross, commission, orgNet, entitlementIds: ids },
      'Tournament entitlements created',
    );
  } catch (err) {
    await conn.rollback();
    // uk_fe_source_type (source_type, source_id, entitlement_type) is the final
    // idempotency guarantee — a duplicate insert from a concurrent worker is a
    // benign no-op, not a failure.
    if ((err as any)?.code === 'ER_DUP_ENTRY') {
      log.info({ registrationId, paymentId }, 'Concurrent tournament entitlement creation detected — idempotent skip');
      return;
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// payment:refunded (reference_type = 'tournament') → cancel entitlements
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTournamentPaymentRefunded(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (data?.referenceType !== 'tournament') return;
  const registrationId = Number(data?.referenceId);
  if (!registrationId) return;

  const reason = `Tournament registration #${registrationId} refunded (payment #${data?.paymentId ?? 'unknown'})`;
  const cancelled = await financialEntitlementService.cancelBySourceIds('tournament', [registrationId], reason);
  if (cancelled > 0) {
    log.info({ registrationId, paymentId: data?.paymentId, cancelled }, 'Tournament entitlements cancelled after refund');
  }
}
