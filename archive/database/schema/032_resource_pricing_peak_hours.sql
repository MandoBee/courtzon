-- ============================================================================
-- COURTZON-V2 : Add pricing type, peak hour pricing to resources
-- ============================================================================

USE courtzon_v2;

ALTER TABLE resources
  ADD COLUMN pricing_type    ENUM('per_hour','fixed') NOT NULL DEFAULT 'per_hour' AFTER hourly_price,
  ADD COLUMN peak_hour_value DECIMAL(12,2) DEFAULT NULL AFTER pricing_type;

CREATE TABLE IF NOT EXISTS resource_peak_hours (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id       INT UNSIGNED NOT NULL,
  day_of_week       TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday...6=Saturday',
  has_peak          BOOLEAN NOT NULL DEFAULT FALSE,
  start_time        TIME DEFAULT NULL,
  end_time          TIME DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_peak_hours_resource_day (resource_id, day_of_week),
  INDEX idx_peak_hours_resource (resource_id),
  CONSTRAINT fk_peak_hours_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB;
