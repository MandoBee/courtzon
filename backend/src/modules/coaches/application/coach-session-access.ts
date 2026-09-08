import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { isPlatformAdmin } from '../../../shared/middleware/org-access.js';

export type CoachSessionActorRole = 'coach' | 'player' | 'admin';

export interface CoachSessionActor {
  id: number;
  role: CoachSessionActorRole;
}

export interface SessionMutationPolicy {
  coach?: boolean;
  player?: boolean;
  admin?: boolean;
}

/**
 * Authorize a coach-session lifecycle mutation.
 *
 * Loads the session ONCE with the owning coach's user id resolved through
 * coach_profiles.user_id, then derives the caller's real role server-side
 * (never trusting a client-supplied role) and enforces the endpoint's policy.
 *
 * - unknown session            → NotFoundError (404)
 * - actor not permitted by the endpoint policy → ForbiddenError (403)
 * - otherwise                  → { id, role } describing the REAL authenticated
 *   actor, for correct audit/timeline identity.
 *
 * Ownership is strict session ownership (coach_profiles.user_id / player_id) —
 * organisation or branch membership never substitutes for it.
 */
export async function authorizeCoachSessionMutation(
  sessionId: number,
  userId: number,
  policy: SessionMutationPolicy,
): Promise<CoachSessionActor> {
  const pool = getPool();
  const [rows] = await pool.execute<any>(
    `SELECT cs.*, cp.user_id AS coach_user_id
     FROM coach_sessions cs
     LEFT JOIN coach_profiles cp ON cp.id = cs.coach_id
     WHERE cs.id = ?`,
    [sessionId],
  );
  if (!rows.length) throw new NotFoundError('Coach session');

  const session = rows[0];
  const isCoachOwner = Number(session.coach_user_id) === Number(userId);
  const isPlayerOwner = Number(session.player_id) === Number(userId);
  const isAdmin = await isPlatformAdmin(userId);

  let role: CoachSessionActorRole | null = null;
  if (isAdmin && policy.admin) {
    role = 'admin';
  } else if (isCoachOwner && policy.coach) {
    role = 'coach';
  } else if (isPlayerOwner && policy.player) {
    role = 'player';
  }

  if (!role) {
    throw new ForbiddenError('You are not authorized to modify this session');
  }

  return { id: userId, role };
}