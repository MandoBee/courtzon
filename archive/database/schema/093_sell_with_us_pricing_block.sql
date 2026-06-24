-- Migration 093: Add pricing block to sell-with-us CMS page
USE `courtzon_v2`;

INSERT IGNORE INTO cms_section_blocks (page_id, block_type, block_key, title, subtitle, content, sort_order, is_active)
SELECT p.id, 'pricing', 'pricing_plans', 'Plans & Pricing', 'Choose a plan that fits your business.', '{}',
       COALESCE((SELECT MAX(sort_order) FROM cms_section_blocks b WHERE b.page_id = p.id), -1) + 1, 1
FROM cms_pages p WHERE p.slug = 'sell-with-us';
