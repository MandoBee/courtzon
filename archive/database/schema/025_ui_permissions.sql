-- ============================================================================
-- COURTZON-V2 : UI PERMISSIONS — FRONTEND ELEMENT VISIBILITY CONTROL
-- ============================================================================

USE courtzon_v2;

ALTER TABLE permissions
  ADD COLUMN element_type   ENUM('button','tab','page','section','action') DEFAULT NULL COMMENT 'UI element type for frontend gating',
  ADD COLUMN element_label  VARCHAR(255) DEFAULT NULL COMMENT 'Human-readable label for admin UI',
  ADD COLUMN is_ui_element  BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether this permission gates a UI element',
  ADD COLUMN component_path VARCHAR(255) DEFAULT NULL COMMENT 'Optional reference to component file path',
  ADD INDEX idx_ui_element (is_ui_element);
