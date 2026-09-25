import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { recordAudit } from '../../audit-log/index.js';

const log = createModuleLogger('tournament-payment-listener');

// Idempotency guard — registering twice would duplicate every in-memory handler
// and fire each domain event multiple times (double markRegistrationPaid /
// double tournament:registration-paid). Called once at app startup and once per
// test file. Guarded so repeated calls are a no-op.
let tournamentPaymentListenersRegistered = false;

/** Test-only: clear the guard so registerTournamentPaymentListeners() can run again. */
export function resetTournamentPaymentListenersForTest(): void {
  tournamentPaymentListenersRegistered = false;
}

/**
 * Group 3 — turns a successful Tournament registration payment (card via the
 * shared Payment capability, or offline cash recorded through the shared
 * payment_transactions pipeline) into the authoritative registration state:
 * `payment_status = 'paid'` + the `tournament:registration-paid` realtime event.
 *
 * The SHARED Payment service owns the gateway lifecycle, idempotency and
 * payment events — this listener only consumes `payment:succeeded` for the
 * 'tournament' reference type, exactly like the booking/academy/marketplace
 * listeners. It never re-implements payment logic. Tournament accounting is
 * intentionally NOT posted in this group (the accounting engine skips the
 * 'tournament' reference type).
 */
export function registerTournamentPaymentListeners(): void {
  if (tournamentPaymentListenersRegistered) {
    log.info('Tournament payment listeners already registered — skip');
    return;
  }
  tournamentPaymentListenersRegistered = true;

  eventBusV2.on('payment:succeeded', async (data) => {
    if (data.referenceType !== 'tournament') return;

    const registrationId = Number(data.referenceId);
    if (!registrationId) {
      log.error({ paymentId: data.paymentId }, 'Tournament payment succeeded but no registration referenceId');
      return;
    }

    try {
      const reg = await tournamentRepository.getRegistrationById(registrationId);
      if (!reg) {
        log.error({ paymentId: data.paymentId, registrationId }, 'Tournament registration not found on payment succeeded');
        return;
      }
      if (reg.payment_status === 'paid') {
        log.info({ paymentId: data.paymentId, registrationId }, 'Tournament registration already paid — idempotent skip');
        return;
      }

      await tournamentRepository.updateRegistrationPaymentStatus(registrationId, 'paid');
      const actorId = Number(data.metadata?.userId) || Number(reg.player_id ?? reg.user_id) || 0;
      await recordAudit({
        actorId,
        action: 'tournament.registration.paid',
        entityType: 'tournament_registration',
        entityId: registrationId,
        afterState: { payment_status: 'paid', via: 'payment:succeeded' },
      });

      const orgId = await tournamentRepository.getOrganisationId(reg.tournament_id);
      const t = await tournamentRepository.findById(reg.tournament_id);
      eventBusV2.emit('tournament:registration-paid', {
        tournamentId: reg.tournament_id,
        registrationId,
        userId: reg.player_id ?? reg.user_id,
        organisationId: orgId,
        branchId: t?.branch_id ?? null,
        creatorId: t?.creator_id ?? null,
        paymentId: data.paymentId,
      } as any);

      log.info({ paymentId: data.paymentId, registrationId }, 'Tournament registration marked paid via payment:succeeded');
    } catch (err: any) {
      log.error({ err, paymentId: data.paymentId, registrationId }, 'Tournament payment succeeded handler failed');
    }
  });

  log.info('Tournament payment listeners registered');
}