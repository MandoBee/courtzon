-- Migration 089: Ensure missing CMS pages (mission, team) exist and are published
-- These are referenced by the landing nav/footer but may be missing or unpublished.
USE `courtzon_v2`;

INSERT IGNORE INTO cms_pages (slug, title, is_published) VALUES
('mission', 'Mission & Vision', 1),
('team',    'Our Team',        1);

UPDATE cms_pages SET is_published = 1 WHERE slug IN ('mission', 'team') AND is_published = 0;
