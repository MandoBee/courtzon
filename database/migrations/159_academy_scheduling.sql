-- ============================================================================
-- COURTZON V3 : ACADEMY G2 — RECURRING SCHEDULING + PENDING COURT HOLDS
--
-- Additive, backward-compatible, non-destructive.
-- Introduces:
--   1. academy_schedules       — Academy recurring schedule definition.
--   2. academy_group_sessions  — additive scheduling/hold columns (soft
--      `pending_court` priority holds; NEVER a paid/final booking and NEVER
--      linked to accounting/finance rows).
--
-- LOCAL DOCKER DEVELOPMENT ONLY. Migration 159 MUST NEVER be applied to
-- Hostinger / production (157/158 are legacy dev migrations).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) academy_schedules : recurring schedule definition for an Academy group.
-- ---------------------------------------------------------------------------
CREATE TABLE `academy_schedules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weekdays` set('mon','tue','wed','thu','fri','sat','sun') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `local_start_time` time NOT NULL,
  `local_end_time` time NOT NULL,
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `preferred_court_id` int unsigned DEFAULT NULL,
  `pending_priority_minutes` int unsigned NOT NULL DEFAULT '1440',
  `status` enum('active','paused','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academy_schedule_group` (`group_id`),
  KEY `idx_academy_schedule_branch` (`branch_id`),
  KEY `idx_academy_schedule_court` (`preferred_court_id`),
  KEY `idx_academy_schedule_status` (`status`),
  KEY `idx_academy_schedule_dates` (`start_date`,`end_date`),
  CONSTRAINT `fk_academy_schedule_group` FOREIGN KEY (`group_id`) REFERENCES `academy_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_academy_schedule_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_academy_schedule_court` FOREIGN KEY (`preferred_court_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_academy_schedule_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_academy_schedule_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2) academy_group_sessions : additive scheduling/hold columns.
--    reservation_status is NULL for manual sessions; recurring generated
--    sessions carry one of: pending_court | conflict | pending_expired |
--    deferred | resolved.
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_group_sessions`
  ADD COLUMN `schedule_id` int unsigned DEFAULT NULL AFTER `group_id`,
  ADD COLUMN `source_type` enum('manual','recurring') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual' AFTER `schedule_id`,
  ADD COLUMN `timezone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `end_time`,
  ADD COLUMN `start_at_utc` datetime DEFAULT NULL AFTER `timezone`,
  ADD COLUMN `end_at_utc` datetime DEFAULT NULL AFTER `start_at_utc`,
  ADD COLUMN `reservation_status` enum('pending_court','conflict','pending_expired','deferred','resolved') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `status`,
  ADD COLUMN `priority_seq` int unsigned DEFAULT NULL AFTER `reservation_status`,
  ADD COLUMN `pending_expires_at` datetime DEFAULT NULL AFTER `priority_seq`,
  ADD COLUMN `pending_resolved_at` datetime DEFAULT NULL AFTER `pending_expires_at`,
  ADD COLUMN `pending_resolved_by` int unsigned DEFAULT NULL AFTER `pending_resolved_at`,
  ADD COLUMN `original_session_date` date DEFAULT NULL AFTER `pending_resolved_by`,
  ADD COLUMN `original_start_time` time DEFAULT NULL AFTER `original_session_date`,
  ADD COLUMN `original_end_time` time DEFAULT NULL AFTER `original_start_time`,
  ADD COLUMN `original_court_id` int unsigned DEFAULT NULL AFTER `original_end_time`,
  ADD COLUMN `conflict_metadata` json DEFAULT NULL AFTER `original_court_id`,
  ADD COLUMN `generation_ref` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `conflict_metadata`,
  ADD UNIQUE KEY `uk_academy_session_generation` (`generation_ref`),
  ADD KEY `idx_academy_session_schedule` (`schedule_id`),
  ADD KEY `idx_academy_session_hold` (`court_id`,`session_date`,`reservation_status`,`pending_expires_at`),
  ADD CONSTRAINT `fk_academy_session_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `academy_schedules` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_academy_session_pending_resolved_by` FOREIGN KEY (`pending_resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- DOWN: intentionally omitted — this migration is a forward-only, additive
-- LOCAL DOCKER DEVELOPMENT migration. The baseline captures the final schema;
-- a fresh environment rebuilds from `database/baseline/001_courtzon_v3.sql`.