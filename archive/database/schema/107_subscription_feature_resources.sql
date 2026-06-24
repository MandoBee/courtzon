-- Migration 107: Add 'resources' feature to subscription_features
USE `courtzon_v2`;

INSERT IGNORE INTO subscription_features (feature_key, label, value_type, unit, sort_order)
VALUES ('resources', 'Resources', 'numeric', 'resources', 9);
