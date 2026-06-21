-- ============================================================================
-- Migration 066: Per-mode theme colors (light / dark)
-- ============================================================================
-- Surfaces, text, borders, tints, and shadows can differ between light and dark.
-- Light values stay in current_value / draft_value; dark uses *_dark columns.
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

CALL cz_add_column('design_tokens', 'current_value_dark', 'VARCHAR(255) DEFAULT NULL');
CALL cz_add_column('design_tokens', 'draft_value_dark', 'VARCHAR(255) DEFAULT NULL');

DROP PROCEDURE IF EXISTS cz_add_column;

-- Seed dark published defaults (mirror frontend index.css .dark + PREVIEW_SEMANTIC_DARK)
UPDATE design_tokens SET current_value_dark = '#0F172A' WHERE token_key = 'color-bg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#1E293B' WHERE token_key = 'color-surface' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#F1F5F9' WHERE token_key = 'color-text' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#94A3B8' WHERE token_key = 'color-text-muted' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#334155' WHERE token_key = 'color-border' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#064E3B' WHERE token_key = 'color-primary-bg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#064E3B' WHERE token_key = 'color-success-bg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#6EE7B7' WHERE token_key = 'color-success-text' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#78350F' WHERE token_key = 'color-warning-bg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#FCD34D' WHERE token_key = 'color-warning-text' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#7F1D1D' WHERE token_key = 'color-error-bg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#FCA5A5' WHERE token_key = 'color-error-text' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#1E3A8A' WHERE token_key = 'color-info-bg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#93C5FD' WHERE token_key = 'color-info-text' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '0 1px 2px rgba(0,0,0,0.2)' WHERE token_key = 'shadow-sm' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '0 4px 12px rgba(0,0,0,0.3)' WHERE token_key = 'shadow-md' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '0 12px 40px rgba(0,0,0,0.4)' WHERE token_key = 'shadow-lg' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '0 20px 60px rgba(0,0,0,0.5)' WHERE token_key = 'shadow-xl' AND current_value_dark IS NULL;
