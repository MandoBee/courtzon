-- ============================================================================
-- CourtZon V2 – Geographic Hierarchy: Provinces & Cities
-- Adds navigation_polygon to countries, creates provinces and cities tables
-- ============================================================================

ALTER TABLE countries
  ADD COLUMN navigation_polygon JSON DEFAULT NULL COMMENT '[[lat, lng], ...] polygon for map navigation' AFTER flag_emoji;

CREATE TABLE provinces (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  country_id        SMALLINT UNSIGNED NOT NULL,
  name              VARCHAR(120) NOT NULL,
  native_name       VARCHAR(120) DEFAULT NULL,
  code              VARCHAR(10) DEFAULT NULL COMMENT 'ISO 3166-2 code e.g. AE-DU, EG-ALX',
  type              ENUM('province','state','governorate','region','emirate','county') NOT NULL DEFAULT 'province',
  navigation_polygon JSON DEFAULT NULL COMMENT '[[lat, lng], ...] polygon for map navigation',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_province_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_provinces_country ON provinces(country_id);
CREATE INDEX idx_provinces_code ON provinces(code);

CREATE TABLE cities (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  province_id       INT UNSIGNED NOT NULL,
  name              VARCHAR(120) NOT NULL,
  native_name       VARCHAR(120) DEFAULT NULL,
  type              ENUM('city','district','town','village','neighborhood') DEFAULT NULL,
  navigation_polygon JSON DEFAULT NULL COMMENT '[[lat, lng], ...] polygon for map navigation',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_city_province FOREIGN KEY (province_id) REFERENCES provinces(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_cities_province ON cities(province_id);
