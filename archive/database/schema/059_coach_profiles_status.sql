-- ============================================================================
-- Migration 059: Coach model consolidation (coach_profiles = source of truth)
-- ============================================================================
-- Eliminates the dual modeling between player_profiles.(is_coach, coach_status,
-- coach_rejected_reason) and coach_profiles. Moves coach approval state onto
-- coach_profiles so it is the single source of truth:
--   * status          ENUM('none','pending','approved','rejected')
--   * rejected_reason  VARCHAR(500)
-- Backfills from the legacy player_profiles columns. The legacy columns are
-- kept (dual-written by the app for one transition) and will be dropped by a
-- later migration once no code reads them.
-- Idempotent + column-aware (safe to re-run).
-- ============================================================================

USE courtzon_v2;

DROP PROCEDURE IF EXISTS cz_add_column;

DELIMITER //

CREATE PROCEDURE cz_add_column(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_def VARCHAR(255))
BEGIN
  DECLARE v INT DEFAULT 0;
  SELECT COUNT(*) INTO v FROM information_schema.COLUMNS
   WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_col;
  IF v = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_col, ' ', p_def);
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END//

DELIMITER ;

CALL cz_add_column('coach_profiles', 'status', "ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none' AFTER is_verified");
CALL cz_add_column('coach_profiles', 'rejected_reason', 'VARCHAR(500) DEFAULT NULL AFTER status');

DROP PROCEDURE IF EXISTS cz_add_column;

DROP PROCEDURE IF EXISTS cz_add_index;

DELIMITER //

CREATE PROCEDURE cz_add_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_cols VARCHAR(255))
BEGIN
  DECLARE v INT DEFAULT 0;
  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE table_schema = DATABASE() AND table_name = p_table AND index_name = p_index;
  IF v = 0 THEN
    SET @ddl = CONCAT('CREATE INDEX ', p_index, ' ON ', p_table, ' (', p_cols, ')');
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END//

DELIMITER ;

-- Backfill approval state from the legacy player_profiles columns.
UPDATE coach_profiles cp
  JOIN player_profiles pp ON pp.user_id = cp.user_id
   SET cp.status = pp.coach_status,
       cp.rejected_reason = pp.coach_rejected_reason
 WHERE cp.status = 'none';

-- Any coach_profiles row with no player_profiles coach state but is verified
-- should be considered approved (defensive backfill).
UPDATE coach_profiles SET status = 'approved'
 WHERE status = 'none' AND is_verified = 1;

CALL cz_add_index('coach_profiles', 'idx_coach_profiles_status', 'status');

DROP PROCEDURE IF EXISTS cz_add_index;
