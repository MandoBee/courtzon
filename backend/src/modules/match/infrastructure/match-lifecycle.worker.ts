import { deadlineService } from '../application/services/deadline.service.js';
import { matchService } from '../application/services/match.service.js';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('match-lifecycle-worker');

export interface MatchLifecycleJob {
  _?: undefined;
}

/**
 * Match lifecycle automation (deadline close + scheduled auto-start).
 *
 * Runs on a short (5-minute) cadence so players see the intended live
 * transitions:
 *  1. `closeExpiredMatches` — open/full matches past `public_match_details.deadline`
 *     are closed by the domain lifecycle (invitations + pending join requests
 *     resolved, `match:updated` emitted for realtime).
 *  2. `autoStartScheduledMatches` — closed matches whose scheduled start has
 *     arrived (with ≥ 2 participants and no session) start through the same
 *     `sessionService.start` path a creator uses, then `match:updated` fires.
 *
 * Auto-complete remains on the existing hourly `match_result_deadlines` job
 * (its ended_at uses the authoritative bookings.end_at_utc, so hour-granularity
 * never affects `played_at`).
 */
export async function processMatchLifecycle(_data: MatchLifecycleJob): Promise<void> {
  const closed = await deadlineService.closeExpiredMatches();
  const started = await matchService.autoStartScheduledMatches();
  log.info({ closed, started }, 'match lifecycle processing complete');
}

export async function scheduleMatchLifecycle(): Promise<string[]> {
  const ids: string[] = [];
  const id = await queueService.add('match_lifecycle', {}, {
    repeat: { every: 300_000 },
    jobId: 'match_lifecycle',
  });
  if (id) ids.push(id);
  return ids;
}