import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

/**
 * Application-level cascade when an organisation is soft-deleted.
 * DB ON DELETE CASCADE only runs on hard DELETE; most entities use deleted_at.
 */
export async function cascadeOrganisationSoftDelete(
  organisationId: number,
  conn?: CascadeExec,
): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE organisation_subscriptions
     SET subscription_status = 'cancelled', auto_renew = 0, updated_at = NOW()
     WHERE organisation_id = ? AND subscription_status IN ('active', 'pending')`,
    [organisationId],
  );

  await db.execute(
    `UPDATE organisation_upgrade_requests
     SET status = 'rejected',
         notes = CONCAT(COALESCE(notes, ''), ' | Organisation deleted'),
         approved_at = COALESCE(approved_at, NOW())
     WHERE organisation_id = ? AND status = 'pending'`,
    [organisationId],
  );

  await db.execute(
    `UPDATE coach_org_agreements
     SET status = 'rejected', is_active = 0
     WHERE organisation_id = ? AND status = 'pending'`,
    [organisationId],
  );

  await db.execute(
    `UPDATE resources r
     INNER JOIN branches b ON b.id = r.branch_id
     SET r.deleted_at = NOW(), r.is_active = 0
     WHERE b.organisation_id = ? AND r.deleted_at IS NULL`,
    [organisationId],
  );

  await db.execute(
    `UPDATE branches SET deleted_at = NOW(), is_active = 0
     WHERE organisation_id = ? AND deleted_at IS NULL`,
    [organisationId],
  );

  await db.execute(
    `UPDATE products SET deleted_at = NOW(), is_active = 0
     WHERE seller_id = ? AND deleted_at IS NULL`,
    [organisationId],
  );

  await db.execute(
    `UPDATE tournaments SET deleted_at = NOW(), status = 'cancelled'
     WHERE organisation_id = ? AND deleted_at IS NULL`,
    [organisationId],
  );

  await db.execute(
    `UPDATE academies SET deleted_at = NOW(), is_active = 0
     WHERE organisation_id = ? AND deleted_at IS NULL`,
    [organisationId],
  );

  await db.execute(
    `UPDATE organisations SET is_active = 0, is_verified = 0
     WHERE id = ? AND deleted_at IS NULL`,
    [organisationId],
  );
}
