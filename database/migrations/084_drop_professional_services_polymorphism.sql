-- 084_drop_professional_services_polymorphism.sql
-- Replace the polymorphic (actor_type, actor_id) association with a clean
-- FK-only model: `professional_profile_id` → `professional_profiles.id`.
--
-- RCA: The `professional_profiles` table is the canonical shared identity
-- for every professional actor. A User who is both a Coach and a Referee
-- has ONE `professional_profiles` row (UNIQUE user_id). The service row
-- should reference that single row via a real FK — not a loose
-- (type, id) couplet that carries no referential guarantee.
--
-- `service_key` now disambiguates actor-level services when a profile
-- is shared (e.g. 'coach_default' vs 'referee_match_fee').
--
-- Changes:
--   1) Prefix existing `service_key` values with the actor type
--      ('default' → 'coach_default', 'session_30min' → 'coach_session_30min').
--   2) Drop the polymorphic columns `actor_type` and `actor_id`.
--   3) Replace the old unique key with `(professional_profile_id, service_key)`.
--
-- All statements are idempotent (safe to re-run).

DROP PROCEDURE IF EXISTS migration_084;
DELIMITER $$
CREATE PROCEDURE migration_084()
BEGIN
  -- 1) Prefix existing service keys (safe to re-run — CONCAT only applied
  --    where the prefix is not already present).
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_services'
      AND COLUMN_NAME = 'actor_type'
  ) THEN
    UPDATE `professional_services`
    SET `service_key` = CONCAT(`actor_type`, '_', `service_key`)
    WHERE `service_key` NOT LIKE CONCAT(`actor_type`, '\_%') ESCAPE '\\'
       OR `service_key` REGEXP '^[a-z]+_[a-z]+' = 0;
  END IF;

  -- 2) Drop the polymorphic columns (guarded)
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_services'
      AND COLUMN_NAME = 'actor_type'
  ) THEN
    -- Must drop the old UK first since it references actor_type
    ALTER TABLE `professional_services`
      DROP INDEX `uk_service`;

    ALTER TABLE `professional_services`
      DROP COLUMN `actor_type`,
      DROP COLUMN `actor_id`;
  END IF;

  -- 3) Ensure the clean unique key exists
  SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_services'
      AND INDEX_NAME = 'uk_service');
  IF @uk_exists = 0 THEN
    ALTER TABLE `professional_services`
      ADD UNIQUE KEY `uk_service` (`professional_profile_id`,`service_key`);
  END IF;

  -- 4) Drop the composite active index (was on actor_type+actor_id+is_active)
  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_services'
      AND INDEX_NAME = 'idx_ps_active'
  ) THEN
    ALTER TABLE `professional_services` DROP INDEX `idx_ps_active`;
  END IF;
  -- Replace with profile-scoped active index
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'professional_services'
      AND INDEX_NAME = 'idx_ps_profile_active'
  ) THEN
    ALTER TABLE `professional_services`
      ADD KEY `idx_ps_profile_active` (`professional_profile_id`,`is_active`);
  END IF;
END$$
DELIMITER ;
CALL migration_084();
DROP PROCEDURE migration_084;
