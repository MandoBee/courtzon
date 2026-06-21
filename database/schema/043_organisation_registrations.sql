-- ============================================================================
-- COURTZON-V2 : Unified organisation registration approvals
--  - Tracks all pending org registrations (player, seller, organization)
--  - Extends organisation_upgrade_requests for the upgrade path
-- ============================================================================

USE courtzon_v2;

-- 0. Create table if it doesn't exist (safe on fresh seed where 027 was SKIPped)
CREATE TABLE IF NOT EXISTS organisation_upgrade_requests (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id       INT UNSIGNED NOT NULL,
  requested_by          INT UNSIGNED NOT NULL,
  requested_plan_id     BIGINT UNSIGNED DEFAULT NULL,
  status                ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  notes                 TEXT DEFAULT NULL,
  approved_by           INT UNSIGNED DEFAULT NULL,
  approved_at           TIMESTAMP NULL DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org (organisation_id),
  INDEX idx_status (status),
  CONSTRAINT fk_upr_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_upr_user FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_upr_plan FOREIGN KEY (requested_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_upr_admin FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 1. Add registration_type + metadata columns to organisation_upgrade_requests
--    (reusing this table for all approval types)
ALTER TABLE organisation_upgrade_requests
  ADD COLUMN registration_type ENUM('player','seller','organization','upgrade') NOT NULL DEFAULT 'upgrade'
  AFTER organisation_id,
  ADD COLUMN metadata JSON DEFAULT NULL COMMENT 'Additional registration data (payment_method, shop_name, etc.)'
  AFTER notes,
  ADD INDEX idx_registration_type (registration_type);

-- 2. Ensure organisation_subscriptions has 'pending' status
ALTER TABLE organisation_subscriptions
  MODIFY COLUMN subscription_status ENUM('active','expired','cancelled','pending') NOT NULL DEFAULT 'pending';

-- 3. Add org_type_id FK index on organisation_upgrade_requests (for requested org type on organization reg)
ALTER TABLE organisation_upgrade_requests
  ADD COLUMN requested_org_type_id INT UNSIGNED DEFAULT NULL AFTER requested_by,
  ADD CONSTRAINT fk_upr_orgtype FOREIGN KEY (requested_org_type_id) REFERENCES organisation_types(id) ON DELETE SET NULL;

-- 4. Add chosen_payment_method to track which payment method was selected
ALTER TABLE organisation_upgrade_requests
  ADD COLUMN chosen_payment_method VARCHAR(100) DEFAULT NULL AFTER requested_plan_id;
