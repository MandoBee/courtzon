import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

export async function cascadeTournamentSoftDelete(tournamentId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE tournament_registrations SET status = 'withdrawn'
     WHERE tournament_id = ? AND status IN ('registered', 'confirmed')`,
    [tournamentId],
  );

  await db.execute(
    `UPDATE tournament_matches SET status = 'cancelled'
     WHERE tournament_id = ? AND status IN ('scheduled', 'in_progress')`,
    [tournamentId],
  );

  await db.execute(
    `UPDATE tournaments SET status = 'cancelled' WHERE id = ?`,
    [tournamentId],
  );
}

export async function cascadeAcademySoftDelete(academyId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE academy_enrollments SET status = 'dropped'
     WHERE academy_id = ? AND status IN ('active', 'waitlisted')`,
    [academyId],
  );

  await db.execute(
    `UPDATE academies SET is_active = 0 WHERE id = ?`,
    [academyId],
  );
}

export async function cascadeCoachProfileSoftDelete(coachId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE coach_org_agreements SET status = 'rejected', is_active = 0
     WHERE coach_id = ? AND status = 'pending'`,
    [coachId],
  );

  await db.execute(
    `UPDATE coach_sessions SET status = 'cancelled'
     WHERE coach_id = ? AND status IN ('scheduled', 'confirmed', 'in_progress')`,
    [coachId],
  );

  await db.execute(
    `UPDATE coach_profiles SET is_available = 0, status = 'rejected'
     WHERE id = ? AND deleted_at IS NULL`,
    [coachId],
  );
}
