// ============================================================================
// Academy G2 — pending-hold expiry worker
//
// Marks `pending_court`/`resolved` holds whose deterministic pending window has
// passed as `pending_expired`. Never auto-cancels, never auto-extends, never
// moves the session. The admin decides what happens next (keep / alternative /
// release) via ACADEMY_SESSION.RESOLVE_*.
// ============================================================================
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { academyScheduleService } from '../application/academy-schedule.service.js';
import type { ExpireAcademyHoldsJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('academy-hold-expiry');

export async function handleExpireAcademyHolds(job: ExpireAcademyHoldsJob): Promise<void> {
  const result = await academyScheduleService.expireHolds();
  if (result.expired) {
    log.info({ expired: result.expired }, `Academy hold expiry: ${result.expired} hold(s) moved to pending_expired`);
  }
}