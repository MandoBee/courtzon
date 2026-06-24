-- Point existing installs at the new CourtZon wordmark asset
USE courtzon_v2;

UPDATE app_settings
SET value = '"/images/site-logo.svg"'
WHERE setting_key = 'site_logo_url'
  AND value IN ('"/images/logo.svg"', '"/images/logo.png"', '""');
