-- Migration 090: Remove legacy orphaned CMS pages
-- Keeps only the pages used by the nav/footer: about, privacy, terms, contact, mission, team, faq, sell-with-us, home
USE `courtzon_v2`;

DELETE FROM cms_section_blocks WHERE page_id IN (1, 2, 3, 4);
DELETE FROM cms_sections WHERE page_id IN (1, 2, 3, 4);
DELETE FROM cms_pages WHERE id IN (1, 2, 3, 4);
