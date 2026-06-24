-- ============================================================================
-- CourtZon V2 – Geo Slugs
-- Populates slugs for countries, provinces, cities and adds unique indexes
-- ============================================================================

ALTER TABLE countries
  ADD COLUMN slug VARCHAR(120) DEFAULT NULL AFTER name;

ALTER TABLE provinces
  ADD COLUMN slug VARCHAR(120) DEFAULT NULL AFTER name;

ALTER TABLE cities
  ADD COLUMN slug VARCHAR(120) DEFAULT NULL AFTER name;

-- 1. Populate slugs for all countries where missing
UPDATE countries
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(REPLACE(name, ' ', '-')), '[^a-z0-9-]', ''), '-+', '-'))
WHERE slug IS NULL;

-- 2. Populate slugs for all provinces where missing
UPDATE provinces
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(REPLACE(name, ' ', '-')), '[^a-z0-9-]', ''), '-+', '-'))
WHERE slug IS NULL;

-- 3. Populate slugs for all cities where missing
UPDATE cities
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(REPLACE(name, ' ', '-')), '[^a-z0-9-]', ''), '-+', '-'))
WHERE slug IS NULL;

-- 4. Add unique indexes
CREATE UNIQUE INDEX uq_countries_slug ON countries(slug);
CREATE UNIQUE INDEX uq_provinces_slug ON provinces(country_id, slug);
CREATE UNIQUE INDEX uq_cities_slug ON cities(province_id, slug);
