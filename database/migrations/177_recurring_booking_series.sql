-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 177_recurring_booking_series.sql — R2 canonical recurring booking core
-- ============================================================================
-- Introduces the recurring SERIES (the definition, NOT a booking) and a
-- nullable loose reference on bookings so every generated occurrence is a
-- normal canonical `bookings` row.
--
--   booking_series            (the recurring definition)
--        1
--        |
--        +---- N  bookings.series_id  (one canonical booking per occurrence)
--
-- Fully additive:
--   - no existing table/column is rewritten
--   - existing bookings keep series_id = NULL and behave exactly as before
--   - new unique key uk_booking_series_occurrence (series_id, booking_date,
--     start_time) gives every occurrence deterministic identity and makes a
--     retry incapable of inserting a duplicate occurrence booking (NULL
--     series_id rows are unaffected by the unique key).
--   - idempotency_key on booking_series lets a full create-retry return the
--     already-created series instead of duplicating it.
-- ============================================================================

CREATE TABLE booking_series (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id        CHAR(36) NOT NULL,
  organisation_id  BIGINT UNSIGNED NOT NULL,
  branch_id        INT UNSIGNED NOT NULL,
  resource_id      BIGINT UNSIGNED NOT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  recurrence_type  ENUM('weekly') NOT NULL DEFAULT 'weekly',
  weekdays         SET('mon','tue','wed','thu','fri','sat','sun') NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  timezone         VARCHAR(64) NOT NULL,
  status           ENUM('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
  idempotency_key  VARCHAR(64) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_booking_series_public_id (public_id),
  UNIQUE KEY uk_booking_series_idempotency (idempotency_key),
  KEY idx_bs_org (organisation_id),
  KEY idx_bs_branch (branch_id),
  KEY idx_bs_resource (resource_id),
  KEY idx_bs_creator (created_by),
  KEY idx_bs_status_org (status, organisation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nullable series reference on the canonical booking occurrence. No FK on
-- purpose: `bookings` is a loose-reference/financial-history table (no FKs)
-- and deleting a series must never cascade-delete booking history.
ALTER TABLE bookings
  ADD COLUMN series_id BIGINT UNSIGNED NULL AFTER aggregate_version,
  ADD UNIQUE KEY uk_booking_series_occurrence (series_id, booking_date, start_time);