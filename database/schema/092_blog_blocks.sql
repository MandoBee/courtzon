-- Migration 092: Add default blocks to the blog CMS page
-- Ensures the blog landing page renders blog post previews.
USE `courtzon_v2`;

INSERT IGNORE INTO cms_section_blocks (page_id, block_type, block_key, title, subtitle, content, sort_order, is_active)
SELECT p.id, 'hero', 'hero_blog', 'Blog',
       'Insights, tips, and stories from the CourtZon community.',
       JSON_OBJECT('heading', 'Blog', 'subheading', 'Insights, tips, and stories from the CourtZon community.', 'ctaText', '', 'ctaLink', ''),
       0, 1
FROM cms_pages p WHERE p.slug = 'blog';

INSERT IGNORE INTO cms_section_blocks (page_id, block_type, block_key, title, subtitle, content, sort_order, is_active)
SELECT p.id, 'blog_preview', 'blog_preview_main', 'Latest Posts', '', '{}', 1, 1
FROM cms_pages p WHERE p.slug = 'blog';
