-- Add country_id, enlarge logo_url/cover_url for base64 data, add documents column

ALTER TABLE organisations
  ADD COLUMN country_id SMALLINT UNSIGNED DEFAULT NULL AFTER website,
  ADD INDEX idx_org_country (country_id),
  ADD CONSTRAINT fk_org_country FOREIGN KEY (country_id) REFERENCES countries(id);

ALTER TABLE organisations
  MODIFY logo_url MEDIUMTEXT DEFAULT NULL,
  MODIFY cover_url MEDIUMTEXT DEFAULT NULL;

ALTER TABLE organisations
  ADD COLUMN documents JSON DEFAULT NULL AFTER cover_url;
