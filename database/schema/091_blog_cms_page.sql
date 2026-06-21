-- Migration 091: Add blog landing page to CMS pages
-- Makes /blog a CMS-managed page with blocks (replaces old hardcoded route)
USE `courtzon_v2`;

INSERT IGNORE INTO cms_pages (slug, title, is_published) VALUES ('blog', 'Blog', 1);
