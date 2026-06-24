-- ============================================================================
-- COURTZON-V2 : CORE FOUNDATION SCHEMA
-- Domains: System, i18n, Design Tokens, Countries, Currencies, Users, Auth
-- ============================================================================

CREATE DATABASE IF NOT EXISTS courtzon_v2
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: SYSTEM CONFIGURATION
-- ============================================================================

CREATE TABLE system_settings (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key`         VARCHAR(100) NOT NULL UNIQUE,
  value         JSON NOT NULL,
  description   VARCHAR(500) DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE cron_jobs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_name        VARCHAR(100) NOT NULL UNIQUE,
  handler         VARCHAR(255) NOT NULL COMMENT 'Service/method to call',
  cron_expression VARCHAR(100) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMP NULL DEFAULT NULL,
  last_error      TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE scheduled_jobs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_type        VARCHAR(100) NOT NULL,
  payload         JSON NOT NULL,
  priority        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status          ENUM('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  scheduled_at    TIMESTAMP NOT NULL,
  started_at      TIMESTAMP NULL DEFAULT NULL,
  completed_at    TIMESTAMP NULL DEFAULT NULL,
  error_message   TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_scheduled (scheduled_at)
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 2: INTERNATIONALIZATION (i18n)
-- ============================================================================

CREATE TABLE languages (
  id            SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(5) NOT NULL UNIQUE COMMENT 'e.g. en, ar, fr',
  name          VARCHAR(50) NOT NULL,
  native_name   VARCHAR(50) NOT NULL,
  is_rtl        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE translations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key`         VARCHAR(500) NOT NULL COMMENT 'Dot-notation key (e.g. auth.login.title)',
  locale        VARCHAR(5) NOT NULL,
  value         TEXT NOT NULL,
  is_auto       BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'TRUE if machine-translated',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_translation (locale, `key`(191)),
  INDEX idx_key (`key`(191))
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3: COUNTRIES & CURRENCIES
-- ============================================================================

CREATE TABLE countries (
  id              SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  iso_code        CHAR(2) NOT NULL UNIQUE,
  iso_code_3      CHAR(3) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  native_name     VARCHAR(100) DEFAULT NULL,
  phone_code      VARCHAR(10) NOT NULL COMMENT 'e.g. +971, +20',
  phone_max_length TINYINT UNSIGNED NOT NULL DEFAULT 15,
  phone_min_length TINYINT UNSIGNED NOT NULL DEFAULT 7,
  default_locale  VARCHAR(5) NOT NULL DEFAULT 'en',
  default_currency CHAR(3) NOT NULL,
  flag_emoji      VARCHAR(10) DEFAULT NULL,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE currencies (
  id              TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            CHAR(3) NOT NULL UNIQUE,
  name            VARCHAR(50) NOT NULL,
  symbol          VARCHAR(10) NOT NULL,
  decimal_places  TINYINT UNSIGNED NOT NULL DEFAULT 2,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE exchange_rates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_currency   CHAR(3) NOT NULL,
  to_currency     CHAR(3) NOT NULL,
  rate            DECIMAL(18,8) NOT NULL,
  recorded_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source          VARCHAR(50) DEFAULT 'manual',
  UNIQUE KEY uk_rate (from_currency, to_currency, recorded_at)
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 4: DESIGN TOKENS (Super Admin Theme Control)
-- ============================================================================

CREATE TABLE design_tokens (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_key       VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. color-primary, radius-sm, font-body',
  token_type      ENUM('color','size','radius','font','shadow','spacing','other') NOT NULL,
  default_value   VARCHAR(100) NOT NULL,
  current_value   VARCHAR(100) DEFAULT NULL COMMENT 'Overridden by super admin; NULL = use default',
  category        VARCHAR(50) DEFAULT 'general',
  description     VARCHAR(255) DEFAULT NULL,
  updated_by      INT UNSIGNED DEFAULT NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 5: USERS & AUTH
-- ============================================================================

CREATE TABLE users (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) NOT NULL UNIQUE COMMENT 'UUID for external references',
  country_id        SMALLINT UNSIGNED NOT NULL,
  phone_number      VARCHAR(20) NOT NULL,
  full_phone        VARCHAR(25) NOT NULL UNIQUE COMMENT 'country_code + phone_number (E.164)',
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  full_name         VARCHAR(150) NOT NULL,
  avatar_url        VARCHAR(500) DEFAULT NULL,
  gender            ENUM('male','female') NOT NULL,
  birth_date        DATE DEFAULT NULL,
  language_id       SMALLINT UNSIGNED DEFAULT NULL,
  timezone          VARCHAR(50) DEFAULT 'UTC',
  dark_mode         ENUM('light','dark','system') NOT NULL DEFAULT 'system',
  account_status    ENUM('active','suspended','banned','deleted') NOT NULL DEFAULT 'active',
  last_login_at     TIMESTAMP NULL DEFAULT NULL,
  last_login_ip     VARCHAR(45) DEFAULT NULL,
  is_phone_verified BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Auto-verified on signup',
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  version           INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic locking',
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_country (country_id),
  INDEX idx_status (account_status),
  INDEX idx_full_phone (full_phone),
  CONSTRAINT fk_user_country FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB;

CREATE TABLE user_devices (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  device_fingerprint VARCHAR(255) NOT NULL,
  device_name       VARCHAR(255) DEFAULT NULL,
  device_type       ENUM('mobile','tablet','desktop','other') DEFAULT NULL,
  os                VARCHAR(100) DEFAULT NULL,
  browser           VARCHAR(100) DEFAULT NULL,
  ip_address        VARCHAR(45) NOT NULL,
  user_agent        TEXT DEFAULT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_seen_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_fingerprint (device_fingerprint),
  CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  device_id         INT UNSIGNED DEFAULT NULL,
  session_token     VARCHAR(255) NOT NULL UNIQUE,
  refresh_token     VARCHAR(255) NOT NULL UNIQUE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  ip_address        VARCHAR(45) NOT NULL,
  user_agent        TEXT DEFAULT NULL,
  expires_at        TIMESTAMP NOT NULL,
  last_activity_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_revoked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_device FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE email_verification_tokens (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  token             VARCHAR(255) NOT NULL UNIQUE,
  expires_at        TIMESTAMP NOT NULL,
  is_used           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  CONSTRAINT fk_email_ver_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 6: PLAYER PROFILES
-- ============================================================================

CREATE TABLE player_levels (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  level_order       TINYINT UNSIGNED NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE player_profiles (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL UNIQUE,
  main_sport_id     INT UNSIGNED DEFAULT NULL,
  main_level_id     INT UNSIGNED DEFAULT NULL COMMENT 'Set at registration; non-editable by player',
  is_coach          BOOLEAN NOT NULL DEFAULT FALSE,
  is_seller         BOOLEAN NOT NULL DEFAULT FALSE,
  bio               TEXT DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_player_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 7: NOTIFICATION SYSTEM
-- ============================================================================

CREATE TABLE notification_categories (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(50) NOT NULL UNIQUE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE notification_actions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action_key        VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. view_booking, open_chat, view_tournament',
  route_pattern     VARCHAR(255) DEFAULT NULL COMMENT 'Frontend route with params placeholder',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  category_id       INT UNSIGNED DEFAULT NULL,
  action_id         INT UNSIGNED DEFAULT NULL,
  action_payload    JSON DEFAULT NULL COMMENT 'Params for the action route',
  title             VARCHAR(255) NOT NULL,
  body              TEXT DEFAULT NULL,
  icon              VARCHAR(100) DEFAULT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  is_pushed         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at           TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_id, is_read),
  INDEX idx_created (created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_category FOREIGN KEY (category_id) REFERENCES notification_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_notif_action FOREIGN KEY (action_id) REFERENCES notification_actions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notification_queue (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  notification_id   BIGINT UNSIGNED DEFAULT NULL,
  channel           ENUM('push','email','sms','in_app') NOT NULL,
  status            ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  retry_count       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_retries       TINYINT UNSIGNED NOT NULL DEFAULT 3,
  error_message     TEXT DEFAULT NULL,
  scheduled_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at           TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status, scheduled_at),
  CONSTRAINT fk_queue_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_notification_preferences (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  category_id       INT UNSIGNED NOT NULL,
  is_allowed        BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_cat (user_id, category_id),
  CONSTRAINT fk_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pref_cat FOREIGN KEY (category_id) REFERENCES notification_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 8: AUDIT & LOGGING
-- ============================================================================

CREATE TABLE audit_logs (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id          INT UNSIGNED DEFAULT NULL COMMENT 'NULL for system actions',
  action            VARCHAR(100) NOT NULL COMMENT 'e.g. booking.create, user.update, org.delete',
  entity_type       VARCHAR(100) NOT NULL COMMENT 'e.g. booking, user, organisation',
  entity_id         INT UNSIGNED DEFAULT NULL,
  before_state      JSON DEFAULT NULL,
  after_state       JSON DEFAULT NULL,
  reason            VARCHAR(500) DEFAULT NULL COMMENT 'Required for destructive actions',
  ip_address        VARCHAR(45) DEFAULT NULL,
  user_agent        TEXT DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_actor (actor_id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_action (action),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED DEFAULT NULL,
  activity_type     VARCHAR(100) NOT NULL,
  description       VARCHAR(500) DEFAULT NULL,
  metadata          JSON DEFAULT NULL,
  ip_address        VARCHAR(45) DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_type (activity_type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE revert_logs (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  super_admin_id    INT UNSIGNED NOT NULL,
  audit_log_id      BIGINT UNSIGNED NOT NULL COMMENT 'The original action being reverted',
  reason            VARCHAR(500) NOT NULL,
  reverted_state    JSON DEFAULT NULL COMMENT 'Snapshot after revert',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_revert_admin FOREIGN KEY (super_admin_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_revert_audit FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- TRIGGERS: Core Audit Trail
-- ============================================================================

DELIMITER //

CREATE TRIGGER trg_audit_user_update
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
    VALUES (NEW.id, 'user.soft_delete', 'user', NEW.id,
      JSON_OBJECT('status', OLD.account_status, 'full_name', OLD.full_name),
      JSON_OBJECT('status', NEW.account_status, 'full_name', NEW.full_name),
      'User self-deleted');
  END IF;
END //

DELIMITER ;

-- ============================================================================
-- EVENTS: Cleanup & Maintenance
-- ============================================================================

DELIMITER //

CREATE EVENT ev_cleanup_expired_sessions
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
  UPDATE user_sessions
  SET is_revoked = TRUE
  WHERE expires_at < NOW() AND is_revoked = FALSE;
END //

CREATE EVENT ev_process_notification_queue
ON SCHEDULE EVERY 1 MINUTE
STARTS CURRENT_TIMESTAMP
DO
BEGIN
  UPDATE notification_queue
  SET status = 'sent', sent_at = NOW()
  WHERE status = 'pending'
    AND scheduled_at <= NOW()
    AND retry_count < max_retries
  LIMIT 100;
END //

DELIMITER ;

-- ============================================================================
-- INDEXES: Additional performance
-- ============================================================================

CREATE INDEX idx_sessions_active ON user_sessions(user_id, is_revoked, expires_at);
CREATE INDEX idx_notifications_push ON notifications(user_id, is_pushed, created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
