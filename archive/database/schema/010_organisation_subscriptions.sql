-- ============================================================================
-- COURTZON-V2 : ORGANISATION SUBSCRIPTIONS
-- Tracks which organisation has which subscription plan.
-- Replaces the missing `subscriptions` table that code referenced.
-- ============================================================================

USE courtzon_v2;

CREATE TABLE IF NOT EXISTS organisation_subscriptions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id       INT UNSIGNED NOT NULL,
  plan_id               BIGINT UNSIGNED NOT NULL,
  start_date            DATE DEFAULT NULL,
  end_date              DATE DEFAULT NULL,
  subscription_status   ENUM('active','expired','cancelled') DEFAULT 'active',
  auto_renew            TINYINT(1) DEFAULT 1,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_organisation (organisation_id),
  INDEX idx_plan (plan_id),
  INDEX idx_status (subscription_status),
  CONSTRAINT fk_os_organisation FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_os_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
