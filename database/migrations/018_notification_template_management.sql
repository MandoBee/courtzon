-- Migration 018: Template Management Enhancements
-- Adds columns required by the Sprint 3 template management system.
-- Preserves all existing data and backward compatibility.

ALTER TABLE `notification_templates`
  ADD COLUMN `code` VARCHAR(100) NULL DEFAULT NULL AFTER `id`,
  ADD COLUMN `notification_type_id` INT UNSIGNED NULL DEFAULT NULL AFTER `code`,
  ADD COLUMN `name` VARCHAR(255) NULL DEFAULT NULL AFTER `notification_type_id`,
  ADD COLUMN `description` TEXT NULL DEFAULT NULL AFTER `name`,
  ADD COLUMN `content_format` ENUM('handlebars', 'text', 'html') NOT NULL DEFAULT 'handlebars' AFTER `body_template`,
  ADD COLUMN `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft' AFTER `is_active`,
  ADD COLUMN `is_default` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`,
  ADD COLUMN `variables` JSON NULL DEFAULT NULL AFTER `image_url`,
  ADD INDEX `idx_template_code` (`code`),
  ADD INDEX `idx_template_notification_type` (`notification_type_id`),
  ADD UNIQUE KEY `uk_template_code` (`code`),
  ADD UNIQUE KEY `uk_template_type_locale_version` (`notification_type_id`, `locale`, `version`);
