import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

export async function cascadeUserSoftDelete(userId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE user_sessions SET is_revoked = TRUE
     WHERE user_id = ? AND is_revoked = FALSE`,
    [userId],
  );

  await db.execute(
    `UPDATE coach_sessions cs
     LEFT JOIN coach_profiles cp ON cp.id = cs.coach_id
     SET cs.status = 'cancelled'
     WHERE (cp.user_id = ? OR cs.player_id = ?)
       AND cs.status IN ('scheduled', 'confirmed', 'in_progress')`,
    [userId, userId],
  );

  await db.execute(
    `UPDATE coach_org_agreements coa
     INNER JOIN coach_profiles cp ON cp.id = coa.coach_id
     SET coa.status = 'rejected', coa.is_active = 0
     WHERE cp.user_id = ? AND coa.status = 'pending'`,
    [userId],
  );

  await db.execute(
    `UPDATE coach_profiles SET deleted_at = NOW(), is_available = 0, status = 'rejected'
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );

  await db.execute(
    `UPDATE seller_profiles SET deleted_at = NOW()
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );

  await db.execute(
    `UPDATE branch_player_access SET status = 'rejected', review_note = 'User deleted'
     WHERE player_id = ? AND status = 'pending'`,
    [userId],
  );

  await db.execute(
    `UPDATE organisation_upgrade_requests
     SET status = 'rejected',
         notes = CONCAT(COALESCE(notes, ''), ' | Requester deleted')
     WHERE requested_by = ? AND status = 'pending'`,
    [userId],
  );

  await db.execute(
    `UPDATE withdrawal_requests SET status = 'cancelled'
     WHERE user_id = ? AND status = 'pending'`,
    [userId],
  );

  await db.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);

  await db.execute(
    `UPDATE users SET account_status = 'deleted' WHERE id = ? AND deleted_at IS NULL`,
    [userId],
  );
}
