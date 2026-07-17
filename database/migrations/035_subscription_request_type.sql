-- Add request_type and current_plan_id to organisation_upgrade_requests
-- to support NEW_SUBSCRIPTION vs PLAN_CHANGE requests.
-- request_type: 'NEW_SUBSCRIPTION' (org has no active sub) or 'PLAN_CHANGE' (org has active sub)
-- current_plan_id: snapshot of the org's plan_id at request time (for PLAN_CHANGE)

ALTER TABLE organisation_upgrade_requests
  ADD COLUMN `request_type` ENUM('NEW_SUBSCRIPTION','PLAN_CHANGE') DEFAULT NULL AFTER `registration_type`,
  ADD COLUMN `current_plan_id` BIGINT(20) UNSIGNED DEFAULT NULL AFTER `requested_plan_id`,
  ADD INDEX `idx_request_type` (`request_type`);

-- Backfill existing 'upgrade' registration_type rows as PLAN_CHANGE
UPDATE organisation_upgrade_requests
SET request_type = 'PLAN_CHANGE'
WHERE registration_type = 'upgrade' AND request_type IS NULL;
