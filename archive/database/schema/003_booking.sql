-- ============================================================================
-- COURTZON-V2 : BOOKING ENGINE
-- Matches the physical database schema (courtzon.sql dump).
-- ============================================================================

USE courtzon_v2;

CREATE TABLE bookings (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id                 CHAR(36) DEFAULT NULL,
  user_id                   BIGINT UNSIGNED NOT NULL,
  club_id                   BIGINT UNSIGNED NOT NULL,
  court_id                  BIGINT UNSIGNED NOT NULL,
  booking_type              ENUM('public_match','private_match','academy','clinic','coach_session') NOT NULL,
  visibility                ENUM('public','private') DEFAULT 'public',
  booking_date              DATE NOT NULL,
  start_time                TIME NOT NULL,
  end_time                  TIME NOT NULL,
  total_amount              DECIMAL(12,2) NOT NULL,
  commission_rate           DECIMAL(5,2) DEFAULT 0.00,
  commission_amount         DECIMAL(12,2) DEFAULT 0.00,
  net_amount                DECIMAL(12,2) DEFAULT 0.00,
  plan_name                 VARCHAR(100) DEFAULT NULL,
  club_amount               DECIMAL(12,2) DEFAULT 0.00,
  payment_status            ENUM('pending','paid','partial','refunded','failed') DEFAULT 'pending',
  booking_status            ENUM('pending','confirmed','cancelled','completed','expired') DEFAULT 'pending',
  cancellation_policy_snapshot JSON DEFAULT NULL,
  notes                     TEXT DEFAULT NULL,
  version                   INT DEFAULT 1,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user (user_id),
  INDEX idx_club (club_id),
  INDEX idx_court (court_id),
  INDEX idx_date (booking_date),
  INDEX idx_status (booking_status, payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE booking_slots (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id      BIGINT UNSIGNED NOT NULL,
  resource_id     BIGINT UNSIGNED NOT NULL,
  booking_date    DATE NOT NULL,
  slot_start      TIME NOT NULL,
  slot_end        TIME NOT NULL,
  is_available    TINYINT(1) DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_slot (resource_id, booking_date, slot_start),
  INDEX idx_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE booking_participants (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED DEFAULT NULL,
  full_name   VARCHAR(150) DEFAULT NULL,
  email       VARCHAR(255) DEFAULT NULL,
  phone       VARCHAR(25) DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE booking_invitations (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id      BIGINT UNSIGNED NOT NULL,
  invited_user_id BIGINT UNSIGNED DEFAULT NULL,
  email           VARCHAR(255) DEFAULT NULL,
  status          ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  token           VARCHAR(255) NOT NULL UNIQUE,
  responded_at    TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE booking_cancellations (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id    BIGINT UNSIGNED NOT NULL UNIQUE,
  cancelled_by  BIGINT UNSIGNED NOT NULL,
  reason        VARCHAR(500) NOT NULL,
  refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  refund_status ENUM('pending','processed','skipped') NOT NULL DEFAULT 'pending',
  processed_at  TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cancellation_policies (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  club_id             BIGINT UNSIGNED NOT NULL,
  cancellation_window_minutes INT NOT NULL,
  refund_percent      DECIMAL(5,2) NOT NULL,
  is_active           TINYINT(1) DEFAULT 1,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_club (club_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
