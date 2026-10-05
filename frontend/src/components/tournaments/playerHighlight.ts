/**
 * Shared player identity check for tournament bracket UI.
 * The current user is compared to player/user ids exposed by the backend
 * (`player_id`, `player1_id`, `player2_id`). No backend change required.
 */
export function isCurrentUser(playerUserId?: number | null, currentUserId?: number | null): boolean {
  if (currentUserId == null || playerUserId == null) return false;
  return Number(playerUserId) === Number(currentUserId);
}