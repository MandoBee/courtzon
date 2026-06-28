-- Clear non-existent branding asset file references from app_settings.
-- These UUID-based file paths were seeded from a developer machine and
-- do not exist on any production or fresh deployment's filesystem.
-- The frontend falls back to bundled defaults when values are empty.

UPDATE app_settings
SET value = '""'
WHERE setting_key IN (
  'favicon_url',
  'favicon_dark_url',
  'site_logo_url',
  'site_logo_dark_url',
  'pwa_icon_192',
  'pwa_icon_512'
)
AND value LIKE '"/uploads/app_settings/%';
