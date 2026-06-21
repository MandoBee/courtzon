-- ============================================================================
-- COURTZON-V2 : SPORTS, ORGANISATIONS, BRANCHES, RESOURCES (EAV)
-- Domains: Dynamic sports, org types with EAV, multi-branch, resource polym.
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: SPORTS (Admin-Manageable)
-- ============================================================================

CREATE TABLE sports (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  slug              VARCHAR(100) NOT NULL UNIQUE,
  icon              VARCHAR(100) DEFAULT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE sport_positions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sport_id          INT UNSIGNED NOT NULL,
  name              VARCHAR(100) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pos_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 2: ORGANISATION TYPES (Dynamic EAV Schema)
-- ============================================================================

CREATE TABLE organisation_types (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(50) NOT NULL UNIQUE COMMENT 'e.g. club, gym, clinic, spa',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE organisation_type_attributes (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_type_id       INT UNSIGNED NOT NULL,
  attribute_key     VARCHAR(100) NOT NULL,
  attribute_type    ENUM('text','number','boolean','select','multiselect','date','image') NOT NULL,
  options           JSON DEFAULT NULL COMMENT 'For select/multiselect: array of {value,label}',
  is_required       BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attr_orgtype FOREIGN KEY (org_type_id) REFERENCES organisation_types(id) ON DELETE CASCADE,
  UNIQUE KEY uk_attr (org_type_id, attribute_key)
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3: ORGANISATIONS
-- ============================================================================

CREATE TABLE organisations (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) NOT NULL UNIQUE,
  org_type_id       INT UNSIGNED NOT NULL,
  owner_id          INT UNSIGNED NOT NULL COMMENT 'Super admin or org owner',
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(200) NOT NULL UNIQUE,
  description       TEXT DEFAULT NULL,
  logo_url          VARCHAR(500) DEFAULT NULL,
  cover_url         VARCHAR(500) DEFAULT NULL,
  email             VARCHAR(255) DEFAULT NULL,
  phone             VARCHAR(25) DEFAULT NULL,
  website           VARCHAR(255) DEFAULT NULL,
  tax_id            VARCHAR(100) DEFAULT NULL COMMENT 'Tax/VAT registration number',
  tax_id_type       VARCHAR(50) DEFAULT NULL COMMENT 'e.g. VAT, CR, TaxID',
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  rating_avg        DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count      INT UNSIGNED NOT NULL DEFAULT 0,
  version           INT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orgtype (org_type_id),
  INDEX idx_owner (owner_id),
  INDEX idx_active (is_active),
  CONSTRAINT fk_org_type FOREIGN KEY (org_type_id) REFERENCES organisation_types(id),
  CONSTRAINT fk_org_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- EAV values for organisations
CREATE TABLE organisation_attribute_values (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL,
  attribute_id      INT UNSIGNED NOT NULL,
  value             TEXT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_attr (organisation_id, attribute_id),
  CONSTRAINT fk_eav_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_eav_attrdef FOREIGN KEY (attribute_id) REFERENCES organisation_type_attributes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Organisation financial details
CREATE TABLE organisation_financial_details (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL UNIQUE,
  bank_name         VARCHAR(200) DEFAULT NULL,
  bank_account_name VARCHAR(200) DEFAULT NULL,
  bank_account_number VARCHAR(100) DEFAULT NULL,
  iban              VARCHAR(50) DEFAULT NULL,
  swift             VARCHAR(20) DEFAULT NULL,
  billing_address   TEXT DEFAULT NULL,
  billing_email     VARCHAR(255) DEFAULT NULL,
  commission_rate   DECIMAL(5,2) DEFAULT NULL COMMENT 'Override of global commission %',
  payout_schedule   ENUM('daily','weekly','biweekly','monthly') DEFAULT 'monthly',
  currency_id       TINYINT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fin_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Operating hours (polymorphic: org/branch/resource level)
CREATE TABLE operating_hours (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_type        ENUM('organisation','branch','resource') NOT NULL,
  owner_id          INT UNSIGNED NOT NULL,
  day_of_week       TINYINT UNSIGNED NOT NULL COMMENT '0=Monday, 6=Sunday (international)',
  is_open           BOOLEAN NOT NULL DEFAULT TRUE,
  open_time         TIME DEFAULT NULL,
  close_time        TIME DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_hours (owner_type, owner_id, day_of_week),
  INDEX idx_hours_owner (owner_type, owner_id)
) ENGINE=InnoDB;

-- Holidays / special closures
CREATE TABLE holidays (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_type        ENUM('organisation','branch','resource') NOT NULL,
  owner_id          INT UNSIGNED NOT NULL,
  name              VARCHAR(200) NOT NULL COMMENT 'e.g. Ramadan, Eid, New Year',
  date_from         DATE NOT NULL,
  date_to           DATE NOT NULL,
  is_recurring      BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Recurring yearly (e.g. holidays)',
  is_open_modified  BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'TRUE if hours differ on these days',
  open_time         TIME DEFAULT NULL COMMENT 'Modified hours if is_open_modified',
  close_time        TIME DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_holiday_owner (owner_type, owner_id),
  INDEX idx_holiday_dates (date_from, date_to)
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 4: BRANCHES (Locations)
-- ============================================================================

CREATE TABLE branches (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) NOT NULL UNIQUE,
  organisation_id   INT UNSIGNED NOT NULL,
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(200) NOT NULL,
  description       TEXT DEFAULT NULL,
  email             VARCHAR(255) DEFAULT NULL,
  phone             VARCHAR(25) DEFAULT NULL,
  address_line1     VARCHAR(255) DEFAULT NULL,
  address_line2     VARCHAR(255) DEFAULT NULL,
  city              VARCHAR(100) DEFAULT NULL,
  state             VARCHAR(100) DEFAULT NULL,
  country_id        SMALLINT UNSIGNED DEFAULT NULL,
  postal_code       VARCHAR(20) DEFAULT NULL,
  latitude          DECIMAL(10,7) DEFAULT NULL,
  longitude         DECIMAL(10,7) DEFAULT NULL,
  access_type       ENUM('open','restricted','invite_only') NOT NULL DEFAULT 'open',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  rating_avg        DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count      INT UNSIGNED NOT NULL DEFAULT 0,
  images            JSON DEFAULT NULL COMMENT 'Gallery photos array',
  currency_id       TINYINT UNSIGNED DEFAULT NULL COMMENT 'Override org currency',
  timezone          VARCHAR(50) DEFAULT NULL COMMENT 'Override org timezone',
  opening_time      TIME DEFAULT '08:00:00' COMMENT 'Daily operating hours start',
  closing_time      TIME DEFAULT '22:00:00' COMMENT 'Daily operating hours end',
  version           INT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org (organisation_id),
  INDEX idx_active (is_active),
  INDEX idx_location (latitude, longitude),
  CONSTRAINT fk_branch_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE branch_player_access (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id         INT UNSIGNED NOT NULL,
  player_id         INT UNSIGNED NOT NULL,
  status            ENUM('pending','approved','rejected','banned') NOT NULL DEFAULT 'pending',
  reviewed_by       INT UNSIGNED DEFAULT NULL COMMENT 'Manager who reviewed',
  review_note       VARCHAR(500) DEFAULT NULL,
  reviewed_at       TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_player_branch (player_id, branch_id),
  CONSTRAINT fk_access_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 5: RESOURCES (Polymorphic: courts, pools, jacuzzis, etc.)
-- ============================================================================

CREATE TABLE resource_types (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(50) NOT NULL UNIQUE COMMENT 'e.g. court, pool, jacuzzi, treatment_room',
  name              VARCHAR(100) NOT NULL,
  has_slots         BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'FALSE for appointment-based',
  default_slot_duration INT UNSIGNED NOT NULL DEFAULT 30 COMMENT 'Default slot length in minutes',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE resource_type_attributes (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_type_id  INT UNSIGNED NOT NULL,
  attribute_key     VARCHAR(100) NOT NULL,
  attribute_type    ENUM('text','number','boolean','select','multiselect','date','image') NOT NULL,
  options           JSON DEFAULT NULL,
  is_required       BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_resattr_def (resource_type_id, attribute_key),
  CONSTRAINT fk_resattr_type FOREIGN KEY (resource_type_id) REFERENCES resource_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resources (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) NOT NULL UNIQUE,
  branch_id         INT UNSIGNED NOT NULL,
  resource_type_id  INT UNSIGNED NOT NULL,
  sport_id          INT UNSIGNED DEFAULT NULL COMMENT 'NULL for non-sport resources (pool, jacuzzi)',
  name              VARCHAR(200) NOT NULL,
  description       TEXT DEFAULT NULL,
  capacity          INT UNSIGNED NOT NULL DEFAULT 1,
  hourly_price      DECIMAL(12,2) DEFAULT NULL COMMENT 'Base hourly rate, overrides can apply',
  images            JSON DEFAULT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  slot_duration     INT UNSIGNED DEFAULT NULL COMMENT 'Override resource type default (minutes)',
  max_bookings_per_slot INT UNSIGNED NOT NULL DEFAULT 1,
  version           INT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branch (branch_id),
  INDEX idx_type (resource_type_id),
  INDEX idx_sport (sport_id),
  INDEX idx_active (is_active, branch_id),
  CONSTRAINT fk_res_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_type FOREIGN KEY (resource_type_id) REFERENCES resource_types(id),
  CONSTRAINT fk_res_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE resource_attribute_values (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id       INT UNSIGNED NOT NULL,
  attribute_id      INT UNSIGNED NOT NULL,
  value             TEXT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_res_attr (resource_id, attribute_id),
  CONSTRAINT fk_res_eav_res FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_eav_attr FOREIGN KEY (attribute_id) REFERENCES resource_type_attributes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resource_maintenance (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id       INT UNSIGNED NOT NULL,
  reason            VARCHAR(255) NOT NULL,
  date_from         DATETIME NOT NULL,
  date_to           DATETIME NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_resource (resource_id),
  INDEX idx_dates (date_from, date_to),
  CONSTRAINT fk_maint_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resource_unavailability (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id       INT UNSIGNED NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE DEFAULT NULL,
  start_time        TIME DEFAULT NULL,
  end_time          TIME DEFAULT NULL,
  reason            VARCHAR(500) DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_resource_date (resource_id, start_date, end_date),
  CONSTRAINT fk_unavail_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE branch_unavailability (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id         INT UNSIGNED NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE DEFAULT NULL,
  start_time        TIME DEFAULT NULL,
  end_time          TIME DEFAULT NULL,
  reason            VARCHAR(500) DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branch_date (branch_id, start_date, end_date),
  CONSTRAINT fk_unavail_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE peak_hour_pricing (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id       INT UNSIGNED NOT NULL,
  day_of_week       TINYINT UNSIGNED NOT NULL COMMENT '1=Monday .. 7=Sunday',
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  price_multiplier  DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_resource_day (resource_id, day_of_week),
  CONSTRAINT fk_peak_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 6: SETTINGS CASCADE ENGINE
-- ============================================================================

CREATE TABLE settings_definitions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key`             VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. booking_advance_days, operating_hours',
  value_type        ENUM('number','string','boolean','json','time','days_of_week') NOT NULL,
  default_value     JSON NOT NULL,
  description       VARCHAR(500) DEFAULT NULL,
  level             SET('organisation','branch','resource') NOT NULL COMMENT 'Which levels can set this',
  is_required       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE organisation_settings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL,
  setting_key       VARCHAR(100) NOT NULL,
  value             JSON NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_setting (organisation_id, setting_key),
  CONSTRAINT fk_set_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE branch_settings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id         INT UNSIGNED NOT NULL,
  setting_key       VARCHAR(100) NOT NULL,
  value             JSON NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_branch_setting (branch_id, setting_key),
  CONSTRAINT fk_set_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resource_settings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id       INT UNSIGNED NOT NULL,
  setting_key       VARCHAR(100) NOT NULL,
  value             JSON NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_res_setting (resource_id, setting_key),
  CONSTRAINT fk_set_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- TRIGGERS: Organisation soft-delete cascade
-- ============================================================================

DELIMITER //

CREATE TRIGGER trg_audit_org_update
AFTER UPDATE ON organisations
FOR EACH ROW
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state)
    VALUES (NEW.owner_id, 'organisation.soft_delete', 'organisation', NEW.id,
      JSON_OBJECT('name', OLD.name, 'status', OLD.is_active),
      JSON_OBJECT('name', NEW.name, 'status', NEW.is_active));
  END IF;
END //

DELIMITER ;
