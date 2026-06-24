-- Master translation key catalog (English defaults) + migrate existing en rows
USE courtzon_v2;

CREATE TABLE IF NOT EXISTS translation_keys (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key`           VARCHAR(500) NOT NULL,
  default_value   TEXT NOT NULL,
  module_slug     VARCHAR(100) NOT NULL,
  element_type    VARCHAR(50) NOT NULL DEFAULT 'label',
  element_label   VARCHAR(255) NOT NULL,
  component_path  VARCHAR(500) DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_translation_key (`key`(191)),
  INDEX idx_module (module_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO translation_keys (`key`, default_value, module_slug, element_type, element_label)
SELECT
  t.`key`,
  t.value,
  SUBSTRING_INDEX(t.`key`, '.', 1),
  'label',
  t.`key`
FROM translations t
WHERE t.locale = 'en';

INSERT IGNORE INTO translation_keys (`key`, default_value, module_slug, element_type, element_label)
SELECT DISTINCT
  t.`key`,
  t.`key`,
  SUBSTRING_INDEX(t.`key`, '.', 1),
  'label',
  t.`key`
FROM translations t
WHERE NOT EXISTS (
  SELECT 1 FROM translation_keys tk
  WHERE tk.`key` COLLATE utf8mb4_unicode_ci = t.`key` COLLATE utf8mb4_unicode_ci
);

DELETE FROM translations WHERE locale = 'en';

INSERT IGNORE INTO permissions (module_id, permission_key, element_type, element_label, is_ui_element, description)
SELECT pm.id, 'translations.sync', 'button', 'Sync Translation Keys', TRUE, 'Sync translation keys from code registry'
FROM permission_modules pm WHERE pm.slug = 'translations' LIMIT 1;

INSERT IGNORE INTO role_permissions (role_id, permission_id, is_granted)
SELECT 1, p.id, TRUE FROM permissions p WHERE p.permission_key = 'translations.sync';

INSERT IGNORE INTO role_permissions (role_id, permission_id, is_granted)
SELECT 20, p.id, TRUE FROM permissions p WHERE p.permission_key = 'translations.sync';
