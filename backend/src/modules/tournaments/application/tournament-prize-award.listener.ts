import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { tournamentPrizeAwardService } from './tournament-prize-award.service.js';

const log = createModuleLogger('tournament-prize-award');

let registered = false;

/**
 * G11.5 — Prize payout binding listeners.
 *
 * Award obligations bind when a standings-backed tournament's final rankings
 * are locked (Q1b):
 *   - `tournament:standings-finalized` — emitted by the RR operator `complete()`
 *     path (round-robin tournaments lock their final ranking there).
 *   - `tournament:completed` — emitted by the bracket engine auto-completion
 *     path; bracket tournaments materialize no standings rows, so this is a
 *     natural no-op (their winners are granted manually — Phase-1 gap).
 *
 * Binding is fully idempotent (award rows, wallet credits, accounting postings
 * and entitlements are all self-guarded), so replaying either signal is safe.
 */
export function registerTournamentPrizeListeners(): void {
  if (registered) {
    log.info('Tournament prize listeners already registered — skip');
    return;
  }
  registered = true;

  eventBusV2.on('tournament:standings-finalized', async (data) => {
    const tournamentId = Number(data.tournamentId);
    if (!tournamentId) return;
    try {
      const awards = await tournamentPrizeAwardService.bindAwardsForTournament(tournamentId);
      log.info({ tournamentId, count: awards.length }, 'Prize awards bound from finalized standings');
    } catch (err) {
      log.error({ err, tournamentId }, 'Failed to bind prize awards from standings-finalized');
    }
  });

  eventBusV2.on('tournament:completed', async (data) => {
    const tournamentId = Number(data.tournamentId);
    if (!tournamentId) return;
    try {
      const awards = await tournamentPrizeAwardService.bindAwardsForTournament(tournamentId);
      log.info({ tournamentId, count: awards.length }, 'Prize awards bound from tournament completion');
    } catch (err) {
      log.error({ err, tournamentId }, 'Failed to bind prize awards from tournament:completed');
    }
  });
}

/** Test-only reset so integration tests can re-register listeners deterministically. */
export function resetTournamentPrizeListenersForTest(): void {
  registered = false;
}