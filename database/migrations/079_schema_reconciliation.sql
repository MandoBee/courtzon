-- ============================================================================
-- Schema Reconciliation (078 previously handled academy tables)
-- ============================================================================
-- Restores tables that code references but which are absent from deployed DBs.
-- Idempotent: all CREATE TABLEs use IF NOT EXISTS.
-- ============================================================================

-- ── notification_types (from migration 017) ────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_types (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(100) NOT NULL,
  event_key       VARCHAR(100) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT NULL,
  category        VARCHAR(50) NOT NULL DEFAULT 'system',
  priority        ENUM('low','normal','high','critical') NOT NULL DEFAULT 'normal',
  default_channels JSON NOT NULL,
  icon            VARCHAR(50) NULL DEFAULT NULL,
  enabled         TINYINT(1) NOT NULL DEFAULT 1,
  requires_action TINYINT(1) NOT NULL DEFAULT 0,
  system_managed  TINYINT(1) NOT NULL DEFAULT 0,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_by      INT UNSIGNED NULL DEFAULT NULL,
  updated_by      INT UNSIGNED NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uk_notification_type_code (code),
  UNIQUE KEY uk_notification_type_event_key (event_key),
  KEY idx_nt_category (category),
  KEY idx_nt_enabled (enabled),
  KEY idx_nt_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data applied separately via seeds/notification_types.sql

-- ── invoices (from migration 068) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED DEFAULT NULL,
  user_id         INT UNSIGNED DEFAULT NULL,
  invoice_number  VARCHAR(50) NOT NULL,
  invoice_type    ENUM('sales','purchase','credit_note','debit_note') NOT NULL DEFAULT 'sales',
  status          ENUM('draft','issued','paid','partially_paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
  issue_date      DATE NOT NULL,
  due_date        DATE DEFAULT NULL,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notes           TEXT,
  reference_type  VARCHAR(50) DEFAULT NULL,
  reference_id    INT UNSIGNED DEFAULT NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invoice_number (invoice_number),
  KEY idx_inv_org (organisation_id),
  KEY idx_inv_user (user_id),
  KEY idx_inv_status (status),
  KEY idx_inv_reference (reference_type, reference_id),
  CONSTRAINT fk_invoice_org     FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_user    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT UNSIGNED NOT NULL,
  description     VARCHAR(500) NOT NULL,
  quantity        INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_rate        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  KEY idx_ii_invoice (invoice_id),
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_rates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  rate            DECIMAL(5,2) NOT NULL,
  type            ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  country_code    CHAR(2) DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── achievements ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS achievements (
  achievement_key VARCHAR(100) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT NULL,
  icon_url        VARCHAR(500) NULL,
  max_progress    INT UNSIGNED NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (achievement_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_targeted_achievements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  achievement_key VARCHAR(100) NOT NULL,
  unlocked_at     TIMESTAMP NULL DEFAULT NULL,
  progress        INT UNSIGNED NOT NULL DEFAULT 0,
  is_hidden       TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_uta_user (user_id),
  KEY idx_uta_key (achievement_key),
  CONSTRAINT fk_uta_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uta_achievement FOREIGN KEY (achievement_key) REFERENCES achievements(achievement_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── player-match / booking-players ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_match_requests (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id       BIGINT UNSIGNED NOT NULL,
  sport_id         INT UNSIGNED DEFAULT NULL,
  branch_id        INT UNSIGNED DEFAULT NULL,
  required_players INT UNSIGNED NOT NULL DEFAULT 1,
  invited_count    INT UNSIGNED NOT NULL DEFAULT 0,
  created_by       INT UNSIGNED NOT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pmr_booking (booking_id),
  KEY idx_pmr_creator (created_by),
  KEY idx_pmr_active (is_active),
  CONSTRAINT fk_pmr_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmr_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sports (
  user_id     INT UNSIGNED NOT NULL,
  sport_id    INT UNSIGNED NOT NULL,
  skill_level VARCHAR(100) NULL DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sport_id),
  CONSTRAINT fk_us_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_us_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_players (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  player_id  INT UNSIGNED NOT NULL,
  status     ENUM('confirmed','pending','cancelled','declined') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bp_booking (booking_id),
  KEY idx_bp_player (player_id),
  CONSTRAINT fk_bp_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_bp_player  FOREIGN KEY (player_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── app_config ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_config (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key  VARCHAR(100) NOT NULL,
  config_value TEXT NULL,
  description TEXT NULL,
  platform    VARCHAR(50) NULL DEFAULT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_config_key (config_key),
  KEY idx_ac_platform (platform),
  KEY idx_ac_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── bank_accounts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_accounts (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id           INT UNSIGNED NOT NULL,
  account_holder_name VARCHAR(255) NULL,
  account_number      VARCHAR(50) NULL,
  bank_name           VARCHAR(200) NULL,
  iban                VARCHAR(50) NULL,
  swift_code          VARCHAR(20) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ba_branch (branch_id),
  CONSTRAINT fk_ba_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── referees / referee_* ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referees (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  status      ENUM('pending','approved','rejected','inactive') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_referee_user (user_id),
  KEY idx_ref_status (status),
  CONSTRAINT fk_ref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referee_availability (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referee_id  INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ra_referee (referee_id),
  CONSTRAINT fk_ra_referee FOREIGN KEY (referee_id) REFERENCES referees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referee_assignments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referee_id  INT UNSIGNED NOT NULL,
  match_type  VARCHAR(50) NULL,
  match_id    INT UNSIGNED NULL,
  status      ENUM('pending','accepted','declined','completed') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ra2_referee (referee_id),
  KEY idx_ra2_status (status),
  CONSTRAINT fk_ra2_referee FOREIGN KEY (referee_id) REFERENCES referees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── organisation tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organisation_reviews (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  rating          DECIMAL(3,2) NOT NULL,
  review_text     TEXT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_review (organisation_id, user_id),
  KEY idx_or_org (organisation_id),
  KEY idx_or_user (user_id),
  CONSTRAINT fk_or_org  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_or_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organisation_verification_log (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  status          VARCHAR(50) NULL,
  notes           TEXT NULL,
  created_by      INT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ovl_org (organisation_id),
  KEY idx_ovl_created (created_at),
  CONSTRAINT fk_ovl_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ovl_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organisation_coaches (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  coach_id        INT UNSIGNED NOT NULL,
  status          ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_oc_org_coach (organisation_id, coach_id),
  KEY idx_oc_org (organisation_id),
  KEY idx_oc_coach (coach_id),
  CONSTRAINT fk_oc_org   FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_oc_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_coach_agreements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  coach_id        INT UNSIGNED NOT NULL,
  status          ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_oca_org (organisation_id),
  KEY idx_oca_coach (coach_id),
  KEY idx_oca_status (status),
  CONSTRAINT fk_oca_org   FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_oca_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── branch tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_amenities (
  branch_id  INT UNSIGNED NOT NULL,
  amenity_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (branch_id, amenity_id),
  CONSTRAINT fk_ba_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_ba_amenity FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_holidays (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT UNSIGNED NOT NULL,
  holiday_date DATE NOT NULL,
  description  VARCHAR(255) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bh_branch (branch_id),
  KEY idx_bh_date (holiday_date),
  CONSTRAINT fk_bh_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_staff (
  branch_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  role       VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id, user_id),
  CONSTRAINT fk_bs_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── segments / academy_categories / resource_time_slots / coaches ──────────

CREATE TABLE IF NOT EXISTS segments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_seg_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resource_time_slots (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id INT UNSIGNED NOT NULL,
  date        DATE NOT NULL,
  start_time  TIME NULL,
  end_time    TIME NULL,
  status      ENUM('available','booked','blocked') NOT NULL DEFAULT 'available',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rts_resource (resource_id),
  KEY idx_rts_date (date),
  CONSTRAINT fk_rts_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coaches (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  organisation_id INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coach_user_org (user_id, organisation_id),
  KEY idx_c_org (organisation_id),
  CONSTRAINT fk_c_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_c_org  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── login_attempts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  success    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_la_identifier (identifier),
  KEY idx_la_success (success),
  KEY idx_la_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
