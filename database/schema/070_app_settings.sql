-- Platform-wide app configuration (site name, logo, PWA assets, domain, etc.)
USE courtzon_v2;

CREATE TABLE IF NOT EXISTS app_settings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key       VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. site_name, support_email, favicon_url',
  value             JSON NOT NULL,
  updated_by        INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO app_settings (setting_key, value) VALUES
  ('site_name',        '"CourtZon"'),
  ('support_email',    '""'),
  ('favicon_url',      '"/images/favicon-light.svg"'),
  ('favicon_dark_url', '"/images/favicon-dark.svg"'),
  ('site_logo_url',    '"/images/site-logo-light.svg"'),
  ('site_logo_dark_url', '"/images/site-logo-dark.svg"'),
  ('pwa_icon_192',     '"/icon-192.png"'),
  ('pwa_icon_512',     '"/icon-512.png"'),
  ('domain_name',      '""'),
  ('site_tagline',     '"Book. Play. Connect."'),
  ('meta_description', '""'),
  ('maintenance_mode', 'false');
