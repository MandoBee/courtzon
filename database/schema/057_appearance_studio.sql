-- ============================================================================
-- Migration 057: Appearance Studio (global theming)
-- ============================================================================
-- Extends `design_tokens` so the Super-Admin Appearance Studio can edit the
-- live app theme with a draft -> publish -> rollback flow:
--   * draft_value   -> unpublished, in-progress edit (NULL = no pending change)
--   * current_value -> the published live value (NULL = use default_value)
--   * is_published   -> whether the token's current_value is live
-- Adds `design_token_versions` to snapshot the published theme for rollback.
-- Also seeds the canonical token set (mirrors frontend/src/index.css :root) so
-- the editor and the public /public/theme endpoint have data on a fresh DB.
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

CALL cz_add_column('design_tokens', 'draft_value', 'VARCHAR(255) DEFAULT NULL');
CALL cz_add_column('design_tokens', 'is_published', 'TINYINT(1) NOT NULL DEFAULT 1');

DROP PROCEDURE IF EXISTS cz_add_column;

CREATE TABLE IF NOT EXISTS design_token_versions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label         VARCHAR(120) DEFAULT NULL,
  snapshot      JSON NOT NULL COMMENT 'Flat map { token_key: value } of the published theme at this point',
  published_by  INT UNSIGNED DEFAULT NULL,
  published_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dtv_published_at (published_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- Seed canonical tokens (mirror of frontend/src/index.css :root). INSERT IGNORE
-- keeps existing overrides intact on a populated DB.
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO design_tokens (token_key, token_type, default_value, category, description) VALUES
  ('color-primary',       'color',  '#059669',                                  'brand',      'Primary brand color'),
  ('color-primary-dark',  'color',  '#047857',                                  'brand',      'Primary (dark variant)'),
  ('color-primary-light', 'color',  '#10B981',                                  'brand',      'Primary (light variant)'),
  ('color-primary-bg',    'color',  '#ECFDF5',                                  'brand',      'Primary tinted background'),
  ('color-secondary',     'color',  '#EA580C',                                  'brand',      'Secondary brand color'),
  ('color-accent',        'color',  '#6366F1',                                  'brand',      'Accent color'),
  ('color-accent-text',   'color',  '#FFFFFF',                                  'brand',      'Text color on accent surfaces'),
  ('color-bg',            'color',  '#F9FAFB',                                  'semantic',   'App background'),
  ('color-surface',       'color',  '#FFFFFF',                                  'semantic',   'Card / surface background'),
  ('color-text',          'color',  '#111827',                                  'semantic',   'Primary text'),
  ('color-text-muted',    'color',  '#6B7280',                                  'semantic',   'Muted text'),
  ('color-border',        'color',  '#E5E7EB',                                  'semantic',   'Border color'),
  ('color-success',       'color',  '#10B981',                                  'semantic',   'Success'),
  ('color-warning',       'color',  '#F59E0B',                                  'semantic',   'Warning'),
  ('color-error',         'color',  '#EF4444',                                  'semantic',   'Error / danger'),
  ('font-body',           'font',   '''Inter'', system-ui, -apple-system, sans-serif', 'typography', 'Body font stack'),
  ('font-heading',        'font',   '''Inter'', system-ui, -apple-system, sans-serif', 'typography', 'Heading font stack'),
  ('font-google-family',  'font',   'Inter',                                    'typography', 'Google Font family to load (blank = none)'),
  ('radius-sm',           'radius', '6px',                                      'radius',     'Small radius'),
  ('radius-md',           'radius', '10px',                                     'radius',     'Medium radius'),
  ('radius-lg',           'radius', '16px',                                     'radius',     'Large radius'),
  ('radius-xl',           'radius', '24px',                                     'radius',     'Extra-large radius'),
  ('shadow-sm',           'shadow', '0 1px 2px rgba(0,0,0,0.04)',               'shadow',     'Small shadow'),
  ('shadow-md',           'shadow', '0 4px 12px rgba(0,0,0,0.06)',              'shadow',     'Medium shadow'),
  ('shadow-lg',           'shadow', '0 12px 40px rgba(0,0,0,0.08)',             'shadow',     'Large shadow'),
  ('shadow-xl',           'shadow', '0 20px 60px rgba(0,0,0,0.12)',             'shadow',     'Extra-large shadow'),
  ('gradient-primary',    'other',  'linear-gradient(135deg, #059669, #10B981)', 'gradient',  'Primary gradient'),
  ('gradient-hero',       'other',  'linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)', 'gradient', 'Hero gradient');
