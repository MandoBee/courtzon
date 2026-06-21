-- Light/dark mode favicons
USE courtzon_v2;

INSERT IGNORE INTO app_settings (setting_key, value) VALUES
  ('favicon_dark_url', '"/images/favicon-dark.svg"');

UPDATE app_settings
SET value = '"/images/favicon-light.svg"'
WHERE setting_key = 'favicon_url'
  AND value IN ('"/favicon.svg"', '"/images/favicon.ico"', '""');
