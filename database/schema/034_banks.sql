-- ============================================================================
-- COURTZON-V2 : Banks and Bank Branches
-- ============================================================================

USE courtzon_v2;

CREATE TABLE IF NOT EXISTS banks (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  country_id  SMALLINT UNSIGNED NOT NULL,
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(200) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_banks_country (country_id),
  CONSTRAINT fk_banks_country FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bank_branches (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bank_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(200) NOT NULL,
  address     VARCHAR(500) DEFAULT NULL,
  swift       VARCHAR(20) DEFAULT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bb_bank (bank_id),
  CONSTRAINT fk_bb_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE organisation_financial_details
  ADD COLUMN bank_id          INT UNSIGNED DEFAULT NULL AFTER organisation_id,
  ADD COLUMN bank_branch_id   INT UNSIGNED DEFAULT NULL AFTER bank_id,
  ADD INDEX idx_ofd_bank (bank_id),
  ADD INDEX idx_ofd_branch (bank_branch_id);
