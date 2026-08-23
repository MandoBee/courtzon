/**
 * Main-sport / sport-interests invariant (single source of truth).
 *
 * A player's main sport is ALWAYS part of their sport interests and can never
 * appear twice. When the main sport changes, the previous main sport's
 * auto-managed interest entry is dropped; explicitly chosen secondary sports
 * are preserved untouched.
 *
 * Pure function — used by registration and profile updates, and mirrored in
 * the frontend (`frontend/src/utils/player-sports.ts`) for UI state only.
 */
export function normalizeSportInterests(
  mainSportId: number | null | undefined,
  interestedSportIds: number[] | null | undefined,
  previousMainSportId?: number | null,
): number[] {
  const valid = (v: unknown): v is number => Number.isFinite(v) && Number(v) > 0;

  let ids = Array.from(
    new Set((interestedSportIds ?? []).map(Number).filter(valid)),
  );

  const previousMain = valid(previousMainSportId) ? Number(previousMainSportId) : null;
  if (previousMain !== null) {
    // The previous main sport's entry was auto-managed — drop it on change.
    ids = ids.filter((id) => id !== previousMain);
  }

  const main = valid(mainSportId) ? Number(mainSportId) : null;
  if (main !== null) {
    ids = [main, ...ids.filter((id) => id !== main)];
  }

  return ids;
}
