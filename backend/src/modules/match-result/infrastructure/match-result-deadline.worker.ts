import { matchResultService } from '../application/match-result.service.js';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('match-result-worker');

export interface MatchResultDeadlineJob {
  _?: undefined;
}

/**
 * Part E.60 / Part G.413 — scheduled maintenance:
 * 1. auto-approve pending results past the opponent auto-approval deadline
 * 2. mark matches finished 3+ days ago with no result as 'no_result'
 */
export async function processMatchResultDeadlines(_data: MatchResultDeadlineJob): Promise<void> {
  const approved = await matchResultService.autoApproveDueResults();
  const marked = await matchResultService.markExpiredNoResult();
  log.info({ approved, marked }, 'match-result deadline processing complete');
}

export async function scheduleMatchResultDeadlines(): Promise<string[]> {
  const ids: string[] = [];
  const id = await queueService.add('match_result_deadlines', {}, {
    repeat: { pattern: '0 * * * *' },
    jobId: 'match_result_deadlines',
  });
  if (id) ids.push(id);
  return ids;
}