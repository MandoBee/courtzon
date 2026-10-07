-- Migration 196: Add contact_info + location_map blocks to the Contact page
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Make the public /contact page fully CMS-driven for contact details and
--   location (data seeded by the CMS block redesign task):
--     * cont_info (contact_info)  sort_order 1 - email / phone / address cards
--     * cont_map  (location_map)  sort_order 2 - keyless Google Maps embed
--   The existing cont_form (contact_form) moves from sort_order 1 to 3 so the
--   final block order is:
--     hero(0) -> contact_info(1) -> location_map(2) -> contact_form(3)
--
-- CONTENT SNAPSHOT
--   Email    : mniazyy@gmail.com
--   Phone    : +201012637733
--   Address  : 4 Galal st., Faisal, Giza, Egypt
--   Map pin  : 29.99724091380863, 31.141807625195952 (keyless output=embed)
--
-- SAFETY / IDEMPOTENCY
--   * Fully additive: two INSERT ... SELECT statements guarded by
--     (page slug 'contact' + block_key); re-runs insert nothing.
--   * The sort_order UPDATE touches ONLY rows of the `contact` page.
--   * No schema change (block_type is varchar(50); content is JSON longtext),
--     therefore no baseline regeneration is required.
--   * Fresh environments receive the same rows from
--     database/seeds/001_baseline.sql - the Docker entrypoint stamps this
--     migration instead of executing it right after a baseline import, so the
--     seed is authoritative for new installs.
--   * block_key values (cont_info / cont_map) match the seed rows.

-- ── 1. contact_info block (email / phone / address cards) ────────────────────

INSERT INTO `cms_section_blocks`
  (`page_id`, `block_type`, `block_key`, `title`, `subtitle`, `content`, `style_config`, `sort_order`, `is_active`)
SELECT
  p.`id`,
  'contact_info',
  'cont_info',
  'Contact Information',
  'Multiple ways to reach the CourtZon team.',
  '{"items":[{"type":"email","title":"Email","value":"mniazyy@gmail.com","icon":"mail","link":"mailto:mniazyy@gmail.com"},{"type":"phone","title":"Phone","value":"+201012637733","icon":"phone","link":"tel:+201012637733"},{"type":"location","title":"Address","value":"4 Galal st., Faisal, Giza, Egypt","icon":"map-pin","link":"https://www.google.com/maps?q=29.99724091380863,31.141807625195952"}]}',
  NULL,
  1,
  1
FROM `cms_pages` p
WHERE p.`slug` = 'contact'
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT `page_id`, `block_key` FROM `cms_section_blocks`) b
    WHERE b.`page_id` = p.`id` AND b.`block_key` = 'cont_info'
  );

-- ── 2. location_map block (keyless Google Maps embed) ────────────────────────

INSERT INTO `cms_section_blocks`
  (`page_id`, `block_type`, `block_key`, `title`, `subtitle`, `content`, `style_config`, `sort_order`, `is_active`)
SELECT
  p.`id`,
  'location_map',
  'cont_map',
  'Our Location',
  'Visit us at our office in Faisal, Giza.',
  '{"address":"4 Galal st., Faisal, Giza, Egypt","mapEmbedUrl":"https://maps.google.com/maps?q=29.99724091380863,31.141807625195952&z=16&output=embed","mapLink":"https://www.google.com/maps?q=29.99724091380863,31.141807625195952","latitude":"29.99724091380863","longitude":"31.141807625195952"}',
  NULL,
  2,
  1
FROM `cms_pages` p
WHERE p.`slug` = 'contact'
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT `page_id`, `block_key` FROM `cms_section_blocks`) b
    WHERE b.`page_id` = p.`id` AND b.`block_key` = 'cont_map'
  );

-- ── 3. Deterministic block order on the contact page ─────────────────────────

UPDATE `cms_section_blocks` b
JOIN `cms_pages` p ON p.`id` = b.`page_id` AND p.`slug` = 'contact'
SET b.`sort_order` = CASE b.`block_key`
  WHEN 'cont_hero' THEN 0
  WHEN 'cont_info' THEN 1
  WHEN 'cont_map'  THEN 2
  WHEN 'cont_form' THEN 3
  ELSE b.`sort_order`
END
WHERE b.`block_key` IN ('cont_hero', 'cont_info', 'cont_map', 'cont_form');
