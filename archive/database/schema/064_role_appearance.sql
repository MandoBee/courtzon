-- ============================================================================
-- Migration 064: Role appearance, reset baseline, role_editable flags
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

CALL cz_add_column('design_tokens', 'role_editable', 'TINYINT(1) NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS cz_add_column;

CREATE TABLE IF NOT EXISTS design_theme_reset_baseline (
  id            TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  label         VARCHAR(120) DEFAULT NULL,
  snapshot      JSON NOT NULL,
  saved_by      INT UNSIGNED DEFAULT NULL,
  saved_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_theme_overrides (
  role_id       INT UNSIGNED NOT NULL,
  token_key     VARCHAR(100) NOT NULL,
  value         VARCHAR(255) NOT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, token_key),
  INDEX idx_rto_role (role_id)
) ENGINE=InnoDB;
