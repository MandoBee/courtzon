-- 128_subscription_status_suspended_order.sql
-- Bring organisation_subscriptions.subscription_status to the intended
-- canonical ENUM order.
--
-- Background:
--   Migration 127 was recorded in migration_history (Local + Production) with a
--   hash that does not match the committed file, and its ALTER was NEVER actually
--   executed — both environments still have the 4-value ENUM
--   ('active','expired','cancelled','pending').
--
--   Per policy, migration 127 is treated as immutable and is NOT re-executed.
--   This migration performs the single authoritative ALTER that brings the
--   schema directly to the intended final ENUM:
--
--     ('active','suspended','pending','expired','cancelled')
--
--   Only the enum definition changes; existing rows keep their values and
--   DEFAULT 'pending' is preserved.

ALTER TABLE `organisation_subscriptions`
  MODIFY COLUMN `subscription_status`
    ENUM('active','suspended','pending','expired','cancelled')
    NOT NULL DEFAULT 'pending';

-- DOWN: revert to the schema state that migration 127 intended to produce.
-- NOTE: DOWN statements are commented out (repo convention, see migration 090)
-- so that `mysql < file` during apply executes ONLY the UP migration.
-- `migrate.sh --rollback` extracts this section to revert.
-- ALTER TABLE `organisation_subscriptions`
--   MODIFY COLUMN `subscription_status`
--     ENUM('active','expired','cancelled','pending','suspended')
--     NOT NULL DEFAULT 'pending';
