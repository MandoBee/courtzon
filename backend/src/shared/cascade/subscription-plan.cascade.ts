import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

/** Run before hard-deleting a subscription plan row. */
export async function cascadeSubscriptionPlanDelete(planId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE organisation_subscriptions
     SET subscription_status = 'cancelled', auto_renew = 0, updated_at = NOW()
     WHERE plan_id = ? AND subscription_status IN ('active', 'pending')`,
    [planId],
  );
}
