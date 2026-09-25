import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

/**
 * Group 6 — shared, read-only tournament realtime scope resolution.
 *
 * Every tournament domain event is emitted through `emitTournamentScoped` so the
 * central SocketPublisher can route to the owning organisation/branch, the
 * creator and the affected participant users WITHOUT doing database work or
 * broadening visibility. Scope is resolved at SOURCE from the authoritative
 * tournament aggregate (no duplicate audience tables, no schema change).
 */
export type TournamentScopeSource = Pick<Tournament, 'organisation_id' | 'branch_id' | 'creator_id'>;

export function tournamentRealtimeScope(
  t: TournamentScopeSource,
  participantIds: ReadonlyArray<number | null | undefined> = [],
): {
  organisationId: number | null;
  branchId: number | null;
  creatorId: number;
  participantUserIds: number[];
} {
  const participantUserIds = participantIds
    .filter((id): id is number => id != null)
    .filter((id, index, all) => all.indexOf(id) === index);
  return {
    organisationId: t.organisation_id ?? null,
    branchId: t.branch_id ?? null,
    creatorId: t.creator_id,
    participantUserIds,
  };
}

export function emitTournamentScoped(
  eventName: string,
  payload: Record<string, unknown>,
  t: TournamentScopeSource | null | undefined,
  participantIds: ReadonlyArray<number | null | undefined> = [],
): Promise<void> {
  const scope = t ? tournamentRealtimeScope(t, participantIds) : {};
  return eventBusV2.emit(eventName, { ...payload, ...scope } as Record<string, unknown>, {
    aggregateType: 'tournament',
    aggregateId: String(payload.tournamentId),
    aggregateVersion: 1,
  });
}