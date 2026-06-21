-- Migration 068: Landing CMS blocks — layout, typography, cards (Appearance Studio → Landing)
USE courtzon_v2;

INSERT IGNORE INTO design_tokens (token_key, token_type, default_value, category, description) VALUES
  ('landing-hero-padding-y', 'size', '96px', 'landing-hero', 'Hero vertical padding'),
  ('landing-hero-title-size', 'size', 'clamp(2.25rem, 5vw, 3.75rem)', 'landing-hero', 'Hero title font size'),
  ('landing-hero-inner-gap', 'size', '24px', 'landing-hero', 'Space between hero title and subtitle'),
  ('landing-section-padding-y', 'size', '80px', 'landing-content', 'Content section vertical padding'),
  ('landing-section-title-size', 'size', 'clamp(1.875rem, 3vw, 2.25rem)', 'landing-content', 'Section heading size'),
  ('landing-section-subtitle-size', 'size', '18px', 'landing-content', 'Section subtitle size'),
  ('landing-section-header-margin', 'size', '64px', 'landing-content', 'Margin below section title block'),
  ('landing-card-radius', 'radius', 'var(--radius-lg)', 'landing-content', 'Card corner radius'),
  ('landing-card-padding', 'size', '32px', 'landing-content', 'Card inner padding'),
  ('landing-card-shadow', 'shadow', 'var(--shadow-md)', 'landing-content', 'Card shadow'),
  ('landing-card-shadow-hover', 'shadow', 'var(--shadow-lg)', 'landing-content', 'Card shadow on hover'),
  ('landing-card-border-color', 'color', 'var(--color-border)', 'landing-content', 'Card border color'),
  ('landing-card-border-hover', 'color', 'var(--color-primary)', 'landing-content', 'Card border on hover'),
  ('landing-feature-icon-size', 'size', '48px', 'landing-features', 'Feature icon box size'),
  ('landing-feature-icon-radius', 'radius', 'var(--radius-md)', 'landing-features', 'Feature icon box radius'),
  ('landing-grid-gap', 'size', '24px', 'landing-content', 'Grid gap between cards'),
  ('landing-faq-item-radius', 'radius', 'var(--radius-lg)', 'landing-faq', 'FAQ accordion item radius'),
  ('landing-pricing-highlight-scale', 'size', '1.03', 'landing-pricing', 'Scale for featured pricing plan');
