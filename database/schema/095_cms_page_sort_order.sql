-- Migration 095: Add sort_order to cms_pages for visual reordering
USE `courtzon_v2`;

ALTER TABLE cms_pages ADD COLUMN `sort_order` INT UNSIGNED NOT NULL DEFAULT 0 AFTER page_template;

-- Assign sequential sort_order based on current order (most-recent first by id)
SET @rn = 0;
UPDATE cms_pages SET sort_order = (@rn := @rn + 1) - 1 ORDER BY created_at DESC;
