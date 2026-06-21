-- ============================================================================
-- Migration 060: Coach weekly availability + blackout dates (C6)
-- ============================================================================
-- Replaces the single coach_profiles.is_available boolean (kept as a global
-- on/off master switch) with a proper schedule model:
--   * coach_availability            recurring weekly windows (per day-of-week
--                                    time ranges)
--   * coach_availability_blackouts  specific dates the coach is unavailable
-- Both reference coach_profiles(id) and cascade on delete. Brand-new tables,
-- so CREATE TABLE IF NOT EXISTS is the correct idempotent guard (safe to re-run).
-- ============================================================================

USE courtzon_v2;

CREATE TABLE IF NOT EXISTS coach_availability (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coach_id     INT UNSIGNED NOT NULL,
  day_of_week  TINYINT UNSIGNED NOT NULL,        -- 0 = Sunday .. 6 = Saturday
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coach_avail_coach (coach_id, day_of_week),
  CONSTRAINT fk_coach_avail_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coach_availability_blackouts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coach_id      INT UNSIGNED NOT NULL,
  blackout_date DATE NOT NULL,
  reason        VARCHAR(255) DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coach_blackout (coach_id, blackout_date),
  CONSTRAINT fk_coach_blackout_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
