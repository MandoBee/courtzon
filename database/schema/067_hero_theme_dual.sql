-- Migration 067: Landing hero — per-mode gradient + readable hero text on gradient bands
USE courtzon_v2;

INSERT IGNORE INTO design_tokens (token_key, token_type, default_value, category, description) VALUES
  ('hero-title-color', 'color', '#FFFFFF', 'landing-hero', 'Hero title on gradient (light mode default)'),
  ('hero-subtitle-color', 'color', '#E2E8F0', 'landing-hero', 'Hero subtitle on gradient — use light color on green, not grey muted text');

UPDATE design_tokens SET
  current_value_dark = 'linear-gradient(135deg, #022C22 0%, #064E3B 50%, #065F46 100%)'
WHERE token_key = 'gradient-hero' AND (current_value_dark IS NULL OR current_value_dark = '');

UPDATE design_tokens SET current_value_dark = '#F1F5F9' WHERE token_key = 'hero-title-color' AND current_value_dark IS NULL;
UPDATE design_tokens SET current_value_dark = '#CBD5E1' WHERE token_key = 'hero-subtitle-color' AND current_value_dark IS NULL;
