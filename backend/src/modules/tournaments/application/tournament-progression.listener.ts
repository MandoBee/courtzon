import type { EventEnvelope } from '../../../shared/event-bus/event-envelope.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { tournamentService } from './tournament.service.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('tournament-progression-listener');

const SUBSCRIBER_ID = 'tournament-progression';
const QUEUE_NAME = SUBSCRIBER_ID;

/**
 * Approved shared Match results are the ONLY driver of bracket progression
 * (Group 5B). Three approval paths produce authoritative winners:
 *   * match:result-approved       — opponent confirms the submitted result
 *   * match:result-auto-approved  — worker auto-approves past the deadline
 *   * match:result-resolved       — admin resolves a dispute (only when the
 *                                   outcome is 'approved' does a winner exist)
 *
 * Every path funnels into the same queue so progression is serialised per
 * event (concurrency 1) — two results landing on the same target slot cannot
 * race. Duplicate deliveries are filtered by the processed_events idempotency
 * table plus the in-engine slot-level idempotency guards.
 *
 * Registered as a BullMQ subscriber (not an in-memory handler) so failed
 * progression is retried/recovered by the outbox poller like every other
 * durable domain listener.
 */
export function registerTournamentProgressionSubscribers(): void {
  for (const eventName of [
    'match:result-approved', 'match:result-auto-approved', 'match:result-resolved', 'match:result-corrected', 'match:result-no-result',
  ]) {
    eventBusV2.subscribe({
      subscriberId: SUBSCRIBER_ID,
      eventName,
      queueName: QUEUE_NAME,
      handler: handleProgressionEvent,
      options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
    });
  }
  log.info('Tournament progression subscribers registered');
}

export function createTournamentProgressionWorkers(): Worker[] {
  return [
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID,
      queueName: QUEUE_NAME,
      handler: handleProgressionEvent,
      concurrency: 1,
      attempts: 6,
      backoffDelay: 2000,
    }),
  ];
}

async function handleProgressionEvent(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.matchId || !data?.resultId) {
    log.warn({ eventId: envelope.eventId, eventName: envelope.eventName }, 'progression.event.missing_payload');
    return;
  }

  // A dispute resolution that is not 'approved' has no winner (no_result,
  // draw, withdrawn, pending) — nothing progresses.
  if (envelope.eventName === 'match:result-resolved' && data.resolution !== 'approved') {
    log.info({ eventId: envelope.eventId, resultId: data.resultId, resolution: data.resolution },
      'progression.event.skipped_non_approved_resolution');
    return;
  }

  // G8-A — corrections reconcile the projection + standings (no progression
  // re-run; bracket reversal after irreversible progression is a G8-D decision).
  // G8-D-MINIMAL — an automatic no-result expiry (match-result-deadline.worker →
  // markExpiredNoResult) carries NO winner and is reconciliation-only: mirror the
  // projection + recompute standings, never progressing, never assigning a winner,
  // never completing the tournament. It reuses the exact correction path.
  if (envelope.eventName === 'match:result-corrected' || envelope.eventName === 'match:result-no-result') {
    await tournamentService.recalculateStandingsForResult(Number(data.resultId));
    log.info({ eventId: envelope.eventId, resultId: data.resultId, eventName: envelope.eventName }, 'progression.event.result_reconciled');
    return;
  }

  // G8-A — mirror the authoritative approved result onto tournament_matches
  // (winner_id projection + score_summary) so standings reads are correct for
  // Round-Robin AND knockout slots. Idempotent; failure must not block
  // progression (the match-result record remains the authority).
  try {
    await tournamentService.syncSharedResultMirror(Number(data.resultId));
  } catch (err) {
    log.error({ err, eventId: envelope.eventId, resultId: data.resultId }, 'progression.event.mirror_failed');
  }

  const outcome = await tournamentService.progressFromApprovedResult({
    matchId: Number(data.matchId),
    resultId: Number(data.resultId),
  });

  log.info({
    eventId: envelope.eventId,
    matchId: data.matchId,
    resultId: data.resultId,
    advancedTo: outcome.advancedTo,
    sharedMatchId: outcome.sharedMatchId ?? null,
    stageCompleted: outcome.stageCompleted ?? false,
    tournamentCompleted: outcome.tournamentCompleted ?? false,
  }, 'progression.event.processed');
}