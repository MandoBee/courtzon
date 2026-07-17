-- Enhance subscription requests with immutable snapshots, audit columns, cancellation support

-- Extend status enum to include 'cancelled'
ALTER TABLE organisation_upgrade_requests
  MODIFY COLUMN `status` ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending';

-- Immutable plan snapshots (populated at request creation time)
ALTER TABLE organisation_upgrade_requests
  ADD COLUMN `current_plan_name` VARCHAR(255) DEFAULT NULL AFTER `current_plan_id`,
  ADD COLUMN `current_price` DECIMAL(12,2) DEFAULT NULL AFTER `current_plan_name`,
  ADD COLUMN `current_billing_cycle` VARCHAR(50) DEFAULT NULL AFTER `current_price`,
  ADD COLUMN `requested_plan_name` VARCHAR(255) DEFAULT NULL AFTER `requested_plan_id`,
  ADD COLUMN `requested_price` DECIMAL(12,2) DEFAULT NULL AFTER `requested_plan_name`,
  ADD COLUMN `requested_billing_cycle` VARCHAR(50) DEFAULT NULL AFTER `requested_price`,
  ADD COLUMN `approval_notes` TEXT DEFAULT NULL AFTER `approved_at`,
  ADD COLUMN `rejection_reason` TEXT DEFAULT NULL AFTER `approval_notes`,
  ADD COLUMN `cancelled_by` INT(10) UNSIGNED DEFAULT NULL AFTER `rejection_reason`,
  ADD COLUMN `cancelled_at` TIMESTAMP NULL DEFAULT NULL AFTER `cancelled_by`,
  ADD COLUMN `cancellation_reason` TEXT DEFAULT NULL AFTER `cancelled_at`,
  ADD KEY `fk_upr_canceller` (`cancelled_by`),
  ADD CONSTRAINT `fk_upr_canceller` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
