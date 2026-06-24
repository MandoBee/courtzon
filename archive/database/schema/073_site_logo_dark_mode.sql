-- Light/dark mode site logos
USE courtzon_v2;

INSERT IGNORE INTO app_settings (setting_key, value) VALUES
  ('site_logo_dark_url', '"/images/site-logo-dark.svg"');

UPDATE app_settings
SET value = '"/images/site-logo-light.svg"'
WHERE setting_key = 'site_logo_url'
  AND value IN ('"/images/site-logo.svg"', '"/images/logo.svg"', '"/images/logo.png"');
