-- Migration 033: Coach Collaboration Flow
-- Adds state machine columns to coach_sessions and creates immutable timeline.
-- Idempotent: safe to re-run.

-- ── 1. Add state machine columns to coach_sessions ──────────────────────────

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coach_sessions' AND COLUMN_NAME = 'requested_at'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE coach_sessions
   ADD COLUMN requested_at TIMESTAMP NULL DEFAULT NULL AFTER status,
   ADD COLUMN responded_at TIMESTAMP NULL DEFAULT NULL AFTER requested_at,
   ADD COLUMN proposal_viewed_at TIMESTAMP NULL DEFAULT NULL AFTER responded_at,
   ADD COLUMN confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER proposal_viewed_at,
   ADD COLUMN hold_expires_at TIMESTAMP NULL DEFAULT NULL AFTER confirmed_at,
   ADD COLUMN proposed_start_time DATETIME NULL DEFAULT NULL AFTER hold_expires_at,
   ADD COLUMN proposed_end_time DATETIME NULL DEFAULT NULL AFTER proposed_start_time,
   ADD COLUMN proposed_court_id INT NULL DEFAULT NULL AFTER proposed_end_time,
   ADD COLUMN cancelled_by VARCHAR(20) NULL DEFAULT NULL AFTER proposed_court_id,
   ADD COLUMN cancellation_reason VARCHAR(255) NULL DEFAULT NULL AFTER cancelled_by,
   ADD INDEX idx_coach_sessions_status (status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. Create coach_session_events (immutable append-only audit trail) ──────

SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coach_session_events'
);

SET @sql = IF(@table_exists = 0,
  'CREATE TABLE coach_session_events (
     id          BIGINT AUTO_INCREMENT PRIMARY KEY,
     session_id  INT UNSIGNED NOT NULL,
     event       VARCHAR(50) NOT NULL,
     actor_id    INT NULL,
     actor_role  VARCHAR(20) NULL,
     metadata    JSON NULL,
     created_at  TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
     INDEX idx_cse_session (session_id, created_at),
     CONSTRAINT fk_cse_session FOREIGN KEY (session_id) REFERENCES coach_sessions(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
