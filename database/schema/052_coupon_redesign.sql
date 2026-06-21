-- ============================================================================
-- Coupon Redesign: Add activity_type, sport_id columns + coupon_assignments
-- ============================================================================

ALTER TABLE coupons
  ADD COLUMN activity_type VARCHAR(100) DEFAULT NULL COMMENT 'e.g. booking, marketplace, tournament, academy' AFTER discount_value,
  ADD COLUMN sport_id INT UNSIGNED DEFAULT NULL AFTER activity_type,
  ADD INDEX idx_coupon_activity (activity_type),
  ADD INDEX idx_coupon_sport (sport_id);

-- Coupon assignments (which orgs/branches/resources a coupon applies to)
CREATE TABLE IF NOT EXISTS coupon_assignments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id         INT UNSIGNED NOT NULL,
  entity_type       ENUM('organisation','branch','resource') NOT NULL,
  entity_id         INT UNSIGNED NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupon_entity (coupon_id, entity_type, entity_id),
  CONSTRAINT fk_ca_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  INDEX idx_ca_entity (entity_type, entity_id),
  INDEX idx_ca_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
