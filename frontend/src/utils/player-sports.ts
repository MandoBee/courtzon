/**
 * Main-sport / sport-interests invariant (UI side).
 *
 * Mirrors `backend/src/modules/auth/domain/sport-interests.ts` — the backend
 * remains the authoritative enforcement point; these helpers keep the
 * registration and profile forms consistent with it:
 *   - the main sport is ALWAYS part of the player's interests;
 *   - the main sport is never selectable as a secondary interest;
 *   - changing the main sport moves the auto-managed entry (previous main
 *     sport's entry is dropped, explicit secondary selections are preserved);
 *   - no duplicates are ever produced.
 */

const toValidId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Full persisted interest list = main sport first + unique secondaries. */
export function withMainSportInterest(
  mainSportId: number | null | undefined,
  interestedSportIds: number[] | null | undefined,
): number[] {
  const ids = Array.from(new Set((interestedSportIds ?? []).map(toValidId).filter((v): v is number => v !== null)));
  const main = toValidId(mainSportId);
  if (main === null) return ids;
  return [main, ...ids.filter((id) => id !== main)];
}

/** Sports offered as SECONDARY interests (the main sport is excluded). */
export function selectableInterestSports<T extends { id: number }>(
  sports: T[],
  mainSportId: number | null | undefined,
): T[] {
  const main = toValidId(mainSportId);
  return main === null ? sports : sports.filter((s) => s.id !== main);
}

/**
 * Interest-list update after the player picks a new main sport.
 * Drops the previous main sport's auto-managed entry and ensures the new one.
 */
export function applyMainSportChange(
  previousMainSportId: number | null | undefined,
  nextMainSportId: number | null | undefined,
  interestedSportIds: number[] | null | undefined,
): number[] {
  const prev = toValidId(previousMainSportId);
  let ids = Array.from(new Set((interestedSportIds ?? []).map(toValidId).filter((v): v is number => v !== null)));
  if (prev !== null) ids = ids.filter((id) => id !== prev);
  return withMainSportInterest(nextMainSportId, ids);
}
