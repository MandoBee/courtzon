-- ============================================================================
-- Migration 061: Org-initiated coach invites (D6)
-- ============================================================================
-- Extends coach_org_agreements with a two-way invite handshake:
--   * status        ENUM('pending','accepted','rejected') — agreement lifecycle
--   * initiated_by  ENUM('coach','org')                    — who proposed it
--   * invited_by    user id who sent the org-initiated invite (audit trail)
--
-- Existing rows are coach-initiated and effective, so they backfill to
-- status='accepted', initiated_by='coach'. Org-initiated invites are created
-- with status='pending' and only become effective once the coach accepts.
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

CALL cz_add_column('coach_org_agreements', 'status', "ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'accepted' AFTER is_active");
CALL cz_add_column('coach_org_agreements', 'initiated_by', "ENUM('coach','org') NOT NULL DEFAULT 'coach' AFTER status");
CALL cz_add_column('coach_org_agreements', 'invited_by', 'INT UNSIGNED DEFAULT NULL AFTER initiated_by');

DROP PROCEDURE IF EXISTS cz_add_column;

-- Pre-existing agreements were coach-managed and effective.
UPDATE coach_org_agreements SET status = 'accepted' WHERE status IS NULL;
