-- 083_professional_services.sql
-- Extract pricing and service configuration from professional_profiles into a
-- dedicated `professional_services` table (August 2026).
--
-- RCA: `professional_profiles` carried `hourly_rate`, `currency_code`, and
-- `session_durations` — attributes that are NOT universal across professional
-- actors. Referee and Umpire charge per match; Nutritionist charges per
-- consultation; Physiotherapist sells packages. Embedding rate data in the
-- shared profile table forces every non-hourly actor to carry dead columns
-- and requires schema redesign for every new actor type with a novel pricing
-- model.
--
-- This migration introduces `professional_services` as an extensible pricing
-- catalogue, keyed by (actor_type, actor_id, service_key). A Coach can have a
-- 'default' hourly service; a Referee can have a 'match_fee' fixed-price
-- service; future actors add rows with their own pricing models — zero schema
-- changes needed.
--
-- Changes:
--   1) Create `professional_services` table (pricing_model ENUM supporting
--      hourly, session, match, fixed, package, consultation).
--   2) Backfill existing coach pricing from `professional_profiles` into
--      `professional_services` (one 'default' hourly service per coach).
--   3) Drop `hourly_rate`, `currency_code`, `session_durations` from
--      `professional_profiles` — these now live in `professional_services`.
--   4) Rename `professional_profiles.bio` to `professional_bio` for semantic
--      clarity (distinguishes from `player_profiles.bio` — player social bio).
--
-- All statements are idempotent (safe to re-run).

DROP PROCEDURE IF EXISTS migration_083;
DELIMITER $$
CREATE PROCEDURE migration_083()
BEGIN
  -- 1) Pricing catalogue
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_services'
  ) THEN
    CREATE TABLE `professional_services` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `professional_profile_id` int(10) unsigned NOT NULL,
      `actor_type` varchar(30) NOT NULL COMMENT "'coach' | 'referee' | 'trainer' | 'physiotherapist' | …",
      `actor_id` int(10) unsigned NOT NULL COMMENT "FK into the actor-type's identity table (coach_profiles.id, referees.id, …)",
      `service_key` varchar(50) NOT NULL COMMENT "Stable key e.g. 'default', 'match_fee', '60min_session'",
      `label` varchar(100) DEFAULT NULL COMMENT "Human-readable label",
      `pricing_model` enum('hourly','session','match','fixed','package','consultation') NOT NULL,
      `price` decimal(12,2) NOT NULL DEFAULT 0.00,
      `currency_code` char(3) NOT NULL DEFAULT 'EGP',
      `duration_minutes` int(10) unsigned DEFAULT NULL COMMENT "Session duration in minutes (NULL for non-session models)",
      `is_active` tinyint(1) NOT NULL DEFAULT 1,
      `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_service` (`actor_type`,`actor_id`,`service_key`),
      KEY `idx_ps_pp` (`professional_profile_id`),
      KEY `idx_ps_active` (`actor_type`,`actor_id`,`is_active`),
      CONSTRAINT `fk_ps_pp` FOREIGN KEY (`professional_profile_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  -- 2) Backfill existing coaches from pp → ps (only if pp still has the columns)
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_profiles'
      AND COLUMN_NAME = 'hourly_rate'
  ) THEN
    INSERT INTO `professional_services`
      (professional_profile_id, actor_type, actor_id, service_key, label, pricing_model, price, currency_code, duration_minutes, is_active)
    SELECT pp.id, 'coach', cp.id, 'default', NULL,
           'hourly', COALESCE(pp.hourly_rate, 0),
           COALESCE(pp.currency_code, 'EGP'), NULL, (CASE WHEN pp.hourly_rate IS NOT NULL THEN 1 ELSE 0 END)
    FROM `professional_profiles` pp
    JOIN `coach_profiles` cp ON cp.user_id = pp.user_id
    WHERE cp.deleted_at IS NULL
    ON DUPLICATE KEY UPDATE
      price = VALUES(price),
      currency_code = VALUES(currency_code),
      is_active = VALUES(is_active);
  END IF;

  -- 3) Drop the pricing columns from professional_profiles (guarded)
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_profiles'
      AND COLUMN_NAME = 'hourly_rate'
  ) THEN
    ALTER TABLE `professional_profiles`
      DROP COLUMN `hourly_rate`,
      DROP COLUMN `currency_code`,
      DROP COLUMN `session_durations`;
  END IF;

  -- 4) Rename bio → professional_bio for semantic clarity (guarded)
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_profiles'
      AND COLUMN_NAME = 'bio'
  ) THEN
    ALTER TABLE `professional_profiles`
      CHANGE COLUMN `bio` `professional_bio` text DEFAULT NULL;
  END IF;
END$$
DELIMITER ;
CALL migration_083();
DROP PROCEDURE migration_083;
