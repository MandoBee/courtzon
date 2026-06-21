-- Migration 106: Normalize subscription plan features into relational tables
-- Replaces the free-form JSON `features` column with a normalized schema:
--   subscription_features       – master feature definitions (key, label, type, unit)
--   subscription_plan_features  – pivot table assigning values per plan
USE `courtzon_v2`;

CREATE TABLE IF NOT EXISTS subscription_features (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  feature_key VARCHAR(100) NOT NULL UNIQUE,
  label       VARCHAR(255) NOT NULL,
  value_type  ENUM('numeric','boolean','tier','text') NOT NULL DEFAULT 'boolean',
  unit        VARCHAR(50) DEFAULT NULL COMMENT 'Used by getPlanNumericLimit() joins',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_plan_features (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id     BIGINT UNSIGNED NOT NULL,
  feature_id  INT UNSIGNED NOT NULL,
  value       VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_plan_feature (plan_id, feature_id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (feature_id) REFERENCES subscription_features(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed master feature definitions (based on keys used across all existing plans + FEATURE_LABELS)
INSERT INTO subscription_features (feature_key, label, value_type, unit, sort_order) VALUES
  ('branches', 'Branches', 'numeric', 'branches', 1),
  ('staff', 'Staff members', 'numeric', 'staff', 2),
  ('products', 'Products', 'numeric', 'products', 3),
  ('support', 'Support', 'tier', NULL, 4),
  ('analytics', 'Analytics & reports', 'boolean', NULL, 5),
  ('custom_branding', 'Custom branding', 'boolean', NULL, 6),
  ('academies', 'Academies', 'numeric', 'academies', 7),
  ('tournaments', 'Tournaments', 'numeric', 'tournaments', 8);

-- Migrate existing JSON features to the normalized pivot table.
-- JSON_UNQUOTE handles strings, numbers, and booleans uniformly.
INSERT INTO subscription_plan_features (plan_id, feature_id, value)
SELECT sp.id, sf.id, JSON_UNQUOTE(JSON_EXTRACT(sp.features, CONCAT('$.', sf.feature_key)))
FROM subscription_plans sp
CROSS JOIN subscription_features sf
WHERE sp.features IS NOT NULL
  AND JSON_EXTRACT(sp.features, CONCAT('$.', sf.feature_key)) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(sp.features, CONCAT('$.', sf.feature_key))) IS NOT NULL;
