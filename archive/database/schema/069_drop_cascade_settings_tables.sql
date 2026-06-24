-- Remove unused settings cascade tables (replaced by entity forms + future app_settings)
USE courtzon_v2;

DROP TABLE IF EXISTS resource_settings;
DROP TABLE IF EXISTS branch_settings;
DROP TABLE IF EXISTS organisation_settings;
DROP TABLE IF EXISTS settings_definitions;
