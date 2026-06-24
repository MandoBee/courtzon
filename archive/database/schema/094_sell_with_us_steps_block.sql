-- Migration 094: Add How It Works steps block to sell-with-us page
USE `courtzon_v2`;

INSERT IGNORE INTO cms_section_blocks (page_id, block_type, block_key, title, subtitle, content, sort_order, is_active)
SELECT p.id, 'steps', 'how_it_works', 'How It Works',
       'Get your shop up and running in three simple steps.',
       JSON_OBJECT('steps', JSON_ARRAY(
         JSON_OBJECT('icon', '1', 'title', 'Sign Up Free', 'description', 'Create your seller account in minutes. No upfront costs — choose the free plan to get started right away.'),
         JSON_OBJECT('icon', '2', 'title', 'List Your Products', 'description', 'Add your sports gear, equipment, and accessories. Set your prices, upload photos, and manage inventory easily.'),
         JSON_OBJECT('icon', '3', 'title', 'Start Selling', 'description', 'Your products go live on the CourtZon marketplace. Reach thousands of sports enthusiasts and start earning.')
       )),
       COALESCE((SELECT MAX(sort_order) FROM cms_section_blocks b WHERE b.page_id = p.id), -1) + 1, 1
FROM cms_pages p WHERE p.slug = 'sell-with-us';
