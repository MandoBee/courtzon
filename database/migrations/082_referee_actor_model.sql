-- 082_referee_actor_model.sql
-- Decouple the Referee actor from Coach by introducing a shared
-- `professional_profiles` table (August 2026).
--
-- RCA: Referee endpoints resolved the referee's identity via
-- `coach_profiles` (SELECT id FROM coach_profiles WHERE user_id = ?), making
-- an approved Coach profile a mandatory prerequisite for officiating. The
-- `referees` table (with its own `referee_availability` /
-- `referee_assignments` child tables) was schema-designed for an independent
-- Referee actor but was never wired to the backend. There is no business rule
-- tying Referee to Coach — the coupling was accidental (the controller was
-- implemented against the older, larger Coach actor). This migration restores
-- the intended independent model and removes the duplicated attribute columns
-- from `coach_profiles` in favour of a single shared abstraction.
--
-- Changes:
--   1) Create `professional_profiles` — shared professional attributes
--      (bio, experience, certifications, sports, rates, ratings, availability)
--      keyed by user_id. Single source of truth for Coach AND Referee.
--   2) Backfill `professional_profiles` from `coach_profiles` (no-op on empty
--      or already-migrated databases).
--   3) Drop the shared attribute columns from `coach_profiles`, leaving only
--      actor identity + coach-specific columns (status, is_verified,
--      rejected_reason).
--   4) Create `referee_availability_blackouts` so the Referee availability
--      feature no longer writes to coach availability tables.
--   5) Provision `referees` rows for every user holding the `referee` role
--      (identity resolution no longer depends on any other actor table).
--
-- All statements are idempotent (safe to re-run).
-- Live DB (Docker courtzon_v3) had 0 rows in every affected table — no data
-- migration risk. `tournament_matches.referee_id` / `league_matches.referee_id`
-- remain loose integer references to `referees.id` (0 matches reference them).

DROP PROCEDURE IF EXISTS migration_082;
DELIMITER $$
CREATE PROCEDURE migration_082()
BEGIN
  -- 1) Shared professional attributes table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_profiles'
  ) THEN
    CREATE TABLE `professional_profiles` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `user_id` int(10) unsigned NOT NULL,
      `bio` text DEFAULT NULL,
      `experience_years` tinyint(3) unsigned DEFAULT NULL,
      `certifications` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`certifications`)),
      `sports` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of sport_ids they officiate/coach' CHECK (json_valid(`sports`)),
      `hourly_rate` decimal(12,2) DEFAULT NULL,
      `currency_code` char(3) DEFAULT NULL,
      `rating_avg` decimal(3,2) NOT NULL DEFAULT 0.00,
      `rating_count` int(10) unsigned NOT NULL DEFAULT 0,
      `is_available` tinyint(1) NOT NULL DEFAULT 1,
      `session_durations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of available session durations in minutes, e.g. [30,60,90]' CHECK (json_valid(`session_durations`)),
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_professional_profile_user` (`user_id`),
      KEY `idx_pp_availability` (`is_available`),
      CONSTRAINT `fk_pp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  -- 2) Backfill shared attributes from coach_profiles (only if coach_profiles
  --    still carries the legacy shared columns — i.e. this migration is being
  --    applied to a pre-082 database).
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'coach_profiles'
      AND COLUMN_NAME IN ('bio', 'experience_years', 'hourly_rate')
  ) THEN
    INSERT INTO `professional_profiles`
      (user_id, bio, experience_years, certifications, sports, hourly_rate, currency_code, rating_avg, rating_count, is_available, session_durations)
    SELECT user_id, bio, experience_years, certifications, sports, hourly_rate, currency_code, rating_avg, rating_count, is_available, session_durations
    FROM `coach_profiles`
    WHERE deleted_at IS NULL
    ON DUPLICATE KEY UPDATE
      bio = VALUES(bio),
      experience_years = VALUES(experience_years),
      certifications = VALUES(certifications),
      sports = VALUES(sports),
      hourly_rate = VALUES(hourly_rate),
      currency_code = VALUES(currency_code),
      rating_avg = VALUES(rating_avg),
      rating_count = VALUES(rating_count),
      is_available = VALUES(is_available),
      session_durations = VALUES(session_durations);
  END IF;

  -- 3) Drop the duplicated shared columns from coach_profiles (guarded).
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'coach_profiles'
      AND COLUMN_NAME = 'bio'
  ) THEN
    ALTER TABLE `coach_profiles`
      DROP COLUMN `bio`,
      DROP COLUMN `experience_years`,
      DROP COLUMN `certifications`,
      DROP COLUMN `sports`,
      DROP COLUMN `hourly_rate`,
      DROP COLUMN `currency_code`,
      DROP COLUMN `rating_avg`,
      DROP COLUMN `rating_count`,
      DROP COLUMN `is_available`,
      DROP COLUMN `session_durations`;
  END IF;

  -- 4) Referee availability blackouts (mirror of coach_availability_blackouts)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referee_availability_blackouts'
  ) THEN
    CREATE TABLE `referee_availability_blackouts` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `referee_id` int(10) unsigned NOT NULL,
      `blackout_date` date NOT NULL,
      `reason` varchar(255) DEFAULT NULL,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uq_referee_blackout` (`referee_id`,`blackout_date`),
      CONSTRAINT `fk_ref_blackout_referee` FOREIGN KEY (`referee_id`) REFERENCES `referees` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  -- 5) Provision identity rows for every user holding the Referee role so the
  --    Referee module resolves independently of Coach.
  INSERT IGNORE INTO `referees` (user_id, status)
  SELECT ur.user_id, 'approved'
  FROM `user_roles` ur
  JOIN `roles` r ON r.id = ur.role_id
  WHERE r.slug = 'referee'
    AND r.deleted_at IS NULL;
END$$
DELIMITER ;
CALL migration_082();
DROP PROCEDURE migration_082;
