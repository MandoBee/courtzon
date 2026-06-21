-- ============================================================================
-- Migration 056: Reconcile `settlements` schema
-- ============================================================================
-- Background: `settlements` was created twice with conflicting shapes:
--   * 007_financial.sql  -> club_id, settlement_type, settlement_period_*,
--                           gross_amount, commission_amount, net_amount,
--                           settlement_status, processed_at, created_at
--   * 037_settlements.sql -> organisation_id, amount, fee, net_amount, status,
--                           notes, requested_at/approved_at/paid_at/...
--     (037 uses CREATE TABLE IF NOT EXISTS, so on any DB that already ran 007
--      it is SILENTLY SKIPPED.)
--
-- The application code (settlement.repository.ts) expects a SUPERSET:
--   organisation_id, settlement_type, settlement_period_start,
--   settlement_period_end, gross_amount, commission_amount, net_amount,
--   settlement_status, processed_at, notes.
--
-- On a 007-shaped DB the INSERT would fail (no organisation_id). This migration
-- makes the existing `settlements` table a superset, idempotently and
-- column-aware, then backfills organisation_id from legacy club_id.
-- ============================================================================

USE courtzon_v2;

DROP PROCEDURE IF EXISTS cz_add_column;
DROP PROCEDURE IF EXISTS cz_copy_col;
DROP PROCEDURE IF EXISTS cz_add_idx;

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

CREATE PROCEDURE cz_copy_col(IN p_table VARCHAR(64), IN p_from VARCHAR(64), IN p_to VARCHAR(64))
BEGIN
  DECLARE vf INT DEFAULT 0; DECLARE vt INT DEFAULT 0;
  SELECT COUNT(*) INTO vf FROM information_schema.COLUMNS
   WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_from;
  SELECT COUNT(*) INTO vt FROM information_schema.COLUMNS
   WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_to;
  IF vf = 1 AND vt = 1 THEN
    SET @ddl = CONCAT('UPDATE ', p_table, ' SET ', p_to, ' = ', p_from, ' WHERE ', p_to, ' IS NULL');
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END//

CREATE PROCEDURE cz_add_idx(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_col VARCHAR(64), IN p_ddl VARCHAR(255))
BEGIN
  DECLARE v_idx INT DEFAULT 0; DECLARE v_col INT DEFAULT 0;
  SELECT COUNT(*) INTO v_idx FROM information_schema.STATISTICS
   WHERE table_schema = DATABASE() AND table_name = p_table AND index_name = p_index;
  SELECT COUNT(*) INTO v_col FROM information_schema.COLUMNS
   WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_col;
  IF v_idx = 0 AND v_col = 1 THEN
    SET @ddl = CONCAT('CREATE INDEX ', p_index, ' ON ', p_table, ' ', p_ddl);
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END//

DELIMITER ;

-- Ensure all columns the application expects exist (added nullable/with default
-- so ALTER succeeds on populated tables).
CALL cz_add_column('settlements','organisation_id','INT UNSIGNED NULL');
CALL cz_add_column('settlements','settlement_type','VARCHAR(50) NULL');
CALL cz_add_column('settlements','settlement_period_start','DATE NULL');
CALL cz_add_column('settlements','settlement_period_end','DATE NULL');
CALL cz_add_column('settlements','gross_amount','DECIMAL(14,2) NOT NULL DEFAULT 0.00');
CALL cz_add_column('settlements','commission_amount','DECIMAL(14,2) NOT NULL DEFAULT 0.00');
CALL cz_add_column('settlements','net_amount','DECIMAL(14,2) NOT NULL DEFAULT 0.00');
CALL cz_add_column('settlements','settlement_status',"ENUM('pending','processing','completed','failed','approved','paid','rejected','cancelled') NOT NULL DEFAULT 'pending'");
CALL cz_add_column('settlements','processed_at','TIMESTAMP NULL DEFAULT NULL');
CALL cz_add_column('settlements','notes','TEXT NULL');

-- Backfill from legacy (007) / alternate (037) shapes where present.
CALL cz_copy_col('settlements','club_id','organisation_id');
CALL cz_copy_col('settlements','status','settlement_status');
CALL cz_copy_col('settlements','amount','gross_amount');

-- Helpful index for org-scoped settlement queries.
CALL cz_add_idx('settlements','idx_settlements_org','organisation_id','(organisation_id, settlement_period_end)');

DROP PROCEDURE IF EXISTS cz_add_column;
DROP PROCEDURE IF EXISTS cz_copy_col;
DROP PROCEDURE IF EXISTS cz_add_idx;
